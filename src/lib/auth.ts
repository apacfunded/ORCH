import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import { base58Decode, isSolanaAddress } from "./base58";

/** Nonces are single use and expire after this long. */
export const NONCE_TTL_MS = 10 * 60_000;

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}

/**
 * The exact text the wallet signs. No transaction, nothing on chain — just proof of key ownership.
 * The server stores this string with the nonce and verifies the signature against the stored copy.
 */
export function buildSignInMessage(opts: { domain: string; wallet: string; nonce: string; issuedAt: Date }): string {
  return [
    `${opts.domain} wants you to sign in with your Solana account:`,
    opts.wallet,
    "",
    "Sign in to Receipts to check your $RECEIPTS balance for live access. This is free and does not send a transaction.",
    "",
    `Nonce: ${opts.nonce}`,
    `Issued At: ${opts.issuedAt.toISOString()}`,
  ].join("\n");
}

/** Ed25519 signature check using Node's built-in crypto (Solana keys are raw 32-byte Ed25519 public keys). */
export function verifySolanaSignature(wallet: string, message: string, signatureBase58: string): boolean {
  if (!isSolanaAddress(wallet)) return false;
  let sig: Uint8Array;
  try {
    sig = base58Decode(signatureBase58);
  } catch {
    return false;
  }
  if (sig.length !== 64) return false;
  try {
    const key = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(base58Decode(wallet)).toString("base64url") },
      format: "jwk",
    });
    return verify(null, Buffer.from(message, "utf8"), key, Buffer.from(sig));
  } catch {
    return false;
  }
}

// ── Sessions: compact HMAC-signed tokens (payload.signature), httpOnly cookie only ─────────────────────

export interface SessionPayload {
  wallet: string;
  /** Expiry, unix ms. */
  exp: number;
}

export const SESSION_COOKIE = "rcpt_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;

function hmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body, secret)}`;
}

export function verifySession(token: string | undefined | null, secret: string, now = Date.now()): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(hmac(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.wallet !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp <= now) return null;
    if (!isSolanaAddress(payload.wallet)) return null;
    return payload;
  } catch {
    return null;
  }
}
