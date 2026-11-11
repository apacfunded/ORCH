// GET -> config + dependency checks.
// ?probe=1 builds (never sends) a pump.fun create tx AND a full cuff (fee split + lock) for a real coin.
import { wrap } from '../lib/http.js';
import { rpc } from '../lib/solana.js';
import { list } from '../lib/store.js';
export default wrap(async (req) => {
  const out = { blob: false, rpc: false, rpcUrl: process.env.SOLANA_RPC_URL ? 'custom' : 'public' };
  try { await list('coins/'); out.blob = true; } catch (e) { out.blobError = e.message; }
  try { out.slot = await rpc('getSlot', []); out.rpc = true; } catch (e) { out.rpcError = e.message; }
  try { const P = await import('../lib/pump.js'); Object.assign(out, { treasury: P.TREASURY(), creatorFeeShareBps: P.TREASURY_BPS(), launchFeeSol: P.LAUNCH_FEE_LAMPORTS() / 1e9, pumpSdk: typeof P.PUMP_SDK?.createFeeSharingConfig }); } catch (e) { out.pumpImportError = String(e.stack || e).slice(0, 600); }
  try { const S = await import('@streamflow/stream'); out.streamflow = typeof S.SolanaStreamClient; } catch (e) { out.streamflowImportError = String(e.stack || e).slice(0, 600); }
  if (req.query.probe) {
    try {
      const r = await fetch('https://pumpportal.fun/api/trade-local', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ publicKey: '4jnvTuAUKrACnoyiD6ocnSXA9vqKFXA5JRt8fwsJTbrv', action: 'create', tokenMetadata: { name: 'Probe', symbol: 'PROBE', uri: 'https://ipfs.io/ipfs/bafkreigh2akiscaildc' }, mint: 'So11111111111111111111111111111111111111112', denominatedInSol: 'true', amount: 0.01, slippage: 10, priorityFee: 0.0005, pool: 'pump' }) });
      out.pumpportal = r.status; out.pumpportalBytes = (await r.arrayBuffer()).byteLength;
    } catch (e) { out.pumpportalError = e.message; }
    // Build a cuff for a real pump.fun coin (mint passed as ?mint=) with a random creator. Not sent.
    if (req.query.mint) {
      try {
        const { Keypair } = await import('@solana/web3.js');
        const { buildCuff } = await import('../lib/cuff.js');
        const c = await buildCuff({ creator: Keypair.generate().publicKey.toBase58(), mint: String(req.query.mint), streamId: Keypair.generate().publicKey.toBase58(),
          days: 30, mode: req.query.mode === 'cliff' ? 'cliff' : 'linear', raw: 1_000_000_000_000n, decimals: 6 });
        out.cuff = { sizes: c.sizes, amount: c.amount, unlockAt: c.unlockAt, streamflowFeePct: c.streamflowFeePct, hasFeeTx: !!c.feeTx };
        if (req.query.sim) {
          // Simulate (never send) with the coin's real creator, signatures skipped.
          const { PublicKey } = await import('@solana/web3.js');
          const { PUMP_SDK } = await import('../lib/pump.js');
          const { connection } = await import('../lib/cuff.js');
          const { tokenBalance } = await import('../lib/solana.js');
          const P = (await import('../lib/pump-sdk.cjs')).default;
          const mint = String(req.query.mint);
          const bc = PUMP_SDK.decodeBondingCurve(await connection().getAccountInfo(P.bondingCurvePda(new PublicKey(mint))));
          const creator = String(req.query.creator || bc.creator.toBase58());
          const bal = await tokenBalance(creator, mint);
          out.sim = { creator, curveCreator: bc.creator.toBase58(), complete: bc.complete, creatorBalance: bal.raw.toString() };
          const raw = bal.raw > 0n ? bal.raw : 1_000_000_000n;
          const real = await buildCuff({ creator, mint, streamId: Keypair.generate().publicKey.toBase58(), days: 30, mode: req.query.mode === 'cliff' ? 'cliff' : 'linear', raw, decimals: bal.decimals });
          const simOne = async (b64) => { if (!b64) return null; const r = await rpc('simulateTransaction', [b64, { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' }]); return { err: r.value.err, units: r.value.unitsConsumed, logs: (r.value.logs || []).slice(-8) }; };
          out.sim.fee = await simOne(real.feeTx).catch((e) => ({ error: e.message }));
          out.sim.lock = await simOne(real.lockTx).catch((e) => ({ error: e.message }));
        }
      } catch (e) { out.cuffError = String(e.stack || e.message).slice(0, 800); }
    }
  }
  return out;
});
