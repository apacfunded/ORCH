// Claim each coin's pump.fun creator fees and forward the SOL (holding mode).
import { CFG } from './config.js';
import { allCoins } from './launches.js';
import { creatorFor } from './wallets.js';
import { signSerializedTx } from './keys.js';
import { SolanaRpc } from './rpc.js';
import { sendSol } from './tx.js';
import { logLine, putJson, list } from './store.js';

const PUMPPORTAL = 'https://pumpportal.fun/api/trade-local';

export async function claimAll(rpc = new SolanaRpc(CFG.rpc)) {
  if (!CFG.live) return [{ result: 'LIVE=false: not claiming' }];
  if (!CFG.forwardAddress) return [{ result: 'FEE_FORWARD_ADDRESS not set: not claiming' }];
  const out: { mint: string; result: string }[] = [];
  for (const coin of await allCoins()) {
    try {
      const kp = creatorFor(coin.launchId);
      const before = await rpc.balanceSol(kp.publicKey);
      const res = await fetch(PUMPPORTAL, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ publicKey: kp.publicKey, action: 'collectCreatorFee', priorityFee: CFG.priorityFeeSol, pool: 'pump' }),
      });
      let claimed = 0;
      if (res.status === 200) {
        const signed = signSerializedTx(new Uint8Array(await res.arrayBuffer()), kp);
        const sig = await rpc.sendRaw(signed);
        await rpc.confirm(sig);
        const after = await rpc.balanceSol(kp.publicKey);
        claimed = Math.max(0, after - before + CFG.priorityFeeSol + 0.000005);
        if (claimed > 0.0001) await logLine({ mint: coin.mint, kind: 'claim', amount: claimed, unit: 'SOL', ref: sig, status: 'done' });
      } else if (res.status >= 500) {
        throw new Error(`PumpPortal ${res.status}`);
      }
      // Forward whatever is above the gas reserve.
      const bal = await rpc.balanceSol(kp.publicKey);
      const move = Math.floor((bal - CFG.walletReserveSol) * 1e6) / 1e6;
      if (move > 0.002) {
        const sig = await sendSol(rpc, kp, [{ to: CFG.forwardAddress, sol: move }]);
        await logLine({ mint: coin.mint, kind: 'split', amount: move, unit: 'SOL', ref: sig, status: 'done', note: `forwarded to ${CFG.forwardAddress.slice(0, 6)}…` });
        out.push({ mint: coin.mint, result: `claimed ${claimed.toFixed(4)} · forwarded ${move} SOL` });
      } else out.push({ mint: coin.mint, result: `claimed ${claimed.toFixed(4)} · nothing to forward` });
    } catch (e) { out.push({ mint: coin.mint, result: 'failed: ' + (e as Error).message }); }
  }
  return out;
}

/** Rate-limit locks so public ticks can't stampede: `name` runs at most once per `windowMs`. */
export async function takeLock(name: string, windowMs: number): Promise<boolean> {
  const prefix = `locks/${name}-`;
  const locks = await list(prefix);
  const now = Date.now();
  if (locks.some((l) => now - Number(l.pathname.slice(prefix.length, -5)) < windowMs)) return false;
  try { await putJson(`${prefix}${now}.json`, { ts: now }); return true; } catch { return false; }
}
