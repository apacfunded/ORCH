import { TARGETS } from '../config/targets.js';
import { FEES } from '../config/fees.js';
/**
 * Live adapter (Phase 2). Mining data comes from the Rig backend:
 *   GET /api/coins, GET /api/log, GET /api/link-message, POST /api/link, GET /api/links/:wallet
 * Market data (price, mcap, candles, trades, holders) needs a market data source;
 * wire Codex (or another indexer) in the marked spots. Until then those fields show "—".
 */
export class RigApiData {
    constructor(apiUrl) {
        this.isDemo = false;
        this.list = [];
        this.log = [];
        this.act = [];
        this.subs = new Set();
        this.seen = new Set();
        this.id = 1;
        this.base = apiUrl.replace(/\/$/, '');
        window.setInterval(() => this.refresh().catch(() => { }), 15000);
        // Nudge the backend worker: it processes funded launches and claims fees. Idempotent and rate-limited server-side.
        const tick = () => fetch(this.base + '/api/tick', { keepalive: true }).catch(() => { });
        tick();
        window.setInterval(tick, 60000);
    }
    async ready() { await this.refresh(); }
    async get(path) {
        const r = await fetch(this.base + path);
        if (!r.ok)
            throw new Error(`The Rig API returned ${r.status} for ${path}.`);
        return r.json();
    }
    async refresh() {
        const [coins, log] = await Promise.all([this.get('/api/coins'), this.get('/api/log?limit=200')]);
        const tickerOf = new Map(coins.map((c) => [c.mint, c.ticker]));
        this.list = coins.map((c) => ({
            mint: c.mint, ticker: c.ticker, name: c.name, target: c.target, rentShare: c.rent_share, creatorWallet: '', createdAt: c.created_at,
            // CONFIG: market fields come from Codex filterTokens / getTokenPrices.
            priceUsd: NaN, mcapUsd: NaN, change24h: NaN, volume24h: NaN, holders: NaN, bonding: NaN, graduated: false, spark: [],
            hashrate: NaN, mined24h: {}, pots: c.pots ?? {}, paidOut: {}, nextPayoutAt: nextPayout(), hue: hashHue(c.mint),
            top10Pct: NaN, devPct: NaN, socials: {},
            feesEarnedUsd: log.filter((e) => e.kind === 'split' && e.mint === c.mint).reduce((s, e) => s + e.amount, 0),
            paidUsd24h: NaN, paidUsdTotal: NaN,
        }));
        this.log = log.map((e) => ({ ...e, ticker: e.mint ? tickerOf.get(e.mint) : undefined }));
        for (const e of [...this.log].reverse()) {
            const key = `${e.ts}:${e.kind}:${e.mint}:${e.amount}`;
            if (this.seen.has(key))
                continue;
            this.seen.add(key);
            const a = { id: this.id++, ts: e.ts, kind: e.kind === 'claim' || e.kind === 'split' || e.kind === 'buy' ? 'rent' : e.kind, mint: e.mint, ticker: e.ticker,
                text: `${e.ticker ? '$' + e.ticker + ' ' : ''}${e.kind} ${e.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })} ${e.unit}` };
            this.act.unshift(a);
            for (const s of this.subs)
                s(a);
        }
        for (const s of this.subs)
            s();
    }
    coins() { return this.list; }
    coin(mint) { return this.list.find((c) => c.mint === mint); }
    targets() {
        return TARGETS.map((t) => ({ id: t.id, hashrate: NaN, mined24h: {}, coins: this.list.filter((c) => c.target === t.id).length,
            blocksHit: 0, rentedUsd24h: this.log.filter((e) => e.kind === 'rent' && e.chain === t.id && Date.now() - e.ts < 86400000).reduce((s, e) => s + e.amount, 0), hashSeries: [] }));
    }
    totals() {
        return { feesRoutedUsd: this.log.filter((e) => e.kind === 'split').reduce((s, e) => s + e.amount, 0), paidUsd: NaN, blocksHit: 0, coinsMining: this.list.length };
    }
    blocks() { return []; } // CONFIG: read from the pool API
    activity(limit = 50) { return this.act.slice(0, limit); }
    ledger(limit = 100) { return this.log.slice(0, limit); }
    candles(_mint, _res) { return []; } // CONFIG: Codex getBars
    trades() { return []; } // CONFIG: Codex getTokenEvents
    holders() { return []; } // CONFIG: Codex holders or the backend snapshot
    prices() { return {}; }
    subscribe(fn) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
    async linkMessage(wallet, chain, address) {
        const q = new URLSearchParams({ wallet, chain, address });
        return this.get(`/api/link-message?${q}`);
    }
    async link(req) {
        const r = await fetch(this.base + '/api/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) });
        const j = (await r.json().catch(() => ({})));
        if (!r.ok)
            throw new Error(j.error ?? `Linking failed (${r.status}). Try again.`);
    }
    links(wallet) { return this.get(`/api/links/${wallet}`); }
    async launch(req) {
        const r = await fetch(this.base + '/api/launch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) });
        const j = (await r.json().catch(() => ({})));
        if (!r.ok)
            throw new Error(j.error ?? `Launch request failed (${r.status}).`);
        return j;
    }
    launchStatus(id) {
        // While someone waits on a launch, push the worker so the coin is created as soon as the SOL lands.
        fetch(this.base + '/api/tick?claims=0').catch(() => { });
        return this.get(`/api/launch/${id}`);
    }
}
function nextPayout() { const e = FEES.payoutEveryHours * 3600000; return Math.ceil(Date.now() / e) * e; }
function hashHue(s) { let h = 0; for (const c of s)
    h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
