// Hand-built legacy Solana transactions (no dependencies): SOL transfers from a wallet we hold.
import { sign } from 'node:crypto';
import { b58decode } from './base58';
import type { Keypair } from './keys';
import { SolanaRpc, SYSTEM_PROGRAM, LAMPORTS } from './rpc';

function compactU16(n: number): number[] {
  const out: number[] = [];
  do { let b = n & 0x7f; n >>= 7; if (n) b |= 0x80; out.push(b); } while (n);
  return out;
}

/** Serialized, signed transaction moving `sol` from `from` to each recipient (one transfer instruction per recipient). */
export function buildTransfer(from: Keypair, recipients: { to: string; sol: number }[], recentBlockhash: string): Uint8Array {
  if (!recipients.length) throw new Error('Nothing to send.');
  const keys = [b58decode(from.publicKey), ...recipients.map((r) => b58decode(r.to)), b58decode(SYSTEM_PROGRAM)];
  // Dedupe while keeping order (payer first, program last).
  const seen = new Map<string, number>();
  const acct: Uint8Array[] = [];
  const idx = (k: Uint8Array) => { const s = Buffer.from(k).toString('hex'); if (!seen.has(s)) { seen.set(s, acct.length); acct.push(k); } return seen.get(s)!; };
  idx(keys[0]);
  const toIdx = recipients.map((r) => idx(b58decode(r.to)));
  const progIdx = idx(b58decode(SYSTEM_PROGRAM));
  const header = [1, 0, 1]; // 1 signer (payer), 0 readonly signed, 1 readonly unsigned (the program)
  const ixs = recipients.flatMap((r, i) => {
    const lamports = BigInt(Math.round(r.sol * LAMPORTS));
    const data = Buffer.alloc(12); data.writeUInt32LE(2, 0); data.writeBigUInt64LE(lamports, 4); // SystemProgram::Transfer
    return [progIdx, ...compactU16(2), 0, toIdx[i], ...compactU16(data.length), ...data];
  });
  const msg = Buffer.concat([
    Buffer.from(header), Buffer.from(compactU16(acct.length)), ...acct.map((a) => Buffer.from(a)),
    Buffer.from(b58decode(recentBlockhash)), Buffer.from(compactU16(recipients.length)), Buffer.from(ixs),
  ]);
  const sig = sign(null, msg, from.privateKey);
  return Buffer.concat([Buffer.from(compactU16(1)), sig, msg]);
}

/** Send SOL and wait for confirmation. Returns the signature. */
export async function sendSol(rpc: SolanaRpc, from: Keypair, recipients: { to: string; sol: number }[]): Promise<string> {
  const bh = await rpc.call<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const tx = buildTransfer(from, recipients, bh.value.blockhash);
  const sig = await rpc.sendRaw(tx);
  await rpc.confirm(sig);
  return sig;
}
