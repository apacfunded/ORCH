import { config } from "../config";
import { getDb } from "../db";
import { log } from "./log";
import { startLoop } from "./runner";

/**
 * Standalone worker: `npm run worker`. Use this in production next to `npm start`, pointed at the same
 * DATABASE_URL. (Without DATABASE_URL, run only `npm run dev` — the worker runs inside it.)
 */
async function main() {
  const c = config();
  if (!c.databaseUrl) {
    log("warn", "No DATABASE_URL: the embedded PGlite database can only be opened by one process. Use `npm run dev` (it runs the worker inline) or set DATABASE_URL.");
  }
  const db = await getDb();
  const stop = startLoop(db);
  const shutdown = async (sig: string) => {
    log("info", "shutting down", { sig });
    stop();
    await db.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  log("error", "worker failed to start", { err });
  process.exit(1);
});
