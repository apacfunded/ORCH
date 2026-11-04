import { wrap } from '../lib/http.js';
import { CFG } from '../lib/config.js';
import { list } from '../lib/store.js';
import { SolanaRpc } from '../lib/rpc.js';

export default wrap(async () => {
  const out: Record<string, unknown> = { live: CFG.live, seed: CFG.masterSeed.length >= 32, forward: CFG.forwardAddress ? CFG.forwardAddress.slice(0, 4) + '…' + CFG.forwardAddress.slice(-4) : null };
  try { await list('coins/'); out.blob = 'ok'; } catch (e) { out.blob = (e as Error).message; }
  try { out.slot = await new SolanaRpc(CFG.rpc).call<number>('getSlot'); } catch (e) { out.rpc = (e as Error).message; }
  return out;
});
