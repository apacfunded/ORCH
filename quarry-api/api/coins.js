// GET /api/coins            -> every verified Quarry coin (newest first), with live bonding-curve state
// GET /api/coins?mint=...   -> one coin
const { PublicKey } = require("@solana/web3.js");
const { PUMP_SDK, bondingCurvePda } = require("@pump-fun/pump-sdk");
const { route } = require("../lib/http");
const store = require("../lib/store");
const { readIndex } = require("../lib/registry");
const { connection } = require("../lib/env");
const { pumpState } = require("../lib/launch");

let curveCache = { at: 0, map: new Map() };

async function curves(mints) {
  if (Date.now() - curveCache.at < 5000 && mints.every((m) => curveCache.map.has(m))) return curveCache.map;
  const conn = connection();
  const { global } = await pumpState(conn);
  const initReal = Number(global.initialRealTokenReserves.toString());
  const map = new Map();
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    const infos = await conn.getMultipleAccountsInfo(chunk.map((m) => bondingCurvePda(new PublicKey(m))));
    infos.forEach((inf, j) => {
      if (!inf) return;
      const bc = PUMP_SDK.decodeBondingCurve(inf);
      const vSol = Number(bc.virtualSolReserves.toString()) / 1e9;
      const vTok = Number(bc.virtualTokenReserves.toString()) / 1e6;
      const realTok = Number(bc.realTokenReserves.toString());
      map.set(chunk[j], {
        complete: bc.complete,
        progress: bc.complete ? 1 : Math.max(0, Math.min(1, 1 - realTok / initReal)),
        priceSol: vTok > 0 ? vSol / vTok : 0,
        realSol: Number(bc.realSolReserves.toString()) / 1e9,
        supply: Number(bc.tokenTotalSupply.toString()) / 1e6,
      });
    });
  }
  curveCache = { at: Date.now(), map };
  return map;
}

module.exports = route(["GET"], async (req, res) => {
  res.setHeader("Cache-Control", "public, s-maxage=4, stale-while-revalidate=20");
  if (req.query.mint) {
    const coin = await store.getJson(`coins/c/${String(req.query.mint)}.json`);
    if (!coin) return res.status(404).json({ error: "not found" });
    const c = (await curves([coin.mint]).catch(() => new Map())).get(coin.mint) || null;
    return { coin: { ...coin, curve: c } };
  }
  const list = await readIndex();
  const map = list.length ? await curves(list.map((c) => c.mint)).catch(() => new Map()) : new Map();
  return { coins: list.map((c) => ({ ...c, curve: map.get(c.mint) || null })) };
});
