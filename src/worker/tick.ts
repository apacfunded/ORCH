import { randomUUID } from "node:crypto";
import { config } from "../config";
import { one, type Db } from "../db";
import { log } from "./log";
import { Runner } from "./runner";
import { advanceSeed } from "./seed";

/**
 * One bounded unit of worker work, for serverless hosts (Vercel) where nothing runs between requests.
 * Called by a scheduler (GitHub Actions every 5 min, or Vercel Cron on Pro) via /api/cron/worker.
 *
 * A lease row stops two overlapping ticks from processing the same tweets twice.
 */
export async function runTick(db: Db, budgetMs = 45_000): Promise<Record<string, unknown>> {
  const owner = randomUUID();
  const leaseMs = budgetMs + 30_000;
  const got = await one<{ key: string }>(
    db,
    `INSERT INTO worker_state (key, value, updated_at)
     VALUES ('lease', jsonb_build_object('until', $1::timestamptz, 'owner', $2::text), now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       WHERE (worker_state.value->>'until')::timestamptz < now()
     RETURNING key`,
    [new Date(Date.now() + leaseMs), owner],
  );
  if (!got) return { skipped: "another tick is still running" };

  try {
    if (config().dataSource === "mock") {
      const seed = await advanceSeed(db, { hours: 36, budgetMs });
      if (!seed.done) return { seeding: true, simulatedUpTo: seed.simNow.toISOString() };
    }
    const results = await new Runner(db).cycle();
    return { ok: true, results };
  } catch (err) {
    log("error", "tick failed", { err });
    throw err;
  } finally {
    await db.query(`DELETE FROM worker_state WHERE key = 'lease' AND value->>'owner' = $1`, [owner]).catch(() => {});
  }
}
