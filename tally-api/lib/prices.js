import { COINS } from './config.js';

// Live prices from DexScreener (free, no key, up to 30 tokens per call).
// For each coin we use the most liquid pair for price/market cap and sum 24h volume across pairs.
export async function fetchPrices(now = Date.now()) {
  if (process.env.PRICE_SOURCE === 'mock') return mockPrices(now);
  const url = `https://api.dexscreener.com/tokens/v1/solana/${COINS.map(c => c.mint).join(',')}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  let pairs;
  try {
    const r = await fetch(url, { headers: { accept: 'application/json' }, signal: ctl.signal });
    if (!r.ok) throw new Error('DexScreener returned ' + r.status);
    pairs = await r.json();
  } finally { clearTimeout(t); }
  if (!Array.isArray(pairs)) throw new Error('Unexpected DexScreener response');

  const out = {};
  for (const p of pairs) {
    const c = COINS.find(x => x.mint === p?.baseToken?.address);
    if (!c) continue;
    const o = out[c.sym] || (out[c.sym] = { vol24: 0, liq: -1 });
    o.vol24 += Number(p.volume?.h24 || 0);
    const liq = Number(p.liquidity?.usd || 0);
    if (liq > o.liq) {
      Object.assign(o, {
        liq,
        mc: Number(p.marketCap || p.fdv || 0),
        price: Number(p.priceUsd || 0),
        chg24: Number(p.priceChange?.h24 || 0),
        chg1h: Number(p.priceChange?.h1 || 0),
        url: p.url || null,
        dex: p.dexId || null
      });
    }
  }
  return { ts: now, coins: out };
}

// Deterministic fake prices for local testing (no internet needed).
const BASE = { FARTCOIN: 150e6, MOODENG: 42e6, PNUT: 44e6, ARC: 60e6, BAN: 58e6, ZEREBRO: 28e6, GOAT: 15e6 };
function mockPrices(now) {
  const out = {};
  COINS.forEach((c, i) => {
    const b = BASE[c.sym] || 10e6;
    const wiggle = 0.03 * Math.sin(now / 180_000 + i) + 0.012 * Math.sin(now / 23_000 * (i + 1)) + 0.004 * Math.sin(now / 3_100 + i * 7);
    const mc = b * Math.exp(wiggle);
    out[c.sym] = { mc, price: mc / 1e9, vol24: b * 0.2, liq: b * 0.04, chg24: wiggle * 100, chg1h: wiggle * 30, url: null, dex: 'mock' };
  });
  return { ts: now, coins: out };
}
