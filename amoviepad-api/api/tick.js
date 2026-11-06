// GET -> scans each movie coin's new trades, adds up its creator fees, and logs a
// "clip generated" event every time another 0.1 SOL is reached. Run every few minutes.
import { wrap } from '../lib/http.js';
import { readAll, list, getJson, putJson } from '../lib/store.js';
import { rpc, fetchTx, tradesIn } from '../lib/solana.js';
import { progress } from '../lib/movie.js';
const PER_COIN = 40, BUDGET = 150;

async function loadState(mint) {
  const m = (await list(`state/${mint}.json`))[0];
  if (!m) return { mint, feesLamports: '0', trades: 0, cursor: null, clipsLogged: 0 };
  return getJson(`${m.url}?t=${Date.now()}`);
}
async function newSignatures(mint, cursor) {
  const out = []; let before;
  for (let page = 0; page < 5; page++) {
    const opts = { limit: 1000, commitment: 'confirmed' };
    if (cursor) opts.until = cursor;
    if (before) opts.before = before;
    const batch = await rpc('getSignaturesForAddress', [mint, opts]);
    out.push(...batch);
    if (batch.length < 1000) break;
    before = batch[batch.length - 1].signature;
  }
  return out.reverse(); // oldest first
}
export default wrap(async (req, res) => {
  const coins = (await readAll('coins/')).sort((a, b) => a.at - b.at);
  let budget = BUDGET; const report = [];
  for (const coin of coins) {
    if (budget <= 0) break;
    const state = await loadState(coin.mint);
    const before = progress(coin, state);
    if (before.done) continue;
    const sigs = await newSignatures(coin.mint, state.cursor);
    if (!sigs.length) continue;
    let fees = BigInt(state.feesLamports), n = 0;
    for (const s of sigs.slice(0, Math.min(PER_COIN, budget))) {
      budget--; n++;
      if (!s.err) {
        const tx = await fetchTx(s.signature).catch(() => null);
        if (!tx) { n--; break; } // RPC hiccup: stop here and resume from this point next tick
        for (const t of tradesIn(tx)) if (t.mint === coin.mint) { fees += t.creatorFee; state.trades++; }
      }
      state.cursor = s.signature;
    }
    state.feesLamports = fees.toString(); state.updatedAt = Date.now();
    const after = progress(coin, state);
    for (let c = Math.max(state.clipsLogged || 0, before.clips) + 1; c <= after.clips; c++) {
      await putJson(`log/${String(Date.now()).padStart(14, '0')}-${coin.mint.slice(0, 6)}-${c}.json`, { at: Date.now(), mint: coin.mint, ticker: coin.ticker, name: coin.name, clip: c, totalClips: after.totalClips });
    }
    state.clipsLogged = after.clips;
    await putJson(`state/${coin.mint}.json`, state, true);
    report.push({ ticker: coin.ticker, scanned: n, feesSol: after.feesSol, clips: after.clips });
  }
  return { ok: true, coins: coins.length, report };
});
