import { config } from "../src/config";
import { getDb } from "../src/db";
import { log } from "../src/worker/log";
import { seedDemo } from "../src/worker/seed";

/**
 * `npm run seed` — fills the database with 72h of simulated CT activity (mock source only).
 * Safe to re-run: existing rows are skipped. Pass a number of hours: `npm run seed -- 24`.
 */
async function main() {
  if (config().dataSource !== "mock") {
    log("error", "Seeding is for the demo world only. Unset DATA_SOURCE / X_BEARER_TOKEN to use the mock source.");
    process.exit(1);
  }
  const hours = Number(process.argv[2] ?? 72);
  const db = await getDb();
  await seedDemo(db, Number.isFinite(hours) && hours > 0 ? hours : 72);
  await db.close();
}

main().catch((err) => {
  log("error", "seed failed", { err });
  process.exit(1);
});
