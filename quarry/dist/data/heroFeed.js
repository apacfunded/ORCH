// Live feed for the front-page hero chart + featured card.
// Real data (not the demo adapter): gold spot right now, your coin once its CA is set in config/hero.ts.
import { heroFeed } from "../config/hero.js";
async function json(url) {
    try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok)
            return null;
        return (await r.json());
    }
    catch {
        return null;
    }
}
async function goldSpot() {
    const g = await json("https://api.gold-api.com/price/XAU");
    if (g && Number.isFinite(g.price) && g.price > 0)
        return g.price;
    const s = await json("https://api.exchange.coinbase.com/products/PAXG-USD/stats");
    const last = s ? Number(s.last) : NaN;
    return Number.isFinite(last) && last > 0 ? last : null;
}
let goldOpen = null;
async function goldQuote() {
    const [price, stats] = await Promise.all([goldSpot(), goldOpen === null ? json("https://api.exchange.coinbase.com/products/PAXG-USD/stats") : Promise.resolve(null)]);
    if (stats) {
        const o = Number(stats.open);
        if (Number.isFinite(o) && o > 0)
            goldOpen = o;
    }
    if (price === null)
        return null;
    return {
        label: "GOLD · USD / OZ · LIVE",
        title: "Gold",
        subtitle: "XAU spot price, live",
        image: null,
        value: price,
        priceUsd: price,
        change24h: goldOpen ? ((price - goldOpen) / goldOpen) * 100 : null,
        link: null,
    };
}
const goldFeed = {
    intervalMs: 15000,
    async initial() {
        const [q, candles] = await Promise.all([goldQuote(), json("https://api.exchange.coinbase.com/products/PAXG-USD/candles?granularity=900")]);
        if (!q)
            return null;
        const history = Array.isArray(candles) ? candles.slice(0, 60).reverse().map((c) => c[4]).filter((v) => Number.isFinite(v) && v > 0) : [];
        // Rescale PAXG history onto the spot price so the line ends where the label says.
        if (history.length) {
            const k = q.value / history[history.length - 1];
            for (let i = 0; i < history.length; i++)
                history[i] *= k;
        }
        history.push(q.value);
        return { quote: q, history };
    },
    poll: goldQuote,
};
/** Live snapshot of a pump.fun token: DexScreener first, GeckoTerminal as fallback. */
export async function tokenSnapshot(mint) {
    const r = await json(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const pairs = (r?.pairs ?? []).filter((p) => p.chainId === "solana" && p.baseToken?.address === mint);
    if (pairs.length) {
        const p = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
        const price = Number(p.priceUsd);
        if (Number.isFinite(price))
            return { price, mc: p.marketCap ?? p.fdv ?? price * 1e9, change: p.priceChange?.h24 ?? null, pair: p.pairAddress, symbol: p.baseToken.symbol, name: p.baseToken.name, image: p.info?.imageUrl ?? null };
    }
    const g = await json(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?page=1`);
    const pool = g?.data?.[0];
    if (!pool)
        return null;
    const a = pool.attributes;
    const price = Number(a.base_token_price_usd);
    if (!Number.isFinite(price) || price <= 0)
        return null;
    const mc = Number(a.market_cap_usd ?? a.fdv_usd) || price * 1e9;
    const sym = String(a.name ?? "").split("/")[0].trim();
    const ch = Number(a.price_change_percentage?.h24);
    return { price, mc, change: Number.isFinite(ch) ? ch : null, pair: a.address, symbol: sym, name: sym, image: null };
}
function tokenFeed(mint) {
    const quote = async () => {
        const t = await tokenSnapshot(mint);
        if (!t)
            return null;
        return {
            label: `$${t.symbol} · MARKET CAP · LIVE`, title: `$${t.symbol}`, subtitle: t.name, image: t.image,
            value: t.mc, priceUsd: t.price, change24h: t.change, link: `https://pump.fun/coin/${mint}`,
        };
    };
    return {
        intervalMs: 10000,
        async initial() { const q = await quote(); return q ? { quote: q, history: [q.value] } : null; },
        poll: quote,
    };
}
export function heroSource() {
    return heroFeed.coinMint ? tokenFeed(heroFeed.coinMint) : goldFeed;
}
