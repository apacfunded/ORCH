// Deterministic wallets: every key is derived from MASTER_SEED, so the store never holds a secret.
import { createHmac, createPrivateKey, createPublicKey } from 'node:crypto';
import { CFG } from './config.js';
import { b58encode } from './base58.js';
import { keypairFromSecret, type Keypair } from './keys.js';

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export function derive(label: string): Keypair {
  if (!CFG.masterSeed || CFG.masterSeed.length < 32) throw new Error('MASTER_SEED must be set (32+ random characters). Never change it after the first launch.');
  const seed = createHmac('sha256', CFG.masterSeed).update(label).digest();
  const priv = createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' });
  const pub = createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(-32);
  return keypairFromSecret(b58encode(Buffer.concat([seed, pub])));
}

export const creatorFor = (launchId: string) => derive(`creator:${launchId}`);
export const mintFor = (launchId: string) => derive(`mint:${launchId}`);
