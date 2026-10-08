import "server-only";
import { cookies } from "next/headers";
import { config, sessionSecret } from "../config";
import { getDb, one, type Db } from "../db";
import { SESSION_COOKIE, verifySession } from "../lib/auth";
import { resolveTier, type Tier } from "../lib/gate";
import { getTokenBalance } from "../lib/solana";

export interface Viewer {
  wallet: string | null;
  tier: Tier;
  isAdmin: boolean;
  balance: number | null;
  /** True once $RECEIPTS has launched (RECEIPTS_MINT set) and holding unlocks the live feed. */
  gateOpen: boolean;
  delayMinutes: number;
}

/** Refresh a wallet's balance if it is stale. Keeps the last known balance when the RPC fails. */
export async function refreshBalance(db: Db, wallet: string, force = false): Promise<number | null> {
  const c = config();
  if (!c.mint) return null;
  const user = await one<{ balance: number | null; checked_at: Date | null }>(db, `SELECT balance, checked_at FROM users WHERE wallet = $1`, [wallet]);
  const stale = !user?.checked_at || Date.now() - user.checked_at.getTime() > c.balanceRecheckSec * 1000;
  if (!force && !stale) return user?.balance ?? null;
  try {
    const balance = await getTokenBalance(c.solanaRpcUrl, wallet, c.mint);
    await db.query(
      `INSERT INTO users (wallet, balance, checked_at) VALUES ($1, $2, now())
       ON CONFLICT (wallet) DO UPDATE SET balance = EXCLUDED.balance, checked_at = EXCLUDED.checked_at`,
      [wallet, balance],
    );
    return balance;
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", msg: "balance check failed", wallet, err: String(err) }));
    return user?.balance ?? null;
  }
}

/** Who is looking, and what they may see. Every gated read goes through here — never trust the client. */
export async function getViewer(): Promise<Viewer> {
  const c = config();
  const base: Viewer = {
    wallet: null,
    tier: "public",
    isAdmin: false,
    balance: null,
    gateOpen: Boolean(c.mint),
    delayMinutes: c.publicDelayMinutes,
  };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = verifySession(token, sessionSecret());
  if (!session) return base;

  const db = await getDb();
  const isAdmin = c.adminWallets.includes(session.wallet);
  const balance = await refreshBalance(db, session.wallet);
  const tier = resolveTier({ mintConfigured: Boolean(c.mint), isAdmin, balance, minHold: c.minHold, whaleHold: c.whaleHold });
  return { ...base, wallet: session.wallet, isAdmin, balance, tier };
}
