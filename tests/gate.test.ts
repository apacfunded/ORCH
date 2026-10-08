import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { buildSignInMessage, signSession, verifySession, verifySolanaSignature } from "../src/lib/auth";
import { base58Encode } from "../src/lib/base58";
import { canView, feedCutoff, minutesUntilPublic, resolveTier } from "../src/lib/gate";

const now = new Date("2026-10-08T12:00:00Z");
const tiers = { minHold: 100, whaleHold: 1_000_000 };

test("tiers: balance thresholds, admin override, closed gate before launch", () => {
  assert.equal(resolveTier({ mintConfigured: true, isAdmin: false, balance: 0, ...tiers }), "public");
  assert.equal(resolveTier({ mintConfigured: true, isAdmin: false, balance: 100, ...tiers }), "holder");
  assert.equal(resolveTier({ mintConfigured: true, isAdmin: false, balance: 2_000_000, ...tiers }), "whale");
  assert.equal(resolveTier({ mintConfigured: true, isAdmin: false, balance: null, ...tiers }), "public", "unknown balance is public");
  assert.equal(resolveTier({ mintConfigured: false, isAdmin: false, balance: 5_000_000, ...tiers }), "public", "no mint yet: nobody is live");
  assert.equal(resolveTier({ mintConfigured: false, isAdmin: true, balance: null, ...tiers }), "whale");
});

test("delayed feed: public sees only items older than the delay", () => {
  assert.equal(feedCutoff("public", now, 15).toISOString(), "2026-10-08T11:45:00.000Z");
  assert.equal(feedCutoff("holder", now, 15).getTime(), now.getTime());
  const fresh = new Date(now.getTime() - 5 * 60_000);
  const old = new Date(now.getTime() - 20 * 60_000);
  assert.equal(canView(fresh, "public", now, 15), false);
  assert.equal(canView(old, "public", now, 15), true);
  assert.equal(canView(fresh, "holder", now, 15), true);
  assert.equal(minutesUntilPublic(fresh, now, 15), 10);
});

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  return { wallet: base58Encode(raw), privateKey };
}

test("verifies a real Ed25519 wallet signature and rejects tampering", () => {
  const { wallet, privateKey } = keypair();
  const message = buildSignInMessage({ domain: "receipts.test", wallet, nonce: "abc123", issuedAt: now });
  const sig = base58Encode(sign(null, Buffer.from(message), privateKey));
  assert.equal(verifySolanaSignature(wallet, message, sig), true);
  assert.equal(verifySolanaSignature(wallet, message + " ", sig), false, "different message");
  assert.equal(verifySolanaSignature(keypair().wallet, message, sig), false, "different wallet");
  assert.equal(verifySolanaSignature(wallet, message, "notbase58!"), false);
  assert.equal(verifySolanaSignature("short", message, sig), false);
});

test("sessions: valid, tampered, expired, wrong secret", () => {
  const { wallet } = keypair();
  const token = signSession({ wallet, exp: now.getTime() + 60_000 }, "s3cret");
  assert.equal(verifySession(token, "s3cret", now.getTime())?.wallet, wallet);
  assert.equal(verifySession(token, "other", now.getTime()), null);
  assert.equal(verifySession(token, "s3cret", now.getTime() + 120_000), null, "expired");
  const [body, mac] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ wallet, exp: now.getTime() + 9e12 })).toString("base64url");
  assert.equal(verifySession(`${forged}.${mac}`, "s3cret", now.getTime()), null, "payload swap");
  assert.equal(verifySession(`${body}.`, "s3cret", now.getTime()), null);
  assert.equal(verifySession(undefined, "s3cret"), null);
});
