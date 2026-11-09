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
function tokenFeed(mint) {
    const quote = async () => {
        const r = await json(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
        const pairs = (r?.pairs ?? []).filter((p) => p.chainId === "solana" && p.baseToken.address === mint);
        if (!pairs.length)
            return null;
        const p = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
        const price = Number(p.priceUsd);
        if (!Number.isFinite(price))
            return null;
        const mcap = p.marketCap ?? p.fdv ?? null;
        return {
            label: `$${p.baseToken.symbol} · ${mcap ? "MARKET CAP" : "PRICE"} · LIVE`,
            title: `$${p.baseToken.symbol}`,
            subtitle: p.baseToken.name,
            image: p.info?.imageUrl ?? null,
            value: mcap ?? price,
            priceUsd: price,
            change24h: p.priceChange?.h24 ?? null,
            link: `https://pump.fun/coin/${mint}`,
        };
    };
    return {
        intervalMs: 8000,
        async initial() { const q = await quote(); return q ? { quote: q, history: [q.value] } : null; },
        poll: quote,
    };
}
export function heroSource() {
    return heroFeed.coinMint ? tokenFeed(heroFeed.coinMint) : goldFeed;
}
