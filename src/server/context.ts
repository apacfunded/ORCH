import { config, type Thresholds } from "../config";
import { one, type Db } from "../db";
import { MockPrices, MockTwitterSource } from "../sources/mock";
import { DexScreenerPrices } from "../sources/prices";
import { systemClock, type Clock, type PriceSource, type TwitterSource } from "../sources/types";
import { XApiSource } from "../sources/xapi";

export interface Sources {
  twitter: TwitterSource;
  prices: PriceSource;
  clock: Clock;
}

export function createSources(clock: Clock = systemClock): Sources {
  const c = config();
  const twitter = c.dataSource === "x" ? new XApiSource(c.xBearerToken) : new MockTwitterSource(clock);
  const prices = c.priceSource === "dexscreener" ? new DexScreenerPrices() : new MockPrices(clock);
  return { twitter, prices, clock };
}

/** Thresholds = env defaults, overridden by whatever an admin saved in the settings table. */
export async function getThresholds(db: Db): Promise<Thresholds> {
  const row = await one<{ value: Partial<Thresholds> }>(db, `SELECT value FROM settings WHERE key = 'thresholds'`);
  const merged = { ...config().thresholds };
  for (const [k, v] of Object.entries(row?.value ?? {})) {
    if (k in merged && typeof v === "number" && Number.isFinite(v) && v >= 0) {
      (merged as Record<string, number>)[k] = v;
    }
  }
  return merged;
}

export async function saveThresholds(db: Db, t: Thresholds): Promise<void> {
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('thresholds', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(t)],
  );
}
