// ============================================================
// MOCK MARKET DATA — simulated coins so the site looks alive before launch.
// Simulates pump.fun coins: they trade in SOL; this site converts their price into the board's commodity.
// Deterministic seed. All names are fictional. No real mint addresses.
// Everything shown while this adapter is active carries the "DEMO DATA" pill.
// ============================================================
import { commodities, byId } from "../config/commodities.js";
import { flags } from "../config/flags.js";
import { PRNG, hashString } from "../lib/prng.js";
import { hub } from "./subscriptions.js";
import { RESOLUTION_SECONDS, } from "./MarketData.js";
// ---------- fictional name parts ----------
const ADJ = [
    "Shiny", "Hollow", "Rusty", "Velvet", "Cosmic", "Molten", "Drowsy", "Tiny", "Feral", "Humble",
    "Crispy", "Lunar", "Grumpy", "Sleepy", "Turbo", "Vintage", "Golden", "Silent", "Loud", "Wobbly",
];
const NOUN = [
    "Ingot", "Pelican", "Barrel", "Otter", "Compass", "Walrus", "Lantern", "Goblin", "Yak", "Beacon",
    "Nugget", "Ferret", "Anvil", "Pudding", "Moth", "Kettle", "Badger", "Comet", "Turnip", "Sprocket",
    "Haystack", "Pickle", "Mongoose", "Teapot", "Gremlin", "Donut", "Puffin", "Spoon", "Cactus", "Raccoon",
];
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Simulated SOL price for the demo (not live). */
const SOL_USD = 150;
const DEMO_IMAGES = (seed, color) => {
    // Simple generated avatar: coloured circle with a shape. Fictional, no external assets.
    const r = new PRNG(seed);
    const hue = r.int(0, 360);
    const shape = r.pick(["circle", "tri", "sq", "ring"]);
    const inner = shape === "circle"
        ? `<circle cx="32" cy="32" r="13" fill="#120607" opacity=".85"/>`
        : shape === "tri"
            ? `<path d="M32 17l15 28H17z" fill="#120607" opacity=".85"/>`
            : shape === "sq"
                ? `<rect x="20" y="20" width="24" height="24" rx="5" fill="#120607" opacity=".85"/>`
                : `<circle cx="32" cy="32" r="13" fill="none" stroke="#120607" stroke-width="6" opacity=".85"/>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g" cx=".35" cy=".3"><stop offset="0" stop-color="hsl(${hue} 80% 70%)"/><stop offset="1" stop-color="hsl(${hue} 70% 35%)"/></radialGradient></defs><circle cx="32" cy="32" r="32" fill="url(#g)"/>${inner}<circle cx="24" cy="22" r="6" fill="#fff" opacity=".25"/><rect x="0" y="0" width="64" height="64" fill="${color}" opacity=".12"/></svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
};
export class MockMarketData {
    constructor() {
        this.rng = new PRNG(20261027);
        this.coins = new Map();
        this.order = [];
        this.quotes = new Map();
        this.timer = null;
        this.launchTimer = null;
        this.tradeTimers = new Map();
        this.activity = [];
        this.state = "live";
        this.tick = 0;
        // ---------- emitters (wired through the hub) ----------
        this.coinEmit = new Map();
        this.listEmit = null;
        this.launchEmit = null;
        this.activityEmit = null;
        this.quoteEmit = new Map();
        this.seedCommodities();
        this.seedCoins();
        this.start();
    }
    // ---------- seeding ----------
    seedCommodities() {
        // SIMULATED quote-token prices for the demo. Not real commodity prices.
        // House token bases are deliberately NOT near the real commodity prices (they are launchpad tokens, not the commodity).
        const bases = { gold: 2400, silver: 29, oil: 3.8, uranium: 12.4, coffee: 0.91, cocoa: 2.6 };
        for (const c of commodities) {
            const base = bases[c.id] ?? this.rng.range(0.3, 18); // House tokens: deliberately not real commodity prices
            const spark = [];
            let p = base * this.rng.range(0.97, 1.03);
            for (let i = 0; i < 48; i++) {
                p *= 1 + this.rng.gauss() * 0.003;
                spark.push(p);
            }
            this.quotes.set(c.id, {
                id: c.id,
                priceUsd: p,
                open24h: spark[0],
                spark,
                drift: 0,
                vol: c.tier === "backed" ? 0.0006 : 0.004,
            });
        }
    }
    seedCoins() {
        const live = commodities.filter((c) => c.status === "live");
        const ageSpread = 1000 * 60 * 60 * 36;
        for (let i = 0; i < (flags.mockCoins ? 220 : 0); i++) {
            // first three passes give every board coins, the rest land randomly
            const com = i < live.length * 3 ? live[i % live.length] : this.rng.pick(live);
            this.createCoin(com, Date.now() - this.rng.range(60000, ageSpread), false);
        }
        // House tokens on their own pre-unlock curves.
        for (const com of commodities.filter((c) => flags.mockCoins && c.status === "locked")) {
            const coin = this.createCoin(com, Date.now() - this.rng.range(3600000, 36000000), true);
            coin.bondingProgress = com.unlockProgress;
            coin.status = coin.bondingProgress > 0.9 ? "graduating" : "curve";
        }
        this.order.sort((a, b) => this.coins.get(b).marketCapUsd - this.coins.get(a).marketCapUsd);
    }
    fakeAddress(seed) {
        const r = new PRNG(seed);
        let s = "";
        for (let i = 0; i < 40; i++)
            s += BASE58[r.int(0, BASE58.length - 1)];
        return "DEMO" + s; // obviously fake: real mints never start with "DEMO"
    }
    createCoin(com, createdAt, isHouseToken) {
        const seed = this.rng.int(1, 1e9);
        const r = new PRNG(seed);
        const name = isHouseToken ? com.name : `${r.pick(ADJ)} ${r.pick(NOUN)}`;
        const ticker = isHouseToken ? com.symbol : name.split(" ")[1].toUpperCase().slice(0, 7);
        const mint = this.fakeAddress(seed);
        const quote = this.quotes.get(com.id);
        const ageH = (Date.now() - createdAt) / 3600000;
        const mcap = isHouseToken
            ? 40000 + com.unlockProgress * 120000
            : Math.exp(r.range(Math.log(4000), Math.log(2500000))) * (1 + Math.min(ageH, 24) / 24);
        const supply = isHouseToken ? r.pick([1000000, 2100000, 5000000, 10000000]) : 1000000000;
        const priceUsd = mcap / supply;
        const bonding = isHouseToken ? com.unlockProgress : Math.min(1, mcap / 180000 + r.range(-0.1, 0.1));
        const status = bonding >= 1 ? "graduated" : bonding > 0.85 ? "graduating" : "curve";
        const spark = [];
        let p = priceUsd * r.range(0.6, 1.4);
        for (let i = 0; i < 40; i++) {
            p += (priceUsd - p) * 0.08 + p * r.gauss() * 0.03;
            spark.push(p);
        }
        spark[spark.length - 1] = priceUsd;
        const coin = {
            mint,
            pairAddress: "DEMOPAIR" + mint.slice(8, 40),
            name,
            ticker,
            image: DEMO_IMAGES(seed, com.color),
            commodityId: com.id,
            status,
            bondingProgress: Math.max(0.02, Math.min(1, bonding)),
            priceUsd,
            priceQuote: isHouseToken ? priceUsd / SOL_USD : priceUsd / quote.priceUsd,
            marketCapUsd: mcap,
            volume24hUsd: mcap * r.range(0.05, 0.9),
            change24hPct: (priceUsd / spark[0] - 1) * 100,
            holders: Math.round(20 + Math.sqrt(mcap) * r.range(0.3, 1.2)),
            createdAt,
            rewards: r.chance(0.55),
            spark,
            description: isHouseToken
                ? `${com.name} is a House token issued by the launchpad and launched on pump.fun. When it graduates, the ${com.name} board unlocks and creators can launch coins priced in it. Not backed by physical reserves and does not track the real commodity price.`
                : `${name} is a demo coin generated by the site in demo mode. On this site it is priced in ${com.symbol}; on pump.fun it would trade in SOL. Nothing here is real.`,
            creator: this.fakeAddress(seed + 7),
            supply,
            quoteInCurve: 0,
            quoteToGraduate: 0,
            socials: r.chance(0.6) ? { x: "https://x.com", website: r.chance(0.5) ? "https://example.com" : undefined } : {},
            graduatedAt: status === "graduated" ? createdAt + r.range(600000, 4000000) : undefined,
            drift: 0,
            vol: r.range(0.0015, 0.006),
            regime: "calm",
            regimeUntil: 0,
            lastEmit: 0,
            volAccum: 0,
            barSeed: seed,
            isHouseToken,
        };
        const threshold = 85; // simulated SOL needed to graduate on pump.fun (demo value, not pump.fun's real number)
        coin.quoteToGraduate = threshold;
        coin.quoteInCurve = threshold * coin.bondingProgress;
        this.coins.set(mint, coin);
        this.order.push(mint);
        return coin;
    }
    // ---------- simulation loop ----------
    start() {
        const step = () => {
            this.tick++;
            const now = Date.now();
            for (const q of this.quotes.values()) {
                q.drift = q.drift * 0.98 + this.rng.gauss() * q.vol * 0.3;
                q.priceUsd *= 1 + q.drift + this.rng.gauss() * q.vol;
                if (this.tick % 20 === 0) {
                    q.spark.push(q.priceUsd);
                    if (q.spark.length > 48)
                        q.spark.shift();
                }
                this.emitQuote(q);
            }
            for (const coin of this.coins.values()) {
                if (coin.regimeUntil < now) {
                    const roll = this.rng.next();
                    coin.regime = roll < 0.03 ? "pump" : roll < 0.055 ? "dump" : "calm";
                    coin.regimeUntil = now + this.rng.range(3000, 20000);
                }
                const bias = coin.regime === "pump" ? 0.004 : coin.regime === "dump" ? -0.004 : 0;
                coin.drift = coin.drift * 0.9 + this.rng.gauss() * coin.vol * 0.4 + bias;
                const prev = coin.priceUsd;
                coin.priceUsd = Math.max(prev * 0.5, prev * (1 + coin.drift + this.rng.gauss() * coin.vol));
                const quote = this.quotes.get(coin.commodityId);
                coin.priceQuote = coin.isHouseToken ? coin.priceUsd / SOL_USD : coin.priceUsd / quote.priceUsd;
                coin.marketCapUsd = coin.priceUsd * coin.supply;
                coin.change24hPct = (coin.priceUsd / coin.spark[0] - 1) * 100;
                if (this.tick % 12 === 0) {
                    coin.spark.push(coin.priceUsd);
                    if (coin.spark.length > 40)
                        coin.spark.shift();
                }
                if (coin.status !== "graduated") {
                    const grow = Math.max(0, coin.drift) * 0.06 + 0.000008;
                    coin.bondingProgress = Math.min(1, coin.bondingProgress + grow);
                    coin.quoteInCurve = coin.quoteToGraduate * coin.bondingProgress;
                    if (coin.bondingProgress >= 1) {
                        coin.status = "graduated";
                        coin.graduatedAt = now;
                        this.pushActivity({
                            kind: "graduate",
                            text: `$${coin.ticker} graduated on pump.fun`,
                            coinMint: coin.mint,
                            commodityId: coin.commodityId,
                        });
                        if (coin.isHouseToken) {
                            const com = byId(coin.commodityId);
                            if (com) {
                                com.status = "live";
                                com.unlockProgress = 1;
                                this.pushActivity({ kind: "unlock", text: `${com.name} board is live`, commodityId: com.id });
                                document.dispatchEvent(new CustomEvent("pit:unlock", { detail: { commodityId: com.id } }));
                            }
                        }
                    }
                    else if (coin.bondingProgress > 0.85) {
                        coin.status = "graduating";
                    }
                    if (coin.isHouseToken) {
                        const com = byId(coin.commodityId);
                        if (com)
                            com.unlockProgress = coin.bondingProgress;
                    }
                }
                if (this.tick % 3 === 0 && hub.listenerCount(`coin:${coin.mint}`) > 0)
                    this.emitCoin(coin);
            }
            if (this.tick % 4 === 0)
                this.emitList();
            if (this.tick % 10 === 0 && this.rng.chance(0.35))
                this.whaleEvent();
            if (this.tick % 40 === 0)
                this.simulateReconnectBlip();
        };
        this.timer = window.setInterval(step, 250);
        if (flags.mockCoins)
            this.scheduleLaunch();
    }
    simulateReconnectBlip() {
        if (this.rng.chance(0.08)) {
            this.state = "reconnecting";
            window.setTimeout(() => {
                this.state = "live";
                document.dispatchEvent(new CustomEvent("pit:connection", { detail: this.state }));
            }, 1800);
            document.dispatchEvent(new CustomEvent("pit:connection", { detail: this.state }));
        }
    }
    scheduleLaunch() {
        const [a, b] = flags.mockLaunchEveryMs;
        this.launchTimer = window.setTimeout(() => {
            const live = commodities.filter((c) => c.status === "live");
            const com = this.rng.pick(live);
            const coin = this.createCoin(com, Date.now(), false);
            coin.marketCapUsd = this.rng.range(3000, 12000);
            coin.priceUsd = coin.marketCapUsd / coin.supply;
            coin.bondingProgress = 0.02;
            coin.status = "curve";
            coin.volume24hUsd = coin.marketCapUsd * 0.3;
            coin.holders = this.rng.int(3, 20);
            this.emitLaunch(coin);
            this.pushActivity({
                kind: "launch",
                text: `New: $${coin.ticker} paired with ${com.symbol}`,
                coinMint: coin.mint,
                commodityId: com.id,
            });
            this.scheduleLaunch();
        }, this.rng.range(a, b));
    }
    whaleEvent() {
        if (!this.order.length)
            return;
        const mint = this.rng.pick(this.order.slice(0, 30));
        const coin = this.coins.get(mint);
        if (!coin)
            return;
        const com = byId(coin.commodityId);
        if (!com)
            return;
        const amt = this.rng.range(3, 40).toFixed(1);
        const side = this.rng.chance(0.65) ? "bought" : "sold";
        this.pushActivity({
            kind: "whale",
            text: `Whale ${side} ${amt} SOL of $${coin.ticker} (${com.symbol} board)`,
            coinMint: coin.mint,
            commodityId: coin.commodityId,
        });
    }
    pushActivity(e) {
        const ev = { id: `ev${this.tick}-${this.rng.int(0, 1e6)}`, ts: Date.now(), ...e };
        this.activity.unshift(ev);
        if (this.activity.length > 60)
            this.activity.pop();
        this.activityEmit?.(ev);
    }
    emitCoin(c) {
        this.coinEmit.get(c.mint)?.(this.pub(c));
    }
    emitList() {
        this.listEmit?.(this.order.map((m) => this.pub(this.coins.get(m))));
    }
    emitLaunch(c) {
        this.launchEmit?.(this.pub(c));
    }
    emitQuote(q) {
        this.quoteEmit.get(q.id)?.(this.pubQuote(q));
    }
    pub(c) {
        // Return a shallow copy without the sim fields.
        const { drift, vol, regime, regimeUntil, lastEmit, volAccum, barSeed, isHouseToken, ...rest } = c;
        void drift;
        void vol;
        void regime;
        void regimeUntil;
        void lastEmit;
        void volAccum;
        void barSeed;
        return { ...rest, spark: [...rest.spark], ...(isHouseToken ? { houseToken: true } : {}) };
    }
    pubQuote(q) {
        return { priceUsd: q.priceUsd, change24h: (q.priceUsd / q.open24h - 1) * 100, spark: [...q.spark] };
    }
    // ---------- MarketData implementation ----------
    async listCoins(filter = {}) {
        let list = this.order.map((m) => this.pub(this.coins.get(m)));
        return this.applyFilter(list, filter);
    }
    applyFilter(list, filter) {
        if (filter.commodityId)
            list = list.filter((c) => c.commodityId === filter.commodityId);
        if (filter.tier)
            list = list.filter((c) => byId(c.commodityId)?.tier === filter.tier);
        if (filter.status)
            list = list.filter((c) => c.status === filter.status);
        if (filter.search) {
            const s = filter.search.toLowerCase();
            list = list.filter((c) => c.name.toLowerCase().includes(s) || c.ticker.toLowerCase().includes(s) || c.mint.toLowerCase().includes(s));
        }
        switch (filter.sort ?? "mcap") {
            case "mcap":
                list.sort((a, b) => b.marketCapUsd - a.marketCapUsd);
                break;
            case "newest":
                list.sort((a, b) => b.createdAt - a.createdAt);
                break;
            case "volume":
                list.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
                break;
            case "graduating":
                list = list.filter((c) => c.status !== "graduated").sort((a, b) => b.bondingProgress - a.bondingProgress);
                break;
        }
        if (filter.limit)
            list = list.slice(0, filter.limit);
        return list;
    }
    /** Live list stream (mock only; the explorer uses it to re-sort in place). */
    subscribeList(onList) {
        return hub.subscribe("list", (emit) => {
            this.listEmit = emit;
            return () => (this.listEmit = null);
        }, onList);
    }
    async getCoin(mint) {
        const c = this.coins.get(mint);
        return c ? this.pub(c) : null;
    }
    async getBars(pairAddress, resolution, from, to, denom) {
        const coin = [...this.coins.values()].find((c) => c.pairAddress === pairAddress);
        if (!coin)
            return [];
        const sec = RESOLUTION_SECONDS[resolution];
        const count = Math.min(600, Math.max(60, Math.floor((to - from) / sec)));
        const r = new PRNG(coin.barSeed ^ hashString(resolution));
        const endT = Math.floor(Date.now() / 1000 / sec) * sec;
        const scale = denom === "quote" ? this.denomScale(coin) : 1;
        // Generate a path backwards from the current price so the last close matches live.
        const closes = new Array(count);
        let p = coin.priceUsd;
        const stepVol = coin.vol * Math.sqrt(sec / 4) * 0.9;
        for (let i = count - 1; i >= 0; i--) {
            closes[i] = p;
            p = p / (1 + r.gauss() * stepVol + (r.chance(0.02) ? r.range(-0.08, 0.1) : 0));
            p = Math.max(p, coin.priceUsd * 0.05);
        }
        const bars = [];
        for (let i = 0; i < count; i++) {
            const o = i === 0 ? closes[0] * (1 + r.gauss() * stepVol) : closes[i - 1];
            const c = closes[i];
            const wick = Math.abs(c - o) * r.range(0.2, 1.4) + Math.max(o, c) * stepVol * r.range(0.2, 1);
            bars.push({
                t: endT - (count - 1 - i) * sec,
                o: o * scale,
                h: (Math.max(o, c) + wick) * scale,
                l: Math.max(1e-12, Math.min(o, c) - wick) * scale,
                c: c * scale,
                v: coin.volume24hUsd / (86400 / sec) * r.range(0.1, 2.5),
            });
        }
        return bars;
    }
    denomScale(coin) {
        if (coin.isHouseToken)
            return 1 / SOL_USD;
        return 1 / this.quotes.get(coin.commodityId).priceUsd;
    }
    subscribeBars(pairAddress, resolution, denom, onBar) {
        const coin = [...this.coins.values()].find((c) => c.pairAddress === pairAddress);
        if (!coin)
            return () => { };
        const sec = RESOLUTION_SECONDS[resolution];
        let cur = null;
        const id = window.setInterval(() => {
            const scale = denom === "quote" ? this.denomScale(coin) : 1;
            const t = Math.floor(Date.now() / 1000 / sec) * sec;
            const price = coin.priceUsd * scale;
            if (!cur || cur.t !== t) {
                cur = { t, o: price, h: price, l: price, c: price, v: 0 };
            }
            else {
                cur.c = price;
                cur.h = Math.max(cur.h, price);
                cur.l = Math.min(cur.l, price);
            }
            cur.v += coin.volume24hUsd / 86400 * 0.25 * this.rng.range(0, 3);
            onBar({ ...cur });
        }, 250);
        return () => window.clearInterval(id);
    }
    subscribeTrades(pairAddress, onTrade) {
        const coin = [...this.coins.values()].find((c) => c.pairAddress === pairAddress);
        if (!coin)
            return () => { };
        return hub.subscribe(`trades:${pairAddress}`, (emit) => {
            let timer = 0;
            const schedule = () => {
                const [a, b] = flags.mockTradeEveryMs;
                timer = window.setTimeout(() => {
                    const side = this.rng.chance(coin.regime === "dump" ? 0.35 : 0.58) ? "buy" : "sell";
                    const whale = this.rng.chance(0.06);
                    const quoteAmount = whale ? this.rng.range(5, 40) : Math.exp(this.rng.range(Math.log(0.05), Math.log(3)));
                    const usd = quoteAmount * SOL_USD;
                    coin.volume24hUsd += usd;
                    emit({
                        id: `t${Date.now()}${this.rng.int(0, 999)}`,
                        ts: Date.now(),
                        side,
                        quoteAmount,
                        baseAmount: usd / coin.priceUsd,
                        priceUsd: coin.priceUsd,
                        wallet: this.fakeAddress(this.rng.int(1, 1e9)),
                    });
                    schedule();
                }, this.rng.range(a, b));
            };
            schedule();
            return () => window.clearTimeout(timer);
        }, onTrade);
    }
    subscribeNewLaunches(onCoin) {
        return hub.subscribe("launches", (emit) => {
            this.launchEmit = emit;
            return () => (this.launchEmit = null);
        }, onCoin);
    }
    subscribeActivity(onEvent) {
        // Replay the last few so the rail is never empty on first paint.
        const recent = this.activity.slice(0, 8).reverse();
        window.setTimeout(() => recent.forEach(onEvent), 0);
        if (recent.length === 0) {
            // Seed a few events from existing coins.
            for (let i = 0; i < 6; i++)
                this.whaleEvent();
            window.setTimeout(() => this.activity.slice(0, 6).reverse().forEach(onEvent), 0);
        }
        return hub.subscribe("activity", (emit) => {
            this.activityEmit = emit;
            return () => (this.activityEmit = null);
        }, onEvent);
    }
    subscribeCoin(mint, onCoin) {
        return hub.subscribe(`coin:${mint}`, (emit) => {
            this.coinEmit.set(mint, emit);
            return () => this.coinEmit.delete(mint);
        }, onCoin);
    }
    async getHolders(mint) {
        const coin = this.coins.get(mint);
        if (!coin)
            return [];
        const r = new PRNG(coin.barSeed + 99);
        const holders = [];
        let remaining = 100;
        const n = Math.min(50, coin.holders);
        for (let i = 0; i < n; i++) {
            const pct = i === 0 ? r.range(4, 12) : Math.max(0.05, (remaining / (n - i)) * r.range(0.3, 1.6));
            remaining -= pct;
            holders.push({
                wallet: this.fakeAddress(coin.barSeed + i * 13),
                pct,
                amount: (pct / 100) * coin.supply,
                label: i === 0 ? "pool" : i === 1 ? "dev" : pct > 2.5 ? "whale" : undefined,
            });
        }
        return holders.sort((a, b) => b.pct - a.pct);
    }
    async getCommodityQuote(commodityId) {
        const q = this.quotes.get(commodityId);
        if (!q)
            return { priceUsd: 0, change24h: 0, spark: [] };
        return this.pubQuote(q);
    }
    subscribeCommodityQuote(commodityId, onQuote) {
        return hub.subscribe(`quote:${commodityId}`, (emit) => {
            this.quoteEmit.set(commodityId, emit);
            return () => this.quoteEmit.delete(commodityId);
        }, onQuote);
    }
    connectionState() {
        return this.state;
    }
    /** Demo-only: let the launch wizard add a coin so the success screen links somewhere real. */
    demoLaunch(input) {
        const com = byId(input.commodityId);
        const coin = this.createCoin(com, Date.now(), false);
        coin.name = input.name;
        coin.ticker = input.ticker.toUpperCase();
        if (input.image)
            coin.image = input.image;
        if (input.description)
            coin.description = input.description;
        coin.marketCapUsd = 4200;
        coin.priceUsd = coin.marketCapUsd / coin.supply;
        coin.bondingProgress = 0.01;
        coin.status = "curve";
        coin.holders = 1;
        coin.volume24hUsd = 0;
        this.emitLaunch(coin);
        this.pushActivity({ kind: "launch", text: `New: $${coin.ticker} paired with ${com.symbol}`, coinMint: coin.mint, commodityId: com.id });
        return this.pub(coin);
    }
    destroy() {
        if (this.timer)
            window.clearInterval(this.timer);
        if (this.launchTimer)
            window.clearTimeout(this.launchTimer);
        for (const t of this.tradeTimers.values())
            window.clearTimeout(t);
    }
}
