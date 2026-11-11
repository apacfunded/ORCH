import { PublicKey } from '@solana/web3.js';
// POST { creator, mint, streamId, days, mode } -> { feeTx, lockTx, streamId, amount, decimals, unlockAt }
// See lib/cuff.js. Locks the creator's whole dev bag of `mint`.
import { wrap, body, bad, pubkey } from '../lib/http.js';
import { tokenBalance } from '../lib/solana.js';
import { buildCuff, connection } from '../lib/cuff.js';
import { verifyFeeSharing } from '../lib/pump.js';
export default wrap(async (req) => {
  const b = body(req);
  const creator = pubkey(b.creator, 'Your wallet');
  const mint = pubkey(b.mint, 'The mint');
  const streamId = pubkey(b.streamId, 'The lock id');
  const days = Math.round(Number(b.days));
  if (!(days >= 1 && days <= 365)) throw bad('Lock length must be 1 to 365 days.');
  const mode = b.mode === 'cliff' ? 'cliff' : 'linear';
  const { raw, decimals } = await tokenBalance(creator, mint);
  if (raw === 0n) throw bad('Your dev tokens have not landed yet. Waiting a few seconds…');
  const shared = await verifyFeeSharing((a) => connection().getAccountInfo(new PublicKey(a)), creator, mint).catch(() => ({ ok: false }));
  return buildCuff({ creator, mint, streamId, days, mode, raw, decimals, skipFees: shared.ok });
});
