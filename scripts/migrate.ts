import { getDb, migrate } from "../src/db";
import { log } from "../src/worker/log";

/** `npm run migrate` — applies any pending SQL files in src/db/migrations (getDb also does this on boot). */
async function main() {
  const db = await getDb();
  const applied = await migrate(db);
  log("info", "migrations up to date", { applied });
  await db.close();
}

main().catch((err) => {
  log("error", "migration failed", { err });
  process.exit(1);
});
