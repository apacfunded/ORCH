import "server-only";
import { after } from "next/server";
import { config } from "../config";
import { getDb, one } from "../db";
import { log } from "../worker/log";
import { runTick } from "../worker/tick";

/** Run a tick when the last one finished longer ago than this. */
const STALE_MS = 4 * 60_000;
let lastCheck = 0;

/**
 * Traffic-driven worker for serverless hosts: when someone loads a page and the worker hasn't run for a few
 * minutes, run one bounded tick after the response is sent. Combined with the daily Vercel Cron and the
 * optional GitHub Actions schedule, the site keeps itself fresh with no always-on server.
 */
export function kickWorker() {
  const c = config();
  if (!c.databaseUrl || c.runWorkerInline) return;
  const now = Date.now();
  if (now - lastCheck < 30_000) return; // at most one check per instance per 30s
  lastCheck = now;
  after(async () => {
    try {
      const db = await getDb();
      const hb = await one<{ updated_at: Date }>(db, `SELECT updated_at FROM worker_state WHERE key = 'heartbeat'`);
      if (hb && Date.now() - new Date(hb.updated_at).getTime() < STALE_MS) return;
      const r = await runTick(db, 25_000);
      log("info", "traffic tick", r);
    } catch (err) {
      log("warn", "traffic tick failed", { err });
    }
  });
}
