import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { buildSignInMessage, newNonce } from "@/lib/auth";
import { isSolanaAddress } from "@/lib/base58";

export const dynamic = "force-dynamic";

/** Step 1 of sign-in: the server issues a one-time message for the wallet to sign. */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "";
  if (!isSolanaAddress(wallet)) {
    return NextResponse.json({ error: "That doesn't look like a Solana wallet address." }, { status: 400 });
  }
  const db = await getDb();
  const nonce = newNonce();
  const issuedAt = new Date();
  const domain = req.headers.get("host") ?? "receipts";
  const message = buildSignInMessage({ domain, wallet, nonce, issuedAt });
  await db.query(`DELETE FROM auth_nonces WHERE created_at < now() - interval '1 day'`);
  await db.query(`INSERT INTO auth_nonces (nonce, wallet, message, created_at) VALUES ($1, $2, $3, $4)`, [nonce, wallet, message, issuedAt]);
  return NextResponse.json({ nonce, message }, { headers: { "cache-control": "no-store" } });
}
