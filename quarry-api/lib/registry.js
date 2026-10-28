// Coin registry: a coin is listed on Quarry only after its fee split is verified on-chain.
const store = require("./store");
const { verifyLaunch } = require("./launch");
const { PublicKey } = require("@solana/web3.js");

async function readIndex() {
  const idx = await store.getJson("coins/index.json");
  if (Array.isArray(idx)) return idx;
  // Rebuild from per-coin records if the index is missing.
  const blobs = await store.listJson("coins/c/");
  const all = await Promise.all(blobs.map((b) => fetch(b.url).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  const list = all.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
  await store.putJson("coins/index.json", list, { cache: 0 });
  return list;
}

/** Verify a pending launch on-chain and, if it checks out, list it. Returns the coin record or throws. */
async function finalize(conn, cfg, mintStr, signature) {
  const pending = await store.getJson(`pending/${mintStr}.json`);
  const existing = await store.getJson(`coins/c/${mintStr}.json`);
  if (existing) return existing;
  if (!pending) { const e = new Error("This coin was not launched through Quarry."); e.status = 404; throw e; }
  const v = await verifyLaunch(conn, new PublicKey(mintStr), cfg);
  if (!v.ok) { const e = new Error(`Launch not verified yet: ${v.reason}.`); e.status = 409; e.code = "NOT_VERIFIED"; throw e; }
  const coin = { ...pending, signature: signature || pending.signature || null, shareholders: v.shareholders, verifiedAt: Date.now() };
  await store.putJson(`coins/c/${mintStr}.json`, coin, { cache: 0 });
  const idx = await readIndex();
  if (!idx.some((c) => c.mint === mintStr)) {
    idx.unshift(coin);
    await store.putJson("coins/index.json", idx, { cache: 0 });
  }
  return coin;
}

module.exports = { readIndex, finalize };
