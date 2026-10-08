import { config } from "../config";
import { getDb, one } from "../db";
import { log } from "./log";
import { startLoop } from "./runner";
import { seedDemo } from "./seed";

const g = globalThis as unknown as { __receiptsWorker?: boolean };

/**
 * Runs the worker inside the Next.js server process (local dev without DATABASE_URL, or RUN_WORKER_INLINE=1).
 * On a brand-new mock database it first replays 48h of the simulated world so the site opens full.
 */
export async function startInlineWorker() {
  const c = config();
  if (!c.runWorkerInline || g.__receiptsWorker) return;
  g.__receiptsWorker = true;

  const db = await getDb();
  void (async () => {
    try {
      if (c.dataSource === "mock") {
        const any = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM accounts`);
        if (!any?.n) {
          log("info", "empty database — seeding 48h of demo data (takes a minute; the site fills in as it goes)");
          await seedDemo(db, 48);
        }
      }
    } catch (err) {
      log("error", "demo seed failed", { err });
    }
    startLoop(db);
  })();
}
