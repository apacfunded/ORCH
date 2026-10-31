// GET -> config + dependency checks. ?probe=1 also builds (never sends) a PumpPortal create tx.
import { wrap } from '../lib/http.js';
import { rpc } from '../lib/solana.js';
import { list } from '../lib/store.js';
export default wrap(async (req) => {
  const out = { blob: false, rpc: false, media: process.env.PINATA_JWT ? 'pinata' : 'vercel-blob', rpcUrl: process.env.SOLANA_RPC_URL ? 'custom' : 'public' };
  try { await list('coins/'); out.blob = true; } catch (e) { out.blobError = e.message; }
  try { out.slot = await rpc('getSlot', []); out.rpc = true; } catch (e) { out.rpcError = e.message; }
  if (req.query.probe) {
    try {
      const r = await fetch('https://pumpportal.fun/api/trade-local', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ publicKey: '4jnvTuAUKrACnoyiD6ocnSXA9vqKFXA5JRt8fwsJTbrv', action: 'create', tokenMetadata: { name: 'Probe', symbol: 'PROBE', uri: 'https://ipfs.io/ipfs/bafkreigh2akiscaildc' }, mint: 'So11111111111111111111111111111111111111112', denominatedInSol: 'true', amount: 0, slippage: 10, priorityFee: 0.0005, pool: 'pump' }) });
      out.pumpportal = r.status; out.pumpportalBytes = (await r.arrayBuffer()).byteLength;
    } catch (e) { out.pumpportalError = e.message; }
  }
  return out;
});
