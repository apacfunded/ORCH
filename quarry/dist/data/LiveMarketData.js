// ============================================================
// LIVE MARKET DATA — the real thing.
//   * Which coins exist and which board each is on: the Quarry API registry (/api/coins).
//     A coin is listed only after its locked fee split is verified on-chain.
//   * Price / market cap / curve progress: read from each coin's pump.fun bonding curve by the API,
//     topped up with DexScreener (volume, 24h change, pool address).
//   * Commodity prices: /api/prices (futures/spot quotes, refreshed every minute).
//   * Charts and trades: GeckoTerminal for the coin's pool.
// ============================================================
import { byId } from "../config/commodities.js";
import { flags } from "../config/flags.js";
import { RESOLUTION_SECONDS, } from "./MarketData.js";
const GRAD_SOL = 85; // SOL in the curve when a pump.fun coin graduates (approx.)
const GT = "https://api.geckoterminal.com/api/v2/networks/solana/pools";
const GT_TF = { "1s": ["minute", 1], "1m": ["minute", 1], "5m": ["minute", 5], "15m": ["minute", 15], "1h": ["hour", 1], "4h": ["hour", 4], "1D": ["day", 1] };
async function getJson(url) {
    try {
        const r = await fetch(url, { cache: "no-store" });
        return r.ok ? (await r.json()) : null;
    }
    catch {
        return null;
    }
}
export class LiveMarketData {
    constructor() {
        this.recs = new Map();
        this.ds = new Map();
        this.spark = new Map();
        this.prices = {};
        this.solUsd = 0;
        this.state = "reconnecting";
        this.coinL = new Map();
        this.launchL = new Set();
        this.activityL = new Set();
        this.quoteL = new Map();
        this.first = true;
        this.loaded = Promise.all([this.pollRegistry(), this.pollPrices()]).then(() => this.pollDex());
        window.setInterval(() => void this.pollRegistry(), 8000);
        window.setInterval(() => void this.pollDex(), 15000);
        window.setInterval(() => void this.pollPrices(), 60000);
    }
    // ---------- polling ----------
    async pollRegistry() {
        const r = await getJson(`${flags.apiUrl}/coins`);
        if (!r) {
            this.state = this.recs.size ? "reconnecting" : "offline";
            return;
        }
        this.state = "live";
        for (const rec of r.coins) {
            const isNew = !this.recs.has(rec.mint);
            this.recs.set(rec.mint, rec);
            const c = this.toCoin(rec);
            const s = this.spark.get(rec.mint) ?? [];
            if (c.priceUsd > 0 && s[s.length - 1] !== c.priceUsd) {
                s.push(c.priceUsd);
                if (s.length > 40)
                    s.shift();
                this.spark.set(rec.mint, s);
            }
            if (isNew && !this.first) {
                this.launchL.forEach((l) => l(c));
                const com = byId(rec.board);
                this.activityL.forEach((l) => l({ id: `l-${rec.mint}`, ts: Date.now(), kind: "launch", text: `$${rec.symbol} launched on the ${com?.name ?? rec.board} board`, coinMint: rec.mint, commodityId: rec.board }));
            }
            this.coinL.get(rec.mint)?.forEach((l) => l(this.toCoin(rec)));
        }
        this.first = false;
    }
    async pollDex() {
        const mints = [...this.recs.keys()];
        for (let i = 0; i < mints.length; i += 30) {
            const r = await getJson(`https://api.dexscreener.com/latest/dex/tokens/${mints.slice(i, i + 30).join(",")}`);
            for (const p of r?.pairs ?? []) {
                if (p.chainId !== "solana")
                    continue;
                const cur = this.ds.get(p.baseToken.address);
                if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0))
                    this.ds.set(p.baseToken.address, p);
            }
        }
        for (const m of mints) {
            const rec = this.recs.get(m);
            this.coinL.get(m)?.forEach((l) => l(this.toCoin(rec)));
        }
    }
    async pollPrices() {
        const r = await getJson(`${flags.apiUrl}/prices`);
        if (!r)
            return;
        this.prices = r.prices;
        this.solUsd = r.prices._sol?.priceUsd ?? this.solUsd;
        for (const [id, ls] of this.quoteL) {
            const q = this.quote(id);
            ls.forEach((l) => l(q));
        }
    }
    // ---------- mapping ----------
    quote(id) {
        const p = this.prices[id];
        return p ? { priceUsd: p.priceUsd, change24h: p.change24h, spark: p.spark.length > 1 ? p.spark : [p.priceUsd, p.priceUsd] } : { priceUsd: 0, change24h: 0, spark: [0, 0] };
    }
    toCoin(rec) {
        const d = this.ds.get(rec.mint);
        const cv = rec.curve;
        const curvePrice = cv && this.solUsd ? cv.priceSol * this.solUsd : 0;
        const priceUsd = cv && !cv.complete && curvePrice ? curvePrice : Number(d?.priceUsd ?? 0) || curvePrice;
        const supply = cv?.supply || 1000000000;
        const mcap = cv && !cv.complete && curvePrice ? curvePrice * supply : (d?.marketCap ?? d?.fdv ?? priceUsd * supply);
        const com = this.prices[rec.board];
        const status = cv?.complete ? "graduated" : (cv?.progress ?? 0) > 0.9 ? "graduating" : "curve";
        const s = this.spark.get(rec.mint);
        return {
            mint: rec.mint,
            pairAddress: d?.pairAddress ?? rec.mint,
            name: rec.name, ticker: rec.symbol, image: rec.image, commodityId: rec.board,
            status, bondingProgress: cv ? cv.progress : 0,
            priceUsd, priceQuote: com && com.priceUsd ? priceUsd / com.priceUsd : 0,
            marketCapUsd: mcap, volume24hUsd: d?.volume?.h24 ?? 0, change24hPct: d?.priceChange?.h24 ?? 0,
            holders: 0, createdAt: rec.createdAt, rewards: true,
            spark: s && s.length > 1 ? [...s] : [priceUsd, priceUsd],
        };
    }
    // ---------- MarketData ----------
    async listCoins(f = {}) {
        await this.loaded;
        let list = [...this.recs.values()].map((r) => this.toCoin(r));
        if (f.commodityId)
            list = list.filter((c) => c.commodityId === f.commodityId);
        if (f.tier)
            list = list.filter((c) => byId(c.commodityId)?.tier === f.tier);
        if (f.status)
            list = list.filter((c) => c.status === f.status);
        if (f.search) {
            const q = f.search.toLowerCase();
            list = list.filter((c) => c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q) || c.mint === f.search);
        }
        const sort = f.sort ?? "mcap";
        list.sort((a, b) => sort === "newest" ? b.createdAt - a.createdAt : sort === "volume" ? b.volume24hUsd - a.volume24hUsd : sort === "graduating" ? b.bondingProgress - a.bondingProgress : b.marketCapUsd - a.marketCapUsd);
        return f.limit ? list.slice(0, f.limit) : list;
    }
    async getCoin(mint) {
        await this.loaded;
        let rec = this.recs.get(mint);
        if (!rec) {
            const r = await getJson(`${flags.apiUrl}/coins?mint=${encodeURIComponent(mint)}`);
            if (!r)
                return null;
            rec = r.coin;
            this.recs.set(mint, rec);
        }
        const c = this.toCoin(rec);
        const realSol = rec.curve?.realSol ?? 0;
        return {
            ...c,
            description: rec.description ?? "",
            creator: rec.creator,
            supply: rec.curve?.supply || 1000000000,
            quoteInCurve: realSol,
            quoteToGraduate: rec.curve?.complete ? 0 : Math.max(0, GRAD_SOL - realSol),
            socials: { x: rec.twitter ?? undefined, website: rec.website ?? undefined, telegram: rec.telegram ?? undefined },
        };
    }
    async getBars(pairAddress, resolution, from, to, denom) {
        const rec = [...this.recs.values()].find((r) => (this.ds.get(r.mint)?.pairAddress ?? r.mint) === pairAddress);
        if (!this.ds.get(rec?.mint ?? ""))
            return [];
        const [tf, agg] = GT_TF[resolution];
        const r = await getJson(`${GT}/${pairAddress}/ohlcv/${tf}?aggregate=${agg}&limit=1000&currency=usd&before_timestamp=${to}`);
        const rows = r?.data.attributes.ohlcv_list ?? [];
        const k = denom === "quote" ? this.quote(rec.board).priceUsd || 1 : 1;
        return rows.map(([t, o, hi, lo, c, v]) => ({ t, o: o / k, h: hi / k, l: lo / k, c: c / k, v })).filter((b) => b.t >= from).sort((a, b) => a.t - b.t);
    }
    subscribeBars(pairAddress, resolution, denom, onBar) {
        const sec = RESOLUTION_SECONDS[resolution];
        const id = window.setInterval(async () => {
            const now = Math.floor(Date.now() / 1000);
            const bars = await this.getBars(pairAddress, resolution, now - sec * 3, now, denom);
            const last = bars[bars.length - 1];
            if (last)
                onBar(last);
        }, 20000);
        return () => window.clearInterval(id);
    }
    subscribeTrades(pairAddress, onTrade) {
        const seen = new Set();
        let stop = false;
        const tick = async () => {
            if (stop || pairAddress.length < 32 || !this.ds.size)
                return;
            const r = await getJson(`${GT}/${pairAddress}/trades`);
            const rows = (r?.data ?? []).slice().reverse();
            for (const t of rows) {
                if (seen.has(t.id))
                    continue;
                seen.add(t.id);
                const a = t.attributes, buy = a.kind === "buy";
                onTrade({ id: t.id, ts: Date.parse(a.block_timestamp), side: buy ? "buy" : "sell", quoteAmount: Number(buy ? a.from_token_amount : a.to_token_amount), baseAmount: Number(buy ? a.to_token_amount : a.from_token_amount), priceUsd: Number(buy ? a.price_to_in_usd : a.price_from_in_usd), wallet: a.tx_from_address });
            }
        };
        void tick();
        const id = window.setInterval(() => void tick(), 10000);
        return () => { stop = true; window.clearInterval(id); };
    }
    subscribeNewLaunches(onCoin) { this.launchL.add(onCoin); return () => this.launchL.delete(onCoin); }
    subscribeActivity(onEvent) { this.activityL.add(onEvent); return () => this.activityL.delete(onEvent); }
    subscribeCoin(mint, onCoin) {
        let s = this.coinL.get(mint);
        if (!s) {
            s = new Set();
            this.coinL.set(mint, s);
        }
        s.add(onCoin);
        return () => { s.delete(onCoin); };
    }
    async getHolders(_mint) { return []; }
    async getCommodityQuote(id) { await this.loaded; return this.quote(id); }
    subscribeCommodityQuote(id, onQuote) {
        let s = this.quoteL.get(id);
        if (!s) {
            s = new Set();
            this.quoteL.set(id, s);
        }
        s.add(onQuote);
        return () => { s.delete(onQuote); };
    }
    connectionState() { return this.state; }
    /** Force a registry refresh (after a launch) and return the coin once listed. */
    async refresh(mint) {
        await this.pollRegistry();
        const rec = mint ? this.recs.get(mint) : null;
        return rec ? this.toCoin(rec) : null;
    }
}
