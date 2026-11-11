// POST { signature, lockSignature, streamId, mint, creator, name, ticker, description, image, uri }
// Verifies on-chain that the coin was launched by `creator`, the dev bag is locked in a non-cancelable
// Streamflow contract, the Cuffed launch fee was paid and the creator-fee split is locked. Then records it.
import { PublicKey } from '@solana/web3.js';
import { SolanaStreamClient, ICluster } from '@streamflow/stream';
import { wrap, body, bad, pubkey, clean, ticker } from '../lib/http.js';
import { putJson, list } from '../lib/store.js';
import { getTx, txKeys, tokenBalance, PUMP_PROGRAM, STREAMFLOW_PROGRAM, RPC_URL } from '../lib/solana.js';
import { verifyFeeSharing, TREASURY, LAUNCH_FEE_LAMPORTS } from '../lib/pump.js';
import { connection } from '../lib/cuff.js';

const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
export default wrap(async (req) => {
  const b = body(req);
  const sig = clean(b.signature, 100), lockSig = clean(b.lockSignature, 100);
  if (!SIG.test(sig) || !SIG.test(lockSig)) throw bad('Missing transaction signature.');
  const mint = pubkey(b.mint, 'The mint');
  const creator = pubkey(b.creator, 'Your wallet');
  const streamId = pubkey(b.streamId, 'The lock id');
  if ((await list(`coins/${mint}.json`)).length) return { ok: true, already: true };

  // 1. Launch
  const tx = await getTx(sig);
  if (!tx) throw bad('The launch transaction was not found yet. It may still be landing.');
  if (tx.meta?.err) throw bad('The launch transaction failed on-chain, so no coin was created.');
  const L = txKeys(tx);
  if (!L.signers.includes(creator) || !L.signers.includes(mint)) throw bad('That launch was not signed by this wallet and mint.');
  if (!L.keys.includes(PUMP_PROGRAM)) throw bad('That transaction is not a pump.fun launch.');

  // 2. Lock + launch fee
  const lt = await getTx(lockSig);
  if (!lt) throw bad('The lock transaction was not found yet. It may still be landing.');
  if (lt.meta?.err) throw bad('The lock transaction failed on-chain.');
  const K = txKeys(lt);
  if (!K.signers.includes(creator) || !K.signers.includes(streamId) || !K.keys.includes(STREAMFLOW_PROGRAM)) throw bad('That is not a Streamflow lock from this wallet.');
  if (creator !== TREASURY() && LAUNCH_FEE_LAMPORTS() > 0) {
    const i = K.keys.indexOf(TREASURY());
    const paid = i >= 0 ? lt.meta.postBalances[i] - lt.meta.preBalances[i] : 0;
    if (paid < LAUNCH_FEE_LAMPORTS()) throw bad('The Cuffed launch fee was not paid.');
  }
  const client = new SolanaStreamClient(RPC_URL(), ICluster.Mainnet, 'confirmed');
  const s = await client.getOne({ id: streamId });
  if (s.mint !== mint || s.sender !== creator) throw bad('That lock is for a different coin or wallet.');
  if (s.cancelableBySender || s.cancelableByRecipient || s.transferableBySender || s.canTopup) throw bad('That lock can be cancelled, so it does not count.');

  // 3. Creator-fee split
  const fees = await verifyFeeSharing((a) => connection().getAccountInfo(new PublicKey(a)), creator, mint);
  if (!fees.ok) throw bad(fees.reason);

  const left = await tokenBalance(creator, mint).catch(() => ({ raw: 0n }));
  const locked = BigInt(s.depositedAmount.toString());
  const lockedPct = Number((locked * 10000n) / (locked + left.raw || 1n)) / 100;
  const symbol = ticker(b.ticker);
  const coin = {
    mint, creator, signature: sig, lockSignature: lockSig, streamId, ticker: symbol,
    name: clean(b.name, 32), description: clean(b.description, 500), image: clean(b.image, 300), uri: clean(b.uri, 300),
    locked: locked.toString(), lockedPct, start: s.start, unlockAt: s.end, mode: s.cliffAmount.gtn(0) ? 'cliff' : 'linear',
    at: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
  };
  await putJson(`coins/${mint}.json`, coin);
  await putJson(`tickers/${symbol}.json`, { mint }, true).catch(() => {});
  return { ok: true, coin };
});
