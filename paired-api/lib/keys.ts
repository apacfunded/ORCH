import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';
import { b58decode, b58encode } from './base58.js';

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export interface Keypair {
  publicKey: string; // base58
  privateKey: KeyObject;
}

/** Load a keypair from a base58 64-byte secret key (Phantom / solana-keygen export format). */
export function keypairFromSecret(secretB58: string): Keypair {
  const raw = b58decode(secretB58.trim());
  if (raw.length !== 64) throw new Error('Secret key must be 64 bytes (base58). Export it from Phantom or solana-keygen.');
  const seed = raw.subarray(0, 32);
  const pub = raw.subarray(32);
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' });
  const derivedPub = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(SPKI_PREFIX.length);
  if (!Buffer.from(derivedPub).equals(Buffer.from(pub))) throw new Error('Secret key is corrupted: public half does not match.');
  return { publicKey: b58encode(pub), privateKey };
}

export function verifyMessage(pubkeyB58: string, message: Uint8Array, signature: Uint8Array): boolean {
  const pub = b58decode(pubkeyB58);
  if (pub.length !== 32 || signature.length !== 64) return false;
  const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, pub]), format: 'der', type: 'spki' });
  return verify(null, message, key, signature);
}

function readCompactU16(buf: Uint8Array, off: number): [number, number] {
  let val = 0, size = 0;
  for (;;) {
    const b = buf[off + size];
    val |= (b & 0x7f) << (7 * size);
    size++;
    if ((b & 0x80) === 0) break;
  }
  return [val, size];
}

/**
 * Sign a serialized Solana transaction (legacy or v0) in place for `kp`.
 * Returns the signed bytes. Throws if kp is not one of the required signers.
 */
export function signSerializedTx(txBytes: Uint8Array, kp: Keypair): Uint8Array {
  const tx = Uint8Array.from(txBytes);
  const [numSigs, sigLen] = readCompactU16(tx, 0);
  const msgStart = sigLen + numSigs * 64;
  const msg = tx.subarray(msgStart);
  let p = 0;
  if (msg[0] & 0x80) p = 1; // versioned message prefix
  const numRequired = msg[p];
  p += 3; // header: required sigs, readonly signed, readonly unsigned
  const [, keyLen] = readCompactU16(msg, p);
  p += keyLen;
  const me = b58decode(kp.publicKey);
  let idx = -1;
  for (let i = 0; i < numRequired; i++) {
    const k = msg.subarray(p + i * 32, p + i * 32 + 32);
    if (Buffer.from(k).equals(Buffer.from(me))) { idx = i; break; }
  }
  if (idx < 0) throw new Error(`Wallet ${kp.publicKey} is not a signer on this transaction.`);
  const sig = sign(null, msg, kp.privateKey);
  tx.set(sig, sigLen + idx * 64);
  return tx;
}
