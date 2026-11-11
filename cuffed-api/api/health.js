// GET -> config + dependency checks.
// ?probe=1 builds (never sends) a pump.fun create tx AND a full cuff (fee split + lock) for a real coin.
import { wrap } from '../lib/http.js';
import { rpc } from '../lib/solana.js';
import { list } from '../lib/store.js';
import { buildCuff } from '../lib/cuff.js';
import { TREASURY, TREASURY_BPS, LAUNCH_FEE_LAMPORTS } from '../lib/pump.js';
export default wrap(async (req) => {
  const out = { treasury: TREASURY(), creatorFeeShareBps: TREASURY_BPS(), launchFeeSol: LAUNCH_FEE_LAMPORTS() / 1e9, blob: false, rpc: false, rpcUrl: process.env.SOLANA_RPC_URL ? 'custom' : 'public' };
  try { await list('coins/'); out.blob = true; } catch (e) { out.blobError = e.message; }
  try { out.slot = await rpc('getSlot', []); out.rpc = true; } catch (e) { out.rpcError = e.message; }
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
        const c = await buildCuff({ creator: Keypair.generate().publicKey.toBase58(), mint: String(req.query.mint), streamId: Keypair.generate().publicKey.toBase58(),
          days: 30, mode: req.query.mode === 'cliff' ? 'cliff' : 'linear', raw: 1_000_000_000_000n, decimals: 6 });
        out.cuff = { sizes: c.sizes, amount: c.amount, unlockAt: c.unlockAt, streamflowFeePct: c.streamflowFeePct, hasFeeTx: !!c.feeTx };
      } catch (e) { out.cuffError = String(e.stack || e.message).slice(0, 800); }
    }
  }
  return out;
});
