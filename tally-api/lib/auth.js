import crypto from 'node:crypto';

// Wallet sign-in: the wallet signs a plain-text message (no transaction, no funds),
// we verify the ed25519 signature and hand back a signed session token.

const SECRET = () => {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.VERCEL_ENV === 'production') throw new Error('SESSION_SECRET is not set');
  return s || 'dev-only-secret-change-me';
};
const TOKEN_TTL = 7 * 24 * 3600_000;

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// --- base58 (Solana addresses) ---
const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58decode(s) {
  if (typeof s !== 'string' || !s) return null;
  let n = 0n;
  for (const ch of s) { const i = ALPHA.indexOf(ch); if (i < 0) return null; n = n * 58n + BigInt(i); }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  for (const ch of s) { if (ch === '1') bytes.unshift(0); else break; }
  return Buffer.from(bytes);
}

export function loginMessage(wallet, issuedAt) {
  return `Sign in to Tally\n\nWallet: ${wallet}\nIssued: ${issuedAt}\n\nThis only proves you own this wallet. It does not send a transaction or move funds.`;
}

const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');
function verifyEd25519(message, sigBytes, pubBytes) {
  const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519, pubBytes]), format: 'der', type: 'spki' });
  return crypto.verify(null, Buffer.from(message, 'utf8'), key, sigBytes);
}

export function verifyLogin({ wallet, issuedAt, signature }) {
  const t = Date.parse(issuedAt);
  if (!t || Math.abs(Date.now() - t) > 5 * 60_000) throw new HttpError(400, 'That sign-in request expired. Connect again.');
  const pub = b58decode(wallet);
  if (!pub || pub.length !== 32) throw new HttpError(400, 'That wallet address is not valid.');
  let sig;
  try { sig = Buffer.from(String(signature || ''), 'base64'); } catch { sig = Buffer.alloc(0); }
  if (sig.length !== 64) throw new HttpError(400, 'The wallet returned an unreadable signature. Try again.');
  if (!verifyEd25519(loginMessage(wallet, issuedAt), sig, pub)) throw new HttpError(401, 'The signature does not match this wallet.');
  return makeToken(wallet);
}

const hmac = s => crypto.createHmac('sha256', SECRET()).update(s).digest('base64url');
export function makeToken(wallet) {
  const payload = `${wallet}.${Date.now() + TOKEN_TTL}`;
  return `${payload}.${hmac(payload)}`;
}

export function readWallet(req, { required = true } = {}) {
  const h = req.headers?.authorization || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const i = tok.lastIndexOf('.');
  if (i > 0) {
    const payload = tok.slice(0, i), sig = tok.slice(i + 1);
    const good = hmac(payload);
    if (sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) {
      const [wallet, exp] = payload.split('.');
      if (Number(exp) > Date.now()) return wallet;
    }
  }
  if (required) throw new HttpError(401, 'Connect your wallet first.');
  return null;
}
