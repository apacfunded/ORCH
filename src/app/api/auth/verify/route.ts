import { NextResponse, type NextRequest } from "next/server";
import { config, sessionSecret } from "@/config";
import { getDb, one } from "@/db";
import { NONCE_TTL_MS, SESSION_COOKIE, SESSION_TTL_MS, signSession, verifySolanaSignature } from "@/lib/auth";
import { resolveTier } from "@/lib/gate";
import { refreshBalance } from "@/server/viewer";

export const dynamic = "force-dynamic";

/**
 * Step 2 of sign-in: verify the signed message server-side, mark the nonce used, read the token balance
 * from chain, and set an httpOnly session cookie. The client never decides its own tier.
 */
export async function POST(req: NextRequest) {
  let body: { wallet?: string; nonce?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { wallet, nonce, signature } = body;
  if (!wallet || !nonce || !signature) return NextResponse.json({ error: "Missing fields." }, { status: 400 });

  const db = await getDb();
  // Claim the nonce atomically so it can't be replayed.
  const row = await one<{ message: string; created_at: Date }>(
    db,
    `UPDATE auth_nonces SET used_at = now()
      WHERE nonce = $1 AND wallet = $2 AND used_at IS NULL
      RETURNING message, created_at`,
    [nonce, wallet],
  );
  if (!row || Date.now() - row.created_at.getTime() > NONCE_TTL_MS) {
    return NextResponse.json({ error: "This sign-in request expired. Try connecting again." }, { status: 401 });
  }
  if (!verifySolanaSignature(wallet, row.message, signature)) {
    return NextResponse.json({ error: "The signature didn't match this wallet. Try again." }, { status: 401 });
  }

  await db.query(`INSERT INTO users (wallet) VALUES ($1) ON CONFLICT (wallet) DO NOTHING`, [wallet]);
  const c = config();
  const balance = await refreshBalance(db, wallet, true);
  const isAdmin = c.adminWallets.includes(wallet);
  const tier = resolveTier({ mintConfigured: Boolean(c.mint), isAdmin, balance, minHold: c.minHold, whaleHold: c.whaleHold });

  const res = NextResponse.json({ wallet, tier, balance, isAdmin });
  res.cookies.set(SESSION_COOKIE, signSession({ wallet, exp: Date.now() + SESSION_TTL_MS }, sessionSecret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
