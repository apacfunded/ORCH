// Key handling and the encrypted vault. Uses only WebCrypto (Ed25519 needs Chrome 137+).
import * as b58 from './base58.js';

const PKCS8_PREFIX = Uint8Array.from([0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20]);

const b64u = {
  dec(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); },
};
const b64 = {
  enc(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); },
  dec(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); },
};

// Accepts a Phantom/Solflare base58 private key (64 bytes), a 32-byte seed in base58,
// or a Solana CLI JSON array. Returns the 32-byte seed.
export function parseSecret(input) {
  const s = String(input).trim();
  let bytes;
  if (s.startsWith('[')) {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) throw new Error('Unrecognized key format');
    bytes = Uint8Array.from(arr);
  } else {
    bytes = b58.decode(s);
  }
  if (bytes.length !== 64 && bytes.length !== 32) throw new Error('Private key must be 64 bytes (or a 32-byte seed)');
  return bytes.slice(0, 32);
}

async function importSeed(seed) {
  const pkcs8 = new Uint8Array(48);
  pkcs8.set(PKCS8_PREFIX); pkcs8.set(seed, 16);
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'Ed25519' }, true, ['sign']);
}

export async function publicKeyFromSeed(seed) {
  const key = await importSeed(seed);
  const jwk = await crypto.subtle.exportKey('jwk', key);
  return b64u.dec(jwk.x);
}

// If the user pasted a 64-byte key, make sure its second half matches the derived public key.
export async function keypairFromSecret(input) {
  const s = String(input).trim();
  const raw = s.startsWith('[') ? Uint8Array.from(JSON.parse(s)) : b58.decode(s);
  const seed = raw.slice(0, 32);
  const pub = await publicKeyFromSeed(seed);
  if (raw.length === 64 && b58.encode(raw.slice(32)) !== b58.encode(pub)) {
    throw new Error('Private key is corrupted (public half does not match)');
  }
  if (raw.length !== 64 && raw.length !== 32) throw new Error('Private key must be 64 bytes (or a 32-byte seed)');
  return { seed, publicKey: pub, address: b58.encode(pub) };
}

export async function sign(seed, message) {
  const key = await importSeed(seed);
  return new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, key, message));
}

// ---- Vault: AES-GCM with a PBKDF2-derived key ----
const ITER = 310000;

async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptVault(password, data) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data))));
  return { v: 1, iter: ITER, salt: b64.enc(salt), iv: b64.enc(iv), ct: b64.enc(ct) };
}

export async function decryptVault(password, blob) {
  const key = await deriveKey(password, b64.dec(blob.salt));
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.dec(blob.iv) }, key, b64.dec(blob.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    throw new Error('Wrong password');
  }
}
