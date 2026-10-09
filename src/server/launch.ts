import "server-only";
import { config } from "../config";
import { one, type Db } from "../db";
import { isSolanaAddress } from "../lib/base58";

/**
 * Launch info: the $RECEIPTS contract address and where to buy it.
 *
 * An admin can paste the CA on /admin and it goes live on the next request, with no redeploy.
 * RECEIPTS_MINT / PUMP_URL env vars still work as a fallback. The database value wins.
 */
export interface Launch {
  mint: string;
  pumpUrl: string;
  dexUrl: string;
}

const EMPTY: Launch = { mint: "", pumpUrl: "", dexUrl: "" };
const TTL_MS = 10_000;
let cached: { at: number; value: Launch } | null = null;

export function buildLaunch(mint: string, pumpUrl = ""): Launch {
  if (!mint || !isSolanaAddress(mint)) return EMPTY;
  return {
    mint,
    pumpUrl: pumpUrl || `https://pump.fun/coin/${mint}`,
    dexUrl: `https://dexscreener.com/solana/${mint}`,
  };
}

function fromEnv(): Launch {
  const c = config();
  return buildLaunch(c.mint, c.pumpUrl);
}

/** Current launch info. Cached per instance for a few seconds so it isn't a query per request. */
export async function getLaunch(db: Db | null): Promise<Launch> {
  if (!db) return fromEnv();
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  let value = fromEnv();
  try {
    const row = await one<{ value: { mint?: string; pumpUrl?: string } }>(db, `SELECT value FROM settings WHERE key = 'launch'`);
    if (row?.value?.mint) value = buildLaunch(row.value.mint, row.value.pumpUrl ?? "");
  } catch {
    // Keep the env fallback if the settings read fails.
  }
  cached = { at: Date.now(), value };
  return value;
}

export async function saveLaunch(db: Db, mint: string, pumpUrl: string): Promise<void> {
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('launch', $1::text::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify({ mint, pumpUrl })],
  );
  cached = null;
}

export async function clearLaunch(db: Db): Promise<void> {
  await db.query(`DELETE FROM settings WHERE key = 'launch'`);
  cached = null;
}
