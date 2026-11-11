// Builds the two "cuff" transactions a creator approves right after launching:
//   feeTx:  pump.fun fee sharing (creator + Cuffed treasury), split locked forever
//   lockTx: Cuffed launch fee (SOL to treasury) + Streamflow lock of the whole dev bag
// The browser signs both with one wallet approval; the lock's stream keypair is made in the browser.
import { Connection, PublicKey, SystemProgram, ComputeBudgetProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import { SolanaStreamClient, ICluster, calculateTotalAmountToDeposit } from '@streamflow/stream';
import { RPC_URL } from './solana.js';
import { feeSharingIxs, TREASURY, LAUNCH_FEE_LAMPORTS } from './pump.js';

const DAY = 86400;
let conn; export const connection = () => (conn ??= new Connection(RPC_URL(), 'confirmed'));

function bad(msg) { const e = new Error(msg); e.client = true; return e; }

/** Largest deposit whose amount + Streamflow fee still fits in `raw`. */
export function depositFor(raw, feePct) {
  const bal = new BN(raw.toString());
  let d = bal.muln(1_000_000).divn(Math.round(1_000_000 * (1 + feePct / 100)));
  while (d.gtn(0) && calculateTotalAmountToDeposit(d, feePct).gt(bal)) d = d.subn(1);
  return d;
}

export function schedule(amount, days, mode, now = Math.floor(Date.now() / 1000)) {
  if (mode === 'cliff') {
    const at = now + days * DAY;
    return { unlockAt: at, p: { start: at, cliff: at, cliffAmount: amount.subn(1), period: 1, amountPerPeriod: new BN(1) } };
  }
  const start = now + 120;
  return { unlockAt: start + days * DAY, p: { start, cliff: start, cliffAmount: new BN(0), period: DAY, amountPerPeriod: amount.addn(days - 1).divn(days) } };
}

function toB64(payer, blockhash, ixs) {
  const msg = new TransactionMessage({ payerKey: new PublicKey(payer), recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  const bytes = new VersionedTransaction(msg).serialize();
  return { b64: Buffer.from(bytes).toString('base64'), size: bytes.length };
}

export async function buildCuff({ creator, mint, streamId, days, mode, raw, decimals, skipFees = false }) {
  const client = new SolanaStreamClient(RPC_URL(), ICluster.Mainnet, 'confirmed');
  const fee = await client.getTotalFee({ address: creator }).catch(() => 0.19);
  const amount = depositFor(raw, fee);
  if (amount.lten(days)) throw bad('Your dev bag is too small to lock.');
  const { unlockAt, p } = schedule(amount, days, mode);

  const { ixs: lockIxs } = await client.prepareCreateInstructions({
    recipient: creator, tokenId: mint, amount, name: 'Cuffed dev lock',
    canTopup: false, cancelableBySender: false, cancelableByRecipient: false,
    transferableBySender: false, transferableByRecipient: false, automaticWithdrawal: false, ...p,
  }, {
    sender: { publicKey: new PublicKey(creator) }, metadataPubKeys: [new PublicKey(streamId)],
    computePrice: Number(process.env.PRIORITY_MICROLAMPORTS || 100_000), computeLimit: 300_000,
  });
  const launchFee = LAUNCH_FEE_LAMPORTS();
  if (launchFee > 0 && creator !== TREASURY()) {
    lockIxs.push(SystemProgram.transfer({ fromPubkey: new PublicKey(creator), toPubkey: new PublicKey(TREASURY()), lamports: launchFee }));
  }

  const { blockhash } = await connection().getLatestBlockhash('confirmed');
  const lock = toB64(creator, blockhash, lockIxs);
  let feeTx = null;
  if (!skipFees) {
    const ixs = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 360_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: Number(process.env.PRIORITY_MICROLAMPORTS || 100_000) }),
      ...(await feeSharingIxs(creator, mint)),
    ];
    feeTx = toB64(creator, blockhash, ixs);
  }
  if (lock.size > 1232 || (feeTx && feeTx.size > 1232)) throw new Error(`Transaction too large (lock ${lock.size}, fees ${feeTx?.size})`);
  return {
    feeTx: feeTx?.b64 ?? null, lockTx: lock.b64, streamId,
    amount: amount.toString(), decimals, unlockAt, mode, days,
    streamflowFeePct: fee, launchFeeSol: launchFee / 1e9, sizes: { lock: lock.size, fees: feeTx?.size ?? 0 },
  };
}
