// ============================================================
// CODEX MARKET DATA — live data for Phase 2, behind the "codex" flag.
//
// How site-side pairing works:
//   * Coins launch on pump.fun and trade in SOL. pump.fun knows nothing about commodities.
//   * When a coin is launched from this site, the proxy stores { mint, commodityId } in a
//     registry (GET /registry). That registry is the ONLY source of which coins are ours
//     and which board each one is on.
//   * Prices: Codex gives the coin's USD bars on its pump.fun pair. For the commodity view
//     we fetch the board token's USD bars at the same resolution (the Backed commodity's
//     mint, or our House token's mint) and divide close-by-close.
//
// All Codex calls go through the /proxy worker, which adds the API key.
//
// Codex (graph.codex.io): filterTokens, getBars / onBarsUpdated, getTokenBars,
// onEventsCreated, holders. Verify field names against https://docs.codex.io before go-live.
// Fallback: Birdeye Data Services (REST /defi/v3/ohlcv/pair + WebSocket SUBSCRIBE_PRICE / SUBSCRIBE_TXS).
// For trades only, PumpPortal's data socket (wss://pumpportal.fun/api/data, subscribeTokenTrade)
// also works for coins still on the pump.fun curve.
// ============================================================
import { byId } from "../config/commodities.js";
import { flags } from "../config/flags.js";
import { hub } from "./subscriptions.js";
import { RESOLUTION_SECONDS, } from "./MarketData.js";
const SOLANA_NETWORK_ID = 1399811149;
export class CodexMarketData {
    constructor() {
        this.state = "offline";
        this.ws = null;
        this.backoff = 1000;
        this.wsSubs = new Map();
        this.registry = new Map();
        this.registryAt = 0;
        this.commodityPrice = new Map();
    }
    // ---------- plumbing ----------
    async gql(query, variables = {}) {
        if (!flags.proxyUrl)
            throw new Error("PIT_CONFIG.proxyUrl is not set");
        const res = await fetch(`${flags.proxyUrl}/graphql`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ query, variables }),
        });
        const json = (await res.json());
        if (json.errors?.length)
            throw new Error(json.errors[0].message);
        if (!json.data)
            throw new Error("empty response");
        this.state = "live";
        return json.data;
    }
    async loadRegistry(force = false) {
        if (!force && Date.now() - this.registryAt < 15000)
            return this.registry;
        const res = await fetch(`${flags.proxyUrl}/registry`);
        const list = (await res.json());
        this.registry = new Map(list.filter((e) => byId(e.commodityId)).map((e) => [e.mint, e]));
        this.registryAt = Date.now();
        return this.registry;
    }
    /** USD price of the board's token (tokenized commodity, or our House token). */
    async boardPrice(commodityId) {
        const com = byId(commodityId);
        if (!com?.mint)
            return 0;
        const data = await this.gql(`query P($addr: String!) { getTokenPrices(inputs: [{ address: $addr, networkId: ${SOLANA_NETWORK_ID} }]) { priceUsd } }`, { addr: com.mint });
        const p = data.getTokenPrices[0]?.priceUsd ?? 0;
        this.commodityPrice.set(commodityId, p);
        return p;
    }
    // ---------- coins ----------
    async listCoins(filter = {}) {
        const reg = await this.loadRegistry();
        if (!reg.size)
            return [];
        const ids = [...reg.keys()].map((m) => `${m}:${SOLANA_NETWORK_ID}`);
        const data = await this.gql(`query List($tokens: [String]) {
        filterTokens(tokens: $tokens, limit: 200) {
          results {
            token { address name symbol info { imageSmallUrl } createdAt }
            pair { address }
            priceUSD marketCap volume24 change24 holders
            launchpad { graduationPercent completed migrated }
          }
        }
      }`, { tokens: ids });
        const prices = new Map();
        for (const e of reg.values())
            if (!prices.has(e.commodityId))
                prices.set(e.commodityId, await this.boardPrice(e.commodityId).catch(() => 0));
        const coins = data.filterTokens.results
            .map((r) => {
            const e = reg.get(r.token.address);
            return e ? this.toCoin(r, e, prices.get(e.commodityId) ?? 0) : null;
        })
            .filter((c) => !!c);
        return applyFilter(coins, filter);
    }
    toCoin(r, e, boardUsd) {
        const grad = r.launchpad?.graduationPercent ?? 0;
        const migrated = !!r.launchpad?.migrated;
        const priceUsd = Number(r.priceUSD ?? 0);
        return {
            mint: r.token.address,
            pairAddress: r.pair?.address ?? "",
            name: r.token.name,
            ticker: r.token.symbol,
            image: r.token.info?.imageSmallUrl ?? "",
            commodityId: e.commodityId,
            status: migrated ? "graduated" : grad > 85 ? "graduating" : "curve",
            bondingProgress: migrated ? 1 : grad / 100,
            priceUsd,
            priceQuote: boardUsd > 0 ? priceUsd / boardUsd : 0,
            marketCapUsd: Number(r.marketCap ?? 0),
            volume24hUsd: Number(r.volume24 ?? 0),
            change24hPct: Number(r.change24 ?? 0) * 100,
            holders: Number(r.holders ?? 0),
            createdAt: e.createdAt || (r.token.createdAt ?? 0) * 1000,
            rewards: !!e.rewards,
            spark: [],
        };
    }
    async getCoin(mint) {
        const reg = await this.loadRegistry();
        if (!reg.has(mint))
            return null; // not launched from this site
        const list = await this.listCoins({ search: mint, limit: 1 });
        const c = list[0];
        if (!c)
            return null;
        return { ...c, description: "", creator: "", supply: 1000000000, quoteInCurve: 0, quoteToGraduate: 0, socials: {} };
    }
    // ---------- bars (USD, or converted into the board's commodity) ----------
    async getBars(pairAddress, resolution, from, to, denom) {
        const usd = await this.pairBars(pairAddress, resolution, from, to);
        if (denom === "usd")
            return usd;
        const commodityId = await this.commodityForPair(pairAddress);
        const com = commodityId ? byId(commodityId) : null;
        if (!com?.mint)
            return usd; // board price source not configured yet
        const board = await this.tokenBars(com.mint, resolution, from, to);
        const byT = new Map(board.map((b) => [b.t, b.c]));
        let last = board[0]?.c ?? 0;
        return usd.map((b) => {
            const p = byT.get(b.t) ?? last;
            last = p || last;
            if (!last)
                return b;
            return { t: b.t, o: b.o / last, h: b.h / last, l: b.l / last, c: b.c / last, v: b.v };
        });
    }
    async commodityForPair(pairAddress) {
        // listCoins caches pair → coin via registry; fall back to a lookup.
        const coins = await this.listCoins({});
        return coins.find((c) => c.pairAddress === pairAddress)?.commodityId ?? null;
    }
    async pairBars(pairAddress, resolution, from, to) {
        const data = await this.gql(`query Bars($symbol: String!, $from: Int!, $to: Int!, $res: String!) {
        getBars(symbol: $symbol, from: $from, to: $to, resolution: $res, currencyCode: "USD") { t o h l c volume }
      }`, { symbol: `${pairAddress}:${SOLANA_NETWORK_ID}`, from, to, res: codexResolution(resolution) });
        return toBars(data.getBars);
    }
    async tokenBars(mint, resolution, from, to) {
        const data = await this.gql(`query TB($symbol: String!, $from: Int!, $to: Int!, $res: String!) {
        getTokenBars(symbol: $symbol, from: $from, to: $to, resolution: $res, currencyCode: "USD") { t o h l c volume }
      }`, { symbol: `${mint}:${SOLANA_NETWORK_ID}`, from, to, res: codexResolution(resolution) });
        return toBars(data.getTokenBars);
    }
    subscribeBars(pairAddress, resolution, denom, onBar) {
        const key = `bars:${pairAddress}:${resolution}`;
        let divisor = 1;
        let poll = 0;
        if (denom === "quote") {
            const refresh = async () => {
                const id = await this.commodityForPair(pairAddress).catch(() => null);
                if (id)
                    divisor = (await this.boardPrice(id).catch(() => 0)) || divisor;
            };
            void refresh();
            poll = window.setInterval(refresh, 10000);
        }
        const off = hub.subscribe(key, (emit) => this.wsSubscribe(key, `subscription Bars($pairId: String!) {
            onBarsUpdated(pairId: $pairId) {
              aggregates { r${resolution.toLowerCase()} { usd { t o h l c volume } } }
            }
          }`, { pairId: `${pairAddress}:${SOLANA_NETWORK_ID}` }, (d) => {
            const agg = d.onBarsUpdated?.aggregates;
            const b = agg?.[`r${resolution.toLowerCase()}`]?.usd;
            if (b)
                emit({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: Number(b.volume ?? 0) });
        }), (b) => onBar(denom === "quote" && divisor > 0 ? { ...b, o: b.o / divisor, h: b.h / divisor, l: b.l / divisor, c: b.c / divisor } : b));
        return () => { off(); if (poll)
            window.clearInterval(poll); };
    }
    // ---------- trades, launches, activity ----------
    subscribeTrades(pairAddress, onTrade) {
        const key = `trades:${pairAddress}`;
        return hub.subscribe(key, (emit) => this.wsSubscribe(key, `subscription Trades($id: String!) {
            onEventsCreated(id: $id) {
              events { id timestamp eventType maker data { ... on SwapEventData { amount0 amount1 priceUsd } } }
            }
          }`, { id: `${pairAddress}:${SOLANA_NETWORK_ID}` }, (d) => {
            const evs = d.onEventsCreated?.events ?? [];
            for (const e of evs) {
                emit({
                    id: e.id,
                    ts: e.timestamp * 1000,
                    side: e.eventType === "Buy" ? "buy" : "sell",
                    quoteAmount: Math.abs(Number(e.data?.amount1 ?? 0)), // SOL side of the pump.fun pair
                    baseAmount: Math.abs(Number(e.data?.amount0 ?? 0)),
                    priceUsd: Number(e.data?.priceUsd ?? 0),
                    wallet: e.maker ?? "",
                });
            }
        }), onTrade);
    }
    subscribeNewLaunches(onCoin) {
        // New launches = new registry entries. Poll the registry (cheap, served from KV).
        let known = null;
        const tick = async () => {
            const reg = await this.loadRegistry(true).catch(() => null);
            if (!reg)
                return;
            if (!known) {
                known = new Set(reg.keys());
                return;
            }
            const fresh = [...reg.keys()].filter((m) => !known.has(m));
            fresh.forEach((m) => known.add(m));
            if (!fresh.length)
                return;
            const coins = await this.listCoins({}).catch(() => []);
            coins.filter((c) => fresh.includes(c.mint)).forEach(onCoin);
        };
        void tick();
        const id = window.setInterval(tick, 10000);
        return () => window.clearInterval(id);
    }
    subscribeActivity(onEvent) {
        return this.subscribeNewLaunches((c) => {
            const com = byId(c.commodityId);
            onEvent({ id: `l${c.mint}`, ts: Date.now(), kind: "launch", text: `New: $${c.ticker} on the ${com?.name ?? ""} board`, coinMint: c.mint, commodityId: c.commodityId });
        });
    }
    subscribeCoin(mint, onCoin) {
        // One shared 5s poll per coin (ref-counted through the hub).
        return hub.subscribe(`coin:${mint}`, (emit) => {
            const id = window.setInterval(async () => {
                const c = await this.getCoin(mint).catch(() => null);
                if (c)
                    emit(c);
            }, 5000);
            return () => window.clearInterval(id);
        }, onCoin);
    }
    async getHolders(mint) {
        const data = await this.gql(`query Holders($id: String!) { holders(input: { tokenId: $id }) { items { walletAddress shiftedBalance } } }`, { id: `${mint}:${SOLANA_NETWORK_ID}` });
        const items = data.holders.items;
        const total = items.reduce((s, i) => s + i.shiftedBalance, 0) || 1;
        return items.map((i) => ({ wallet: i.walletAddress, amount: i.shiftedBalance, pct: (i.shiftedBalance / total) * 100 }));
    }
    async getCommodityQuote(commodityId) {
        const priceUsd = await this.boardPrice(commodityId).catch(() => 0);
        return { priceUsd, change24h: 0, spark: [] };
    }
    subscribeCommodityQuote(commodityId, onQuote) {
        return hub.subscribe(`quote:${commodityId}`, (emit) => {
            const id = window.setInterval(async () => emit(await this.getCommodityQuote(commodityId)), 10000);
            return () => window.clearInterval(id);
        }, onQuote);
    }
    connectionState() {
        return this.state;
    }
    // ---------- WebSocket (graphql-transport-ws through the proxy) ----------
    wsSubscribe(id, query, variables, onMsg) {
        this.wsSubs.set(id, { query, variables, onMsg });
        this.ensureSocket();
        if (this.ws?.readyState === WebSocket.OPEN)
            this.sendSubscribe(id);
        return () => {
            this.wsSubs.delete(id);
            if (this.ws?.readyState === WebSocket.OPEN)
                this.ws.send(JSON.stringify({ id, type: "complete" }));
            if (this.wsSubs.size === 0) {
                this.ws?.close();
                this.ws = null;
            }
        };
    }
    ensureSocket() {
        if (this.ws || !flags.proxyUrl)
            return;
        const ws = new WebSocket(flags.proxyUrl.replace(/^http/, "ws") + "/ws", "graphql-transport-ws");
        this.ws = ws;
        if (this.state === "offline")
            this.state = "reconnecting";
        document.dispatchEvent(new CustomEvent("pit:connection", { detail: this.state }));
        ws.onopen = () => ws.send(JSON.stringify({ type: "connection_init" }));
        ws.onmessage = (ev) => {
            const msg = JSON.parse(String(ev.data));
            if (msg.type === "connection_ack") {
                this.state = "live";
                this.backoff = 1000;
                document.dispatchEvent(new CustomEvent("pit:connection", { detail: this.state }));
                for (const id of this.wsSubs.keys())
                    this.sendSubscribe(id);
            }
            else if (msg.type === "next" && msg.id) {
                this.wsSubs.get(msg.id)?.onMsg(msg.payload?.data);
            }
        };
        ws.onclose = () => {
            this.ws = null;
            if (this.wsSubs.size === 0)
                return;
            this.state = "reconnecting";
            document.dispatchEvent(new CustomEvent("pit:connection", { detail: this.state }));
            window.setTimeout(() => this.ensureSocket(), this.backoff);
            this.backoff = Math.min(30000, this.backoff * 2);
        };
        ws.onerror = () => ws.close();
    }
    sendSubscribe(id) {
        const sub = this.wsSubs.get(id);
        if (!sub || !this.ws)
            return;
        this.ws.send(JSON.stringify({ id, type: "subscribe", payload: { query: sub.query, variables: sub.variables } }));
    }
}
const toBars = (b) => b.t.map((t, i) => ({ t, o: b.o[i], h: b.h[i], l: b.l[i], c: b.c[i], v: Number(b.volume[i] ?? 0) }));
function codexResolution(r) {
    const map = { "1s": "1S", "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1D": "1D" };
    return map[r];
}
export function applyFilter(list, filter) {
    let out = list;
    if (filter.commodityId)
        out = out.filter((c) => c.commodityId === filter.commodityId);
    if (filter.tier)
        out = out.filter((c) => byId(c.commodityId)?.tier === filter.tier);
    if (filter.status)
        out = out.filter((c) => c.status === filter.status);
    if (filter.search) {
        const s = filter.search.toLowerCase();
        out = out.filter((c) => c.name.toLowerCase().includes(s) || c.ticker.toLowerCase().includes(s) || c.mint.toLowerCase().includes(s));
    }
    switch (filter.sort ?? "mcap") {
        case "mcap":
            out = [...out].sort((a, b) => b.marketCapUsd - a.marketCapUsd);
            break;
        case "newest":
            out = [...out].sort((a, b) => b.createdAt - a.createdAt);
            break;
        case "volume":
            out = [...out].sort((a, b) => b.volume24hUsd - a.volume24hUsd);
            break;
        case "graduating":
            out = out.filter((c) => c.status !== "graduated").sort((a, b) => b.bondingProgress - a.bondingProgress);
            break;
    }
    if (filter.limit)
        out = out.slice(0, filter.limit);
    return out;
}
void RESOLUTION_SECONDS;
