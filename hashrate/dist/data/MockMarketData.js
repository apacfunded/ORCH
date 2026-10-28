import { TARGETS, targetById } from '../config/targets.js';
import { FEES } from '../config/fees.js';
import { mulberry32, pick, between, demoAddress } from '../lib/prng.js';
// Simulated launchpad. Fixed seed, fake names, every mint starts with "Demo".
const NAMES = [
    ['Doge Digger', 'DIGGER'], ['Shovel Inu', 'SHOVEL'], ['Pickaxe Pepe', 'PICKAXE'], ['Hash Hound', 'HOUND'], ['Kas Pup', 'KASPUP'],
    ['Z Mole', 'ZMOLE'], ['Ghost Shaft', 'SHAFT'], ['Canary', 'CANARY'], ['Ore Cat', 'ORECAT'], ['Lode Frog', 'LODE'],
    ['Nonce', 'NONCE'], ['Block Bro', 'BLOCKBRO'], ['Drill Sergeant', 'DRILL'], ['Tunnel Rat', 'TUNNEL'], ['Coal Cat', 'COAL'],
    ['Deep Core', 'CORE'], ['Sluice', 'SLUICE'], ['Fan Noise', 'FANS'], ['Overclock', 'OC'], ['Hashbrown', 'HASHBROWN'],
    ['Kilowatt', 'KWH'], ['Lamp Moth', 'MOTH'], ['Helmet Hamster', 'HELMET'], ['Shielded Ghost', 'GHOST'], ['Merge Mutt', 'MERGE'],
    ['Pool Party', 'POOL'], ['Difficulty', 'DIFF'], ['Rig Rat', 'RIGRAT'], ['Bit Badger', 'BADGER'], ['Vein', 'VEIN'],
];
// Hashrate per $/day rented, rough demo scale per target unit.
const HASH_PER_USD = { LTC_DOGE: 0.06, ZEC: 1.4, KAS: 0.32, BTC: 0.004, XMR: 9 };
const BASE_PRICES = { SOL: 182, BTC: 104000, LTC: 96, DOGE: 0.19, ZEC: 268, KAS: 0.09, XMR: 214 };
export class MockMarketData {
    constructor() {
        this.isDemo = true;
        this.r = mulberry32(20261027);
        this.list = [];
        this.act = [];
        this.led = [];
        this.subs = new Set();
        this.px = { ...BASE_PRICES };
        this.nextId = 1;
        this.blockCount = { LTC_DOGE: 23, ZEC: 9, KAS: 4, BTC: 0, XMR: 6 };
        this.blockList = [];
        this.hashHist = {};
        this.totalsBase = { feesRoutedUsd: 0, paidUsd: 0 };
        this.timers = [];
        this.nameIdx = 0;
        this.tickN = 0;
        this.demoLinks = new Map();
        for (let i = 0; i < 22; i++)
            this.list.push(this.makeCoin(Date.now() - between(this.r, 0.2, 72) * 3600000));
        this.list.sort((a, b) => b.createdAt - a.createdAt);
        this.totalsBase.feesRoutedUsd = this.list.reduce((s, c) => s + c.volume24h * 0.0005 * 3.2, 0) + 18400;
        this.totalsBase.paidUsd = this.totalsBase.feesRoutedUsd * 0.71;
        for (const [t, n] of Object.entries(this.blockCount))
            for (let i = 0; i < Math.min(n, 6); i++) {
                const c = pick(this.r, this.list.filter((x) => x.target === t)) ?? this.list[0];
                this.blockList.push({ ts: Date.now() - between(this.r, 0.5, 48) * 3600000, target: t, mint: c.mint, ticker: c.ticker });
            }
        this.blockList.sort((a, b) => b.ts - a.ts);
        for (const t of TARGETS) {
            const base = this.list.filter((c) => c.target === t.id).reduce((s, c) => s + c.hashrate, 0);
            this.hashHist[t.id] = Array.from({ length: 24 }, () => base * between(this.r, 0.8, 1.15));
        }
        // Seed history.
        for (let i = 0; i < 40; i++)
            this.event(Date.now() - (40 - i) * between(this.r, 40, 160) * 1000, false);
        this.timers.push(window.setInterval(() => this.tick(), 1500));
        this.timers.push(window.setInterval(() => this.event(Date.now(), true), 2600));
        const launchLoop = () => {
            const t = window.setTimeout(() => { this.spawn(); launchLoop(); }, between(this.r, 8000, 20000));
            this.timers.push(t);
        };
        launchLoop();
    }
    async ready() { }
    makeCoin(createdAt, name, ticker, target, rentShare) {
        const r = this.r;
        const [n, t] = name && ticker ? [name, ticker] : NAMES[this.nameIdx++ % NAMES.length];
        const tg = target ?? pick(r, ['LTC_DOGE', 'LTC_DOGE', 'LTC_DOGE', 'ZEC', 'ZEC', 'KAS', 'BTC', 'XMR']);
        const age = (Date.now() - createdAt) / 3600000;
        const graduated = !name && r() < Math.min(0.55, age / 60);
        const mcap = graduated ? between(r, 90000, 2400000) : between(r, 4000, 70000);
        const priceUsd = mcap / 1e9;
        const volume24h = mcap * between(r, 0.4, 3.5);
        const rs = rentShare ?? pick(r, [0.2, 0.3, 0.3, 0.4, 0.5]);
        const dailyFeesUsd = volume24h * (FEES.creatorFeeRate ?? 0.0005) * (1 - (FEES.rigCut ?? 0));
        const rentUsd = dailyFeesUsd * rs;
        const target0 = targetById(tg);
        const hashrate = name ? 0 : rentUsd * HASH_PER_USD[tg];
        const mined = {}, pots = {}, paid = {};
        for (const ch of target0.chains) {
            const share = 1 / target0.chains.length;
            const minedUsd = name ? 0 : rentUsd * (1 - FEES.rentalLoss) * share + dailyFeesUsd * (1 - rs) * share;
            mined[ch] = minedUsd / BASE_PRICES[ch];
            pots[ch] = mined[ch] * between(r, 0.1, 0.9);
            paid[ch] = mined[ch] * Math.max(0, age / 24) * between(r, 0.6, 1);
        }
        const spark = [];
        let p = priceUsd * between(r, 0.6, 1.1);
        for (let i = 0; i < 32; i++) {
            p *= 1 + between(r, -0.06, 0.07);
            spark.push(p);
        }
        spark[spark.length - 1] = priceUsd;
        const mint = demoAddress(r);
        const c = {
            mint, ticker: t, name: n, target: tg, rentShare: rs, creatorWallet: demoAddress(r), createdAt,
            priceUsd, mcapUsd: mcap, change24h: between(r, -38, 160), volume24h, holders: Math.round(mcap / between(r, 180, 900)) + 12,
            bonding: graduated ? 100 : Math.min(99, (mcap / 69000) * 100), graduated, spark, hashrate, mined24h: mined, pots, paidOut: paid,
            nextPayoutAt: this.nextPayoutTime(), hue: Math.floor(r() * 360), vol: between(r, 0.006, 0.03),
            top10Pct: between(r, 8, 34), devPct: name ? 0 : between(r, 0, 6),
            socials: { x: r() < 0.8 ? 'https://x.com/demo' : undefined, tg: r() < 0.5 ? 'https://t.me/demo' : undefined, web: r() < 0.3 ? 'https://example.com' : undefined },
            feesEarnedUsd: name ? 0 : volume24h * (FEES.creatorFeeRate ?? 0.0005) * Math.max(0.3, age / 24) * between(r, 0.8, 1.6),
            paidUsd24h: 0, paidUsdTotal: 0,
            candles1m: [], trades: [], holderList: [],
        };
        c.paidUsd24h = name ? 0 : Object.entries(c.mined24h).reduce((s, [ch, a]) => s + a * BASE_PRICES[ch], 0) * between(r, 0.5, 0.95);
        c.paidUsdTotal = Object.entries(c.paidOut).reduce((s, [ch, a]) => s + a * BASE_PRICES[ch], 0);
        c.candles1m = this.seedCandles(c);
        c.trades = Array.from({ length: 30 }, (_, i) => this.fakeTrade(c, Date.now() - i * between(r, 10, 120) * 1000));
        c.holderList = this.fakeHolders(c);
        return c;
    }
    nextPayoutTime() {
        const every = FEES.payoutEveryHours * 3600000;
        return Math.ceil(Date.now() / every) * every;
    }
    seedCandles(c) {
        const r = mulberry32(c.mint.length * 7919 + c.hue);
        const out = [];
        const n = 600;
        let p = c.priceUsd / Math.max(0.2, 1 + c.change24h / 100);
        const now = Math.floor(Date.now() / 60000) * 60;
        for (let i = n; i > 0; i--) {
            const open = p;
            const drift = (Math.log(c.priceUsd) - Math.log(p)) / Math.max(1, i);
            const close = Math.max(1e-12, open * Math.exp(drift + (r() - 0.5) * c.vol * 2));
            const high = Math.max(open, close) * (1 + r() * c.vol);
            const low = Math.min(open, close) * (1 - r() * c.vol);
            out.push({ time: now - i * 60, open, high, low, close });
            p = close;
        }
        out[out.length - 1].close = c.priceUsd;
        return out;
    }
    fakeTrade(c, ts) {
        const side = this.r() < 0.56 ? 'buy' : 'sell';
        const sol = Math.round(between(this.r, 0.05, 6) * 100) / 100;
        const usd = sol * this.px.SOL;
        return { ts, side, wallet: demoAddress(this.r), sol, usd, tokens: usd / c.priceUsd };
    }
    fakeHolders(c) {
        const out = [];
        let left = 100;
        const chains = targetById(c.target).chains;
        for (let i = 0; i < 14; i++) {
            const pct = i === 13 ? left : Math.min(left, between(this.r, 0.4, i < 3 ? 6 : 2.5));
            left -= pct;
            out.push({ wallet: demoAddress(this.r), pct, linked: this.r() < 0.6 ? chains.slice(0, this.r() < 0.5 ? 1 : chains.length) : [] });
        }
        out.sort((a, b) => b.pct - a.pct);
        return out;
    }
    tick() {
        for (const k of Object.keys(this.px))
            if (k !== 'SOL')
                this.px[k] *= 1 + between(this.r, -0.0015, 0.0015);
        this.px.SOL *= 1 + between(this.r, -0.001, 0.001);
        const now = Math.floor(Date.now() / 60000) * 60;
        for (const c of this.list) {
            if (this.r() < 0.55) {
                const m = 1 + between(this.r, -c.vol, c.vol * 1.08);
                c.priceUsd *= m;
                c.mcapUsd = c.priceUsd * 1e9;
                c.change24h = (c.change24h + 100) * m - 100;
                c.spark.push(c.priceUsd);
                c.spark.shift();
                if (!c.graduated) {
                    c.bonding = Math.min(100, (c.mcapUsd / 69000) * 100);
                    if (c.bonding >= 100)
                        c.graduated = true;
                }
                const last = c.candles1m[c.candles1m.length - 1];
                if (last.time === now) {
                    last.close = c.priceUsd;
                    last.high = Math.max(last.high, c.priceUsd);
                    last.low = Math.min(last.low, c.priceUsd);
                }
                else
                    c.candles1m.push({ time: now, open: last.close, high: Math.max(last.close, c.priceUsd), low: Math.min(last.close, c.priceUsd), close: c.priceUsd });
            }
            // Hashrate jitter and slowly filling pots.
            c.hashrate *= 1 + between(this.r, -0.02, 0.02);
            for (const ch of Object.keys(c.pots))
                c.pots[ch] += (c.mined24h[ch] / 57600) * between(this.r, 0.5, 1.5);
            if (Date.now() >= c.nextPayoutAt)
                this.payout(c);
            c.feesEarnedUsd += c.volume24h * 0.0005 / 57600;
        }
        if (++this.tickN % 20 === 0)
            for (const t of TARGETS) {
                const h = this.hashHist[t.id];
                h.push(this.list.filter((c) => c.target === t.id).reduce((s, c) => s + c.hashrate, 0));
                if (h.length > 24)
                    h.shift();
            }
        this.emit();
    }
    payout(c) {
        for (const [ch, amt] of Object.entries(c.pots)) {
            if (amt <= 0)
                continue;
            c.paidOut[ch] += amt;
            c.paidUsd24h += amt * this.px[ch];
            c.paidUsdTotal += amt * this.px[ch];
            this.totalsBase.paidUsd += amt * this.px[ch];
            this.ledgerAdd({ ts: Date.now(), mint: c.mint, ticker: c.ticker, kind: 'payout', chain: ch, amount: amt, unit: ch, status: 'done',
                note: `${Math.round(c.holders * 0.4)} holders paid` });
            c.pots[ch] = 0;
        }
        c.nextPayoutAt = this.nextPayoutTime() + FEES.payoutEveryHours * 3600000;
    }
    event(ts, live) {
        const c = pick(this.r, this.list);
        const t = targetById(c.target);
        const roll = this.r();
        let a;
        if (roll < 0.42) {
            const tr = this.fakeTrade(c, ts);
            if (live)
                c.trades.unshift(tr), c.trades.length = Math.min(c.trades.length, 60);
            a = { ts, kind: tr.side, mint: c.mint, ticker: c.ticker, text: `${tr.side === 'buy' ? 'bought' : 'sold'} ${tr.sol} SOL of $${c.ticker}` };
        }
        else if (roll < 0.62) {
            const usd = between(this.r, 30, 420);
            this.totalsBase.feesRoutedUsd += usd / Math.max(0.1, c.rentShare);
            a = { ts, kind: 'rent', mint: c.mint, ticker: c.ticker, text: `$${c.ticker} rented ${(usd * HASH_PER_USD[c.target]).toFixed(2)} ${t.unit} of ${t.algo}` };
            this.ledgerAdd({ ts, mint: c.mint, ticker: c.ticker, kind: 'rent', chain: c.target, amount: usd, unit: 'USD', status: 'done', note: `${t.label} · 6h order` });
        }
        else if (roll < 0.84) {
            const ch = pick(this.r, t.chains);
            const amt = (c.mined24h[ch] || 1) * between(this.r, 0.03, 0.12);
            a = { ts, kind: 'mined', mint: c.mint, ticker: c.ticker, text: `$${c.ticker} mined ${fmtAmt(amt)} ${ch}` };
            this.ledgerAdd({ ts, mint: c.mint, ticker: c.ticker, kind: 'mined', chain: ch, amount: amt, unit: ch, status: t.autoTracked ? 'done' : 'pending',
                note: t.autoTracked ? 'from pool payout' : 'recorded by hand' });
        }
        else if (roll < 0.94) {
            const ch = pick(this.r, t.chains);
            const amt = (c.mined24h[ch] || 1) * between(this.r, 0.2, 0.5);
            a = { ts, kind: 'payout', mint: c.mint, ticker: c.ticker, text: `$${c.ticker} paid ${fmtAmt(amt)} ${ch} to ${Math.round(between(this.r, 20, 260))} holders` };
            this.ledgerAdd({ ts, mint: c.mint, ticker: c.ticker, kind: 'payout', chain: ch, amount: amt, unit: ch, status: 'done' });
        }
        else {
            this.blockCount[c.target] = (this.blockCount[c.target] ?? 0) + 1;
            this.blockList.unshift({ ts, target: c.target, mint: c.mint, ticker: c.ticker });
            this.blockList.length = Math.min(this.blockList.length, 40);
            a = { ts, kind: 'block', mint: c.mint, ticker: c.ticker, text: `Block hit on ${t.label} by renters incl. $${c.ticker}` };
        }
        this.pushActivity(a, live);
    }
    spawn(name, ticker, target, rentShare) {
        const c = this.makeCoin(Date.now(), name, ticker, target, rentShare);
        if (!name) {
            c.mcapUsd = between(this.r, 3800, 6500);
            c.priceUsd = c.mcapUsd / 1e9;
            c.bonding = (c.mcapUsd / 69000) * 100;
            c.graduated = false;
            c.change24h = 0;
            c.holders = 3;
        }
        this.list.unshift(c);
        this.pushActivity({ ts: Date.now(), kind: 'launch', mint: c.mint, ticker: c.ticker, text: `$${c.ticker} launched · mines ${targetById(c.target).label}` }, true);
        return c;
    }
    addDemoCoin(x) {
        return this.spawn(x.name, x.ticker, x.target, x.rentShare);
    }
    pushActivity(a, live) {
        const full = { ...a, id: this.nextId++ };
        this.act.unshift(full);
        if (this.act.length > 200)
            this.act.length = 200;
        if (live)
            for (const s of this.subs)
                s(full);
    }
    ledgerAdd(e) {
        this.led.unshift(e);
        if (this.led.length > 300)
            this.led.length = 300;
    }
    emit() { for (const s of this.subs)
        s(); }
    // ---- MarketData ----
    coins() { return this.list; }
    coin(mint) { return this.list.find((c) => c.mint === mint); }
    prices() { return this.px; }
    activity(limit = 50) { return this.act.slice(0, limit); }
    ledger(limit = 100) { return this.led.slice(0, limit); }
    trades(mint) { return this.coin(mint) ? this.coin(mint).trades : []; }
    holders(mint) { return this.coin(mint) ? this.coin(mint).holderList : []; }
    candles(mint, resSec) {
        const c = this.coin(mint);
        if (!c)
            return [];
        const base = c.candles1m;
        if (resSec <= 60) {
            if (resSec === 60)
                return base.map((x) => ({ ...x }));
            // Sub-minute: split the last 40 minutes into finer candles.
            const out = [];
            const r = mulberry32(c.hue + resSec);
            for (const m of base.slice(-40)) {
                const parts = 60 / resSec;
                let p = m.open;
                for (let i = 0; i < parts; i++) {
                    const close = i === parts - 1 ? m.close : p * (1 + (r() - 0.5) * c.vol);
                    out.push({ time: m.time + i * resSec, open: p, close, high: Math.max(p, close) * (1 + r() * c.vol * 0.3), low: Math.min(p, close) * (1 - r() * c.vol * 0.3) });
                    p = close;
                }
            }
            return out;
        }
        const out = [];
        for (const m of base) {
            const t = Math.floor(m.time / resSec) * resSec;
            const last = out[out.length - 1];
            if (last && last.time === t) {
                last.high = Math.max(last.high, m.high);
                last.low = Math.min(last.low, m.low);
                last.close = m.close;
            }
            else
                out.push({ ...m, time: t });
        }
        return out;
    }
    targets() {
        return TARGETS.map((t) => {
            const cs = this.list.filter((c) => c.target === t.id);
            const mined = {};
            for (const ch of t.chains)
                mined[ch] = cs.reduce((s, c) => s + (c.mined24h[ch] ?? 0), 0);
            const hashrate = cs.reduce((s, c) => s + c.hashrate, 0);
            return { id: t.id, hashrate, mined24h: mined, coins: cs.length, blocksHit: this.blockCount[t.id] ?? 0, rentedUsd24h: hashrate / HASH_PER_USD[t.id], hashSeries: this.hashHist[t.id] ?? [] };
        });
    }
    totals() {
        return {
            feesRoutedUsd: this.totalsBase.feesRoutedUsd,
            paidUsd: this.totalsBase.paidUsd,
            blocksHit: Object.values(this.blockCount).reduce((a, b) => a + b, 0),
            coinsMining: this.list.length,
        };
    }
    blocks(limit = 20) { return this.blockList.slice(0, limit); }
    subscribe(fn) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
    async linkMessage(wallet, chain, address) {
        const issuedAt = Date.now();
        const message = ['Hashrate payout address', `Wallet: ${wallet}`, `Chain: ${chain}`, `Address: ${address}`, `Issued: ${new Date(issuedAt).toISOString()}`].join('\n');
        return { message, issuedAt };
    }
    async link(req) {
        await new Promise((r) => setTimeout(r, 500));
        const info = this.demoLinks.get(req.wallet) ?? { links: [], owed: [] };
        info.links = info.links.filter((l) => l.chain !== req.chain).concat({ chain: req.chain, address: req.address, signed_at: Date.now() });
        this.demoLinks.set(req.wallet, info);
    }
    async links(wallet) {
        return this.demoLinks.get(wallet) ?? { links: [], owed: [] };
    }
}
function fmtAmt(n) {
    return n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : n >= 1 ? 2 : 5 });
}
