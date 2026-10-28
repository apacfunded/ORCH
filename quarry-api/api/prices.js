// GET /api/prices -> { prices: { [boardId]: { priceUsd, change24h, spark[], source } }, at }
// Live futures/spot quotes for every board that has a public market. Boards with no public market
// (house-only boards like rare earths or water) get a fixed reference price, marked source:"reference".
const { route } = require("../lib/http");

// Yahoo Finance symbols. "c" = quoted in US cents.
const LIVE = {
  gold: ["GC=F"], silver: ["SI=F"], oil: ["CL=F"], uranium: ["UX=F"], coffee: ["KC=F", "c"], cocoa: ["CC=F"],
  platinum: ["PL=F"], palladium: ["PA=F"], copper: ["HG=F"], natgas: ["NG=F"], gasoline: ["RB=F"], heatingoil: ["HO=F"],
  wheat: ["ZW=F", "c"], corn: ["ZC=F", "c"], soybeans: ["ZS=F", "c"], sugar: ["SB=F", "c"], oj: ["OJ=F", "c"], cotton: ["CT=F", "c"],
  cattle: ["LE=F", "c"], hogs: ["HE=F", "c"], rice: ["ZR=F"], oats: ["ZO=F", "c"], lumber: ["LBR=F"], milk: ["DC=F"],
  aluminum: ["ALI=F"], steel: ["HRC=F"], carbon: ["KRBN"], lithium: ["LIT"],
  _sol: ["SOL-USD"],
};
// Approximate reference prices (USD per board unit) for boards without a free public feed.
const REFERENCE = {
  nickel: 15500, cobalt: 33000, rareearths: 60, coal: 105, water: 900, eggs: 3.2, zinc: 2900, tin: 34000, ironore: 104,
  rhodium: 7800, titanium: 11, tungsten: 45, propane: 0.75, jetfuel: 2.3, ethanol: 1.7, canola: 640, palmoil: 900,
  tea: 3.1, vanilla: 240, rubber: 1.8, salmon: 9.5, diamonds: 3600,
};

let cache = { at: 0, data: null };

async function yahoo(sym) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2d&interval=1h`, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`${sym} ${r.status}`);
  const d = (await r.json()).chart.result[0];
  const closes = (d.indicators.quote[0].close || []).filter((x) => typeof x === "number");
  const price = d.meta.regularMarketPrice ?? closes.at(-1);
  const prev = d.meta.chartPreviousClose ?? closes[0];
  return { price, prev, spark: closes.slice(-40) };
}

async function goldSpot() {
  try { const r = await fetch("https://api.gold-api.com/price/XAU"); const j = await r.json(); return Number(j.price) || null; } catch { return null; }
}

async function load() {
  const out = {};
  const entries = Object.entries(LIVE);
  const results = await Promise.allSettled(entries.map(([, [sym]]) => yahoo(sym)));
  entries.forEach(([id, [, unit]], i) => {
    const r = results[i];
    if (r.status !== "fulfilled" || !r.value.price) return;
    const k = unit === "c" ? 0.01 : 1;
    const { price, prev, spark } = r.value;
    out[id] = { priceUsd: price * k, change24h: prev ? ((price - prev) / prev) * 100 : 0, spark: spark.map((x) => x * k), source: "live" };
  });
  const spot = await goldSpot();
  if (spot && out.gold) { const k = spot / out.gold.priceUsd; out.gold = { ...out.gold, priceUsd: spot, spark: out.gold.spark.map((x) => x * k) }; }
  for (const [id, p] of Object.entries(REFERENCE)) out[id] = { priceUsd: p, change24h: 0, spark: [p, p], source: "reference" };
  return out;
}

module.exports = route(["GET"], async (req, res) => {
  if (!cache.data || Date.now() - cache.at > 60_000) {
    try { cache = { at: Date.now(), data: await load() }; } catch (e) { if (!cache.data) throw e; }
  }
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return { prices: cache.data, at: cache.at };
});
