import { config as loadConfig } from "../config";
import type { Db } from "../db";
import { createSources, getThresholds, type Sources } from "../server/context";
import { RateLimitError } from "../sources/types";
import { checkProfiles, detectCoordination, ingestDueAccounts, recheckTweets, scoreCalls, type JobContext } from "./jobs";
import { log } from "./log";

type JobName = "ingest" | "recheck" | "profiles" | "score" | "coordination";

const JOBS: { name: JobName; everyMs: (c: ReturnType<typeof loadConfig>) => number; run: (ctx: JobContext) => Promise<unknown> }[] = [
  { name: "ingest", everyMs: () => 0, run: ingestDueAccounts }, // per-account schedule lives in the table
  { name: "recheck", everyMs: (c) => Math.min(c.worker.recheckEveryMinutes, 5) * 60_000, run: recheckTweets },
  { name: "profiles", everyMs: () => 0, run: checkProfiles }, // per-account schedule lives in the table
  { name: "score", everyMs: () => 5 * 60_000, run: scoreCalls },
  { name: "coordination", everyMs: () => 60_000, run: detectCoordination },
];

/**
 * Runs each job when it is due. A job that throws is logged and retried next cycle; a rate-limited job is
 * paused until the provider's reset time. Nothing here can crash the process.
 */
export class Runner {
  private lastRun = new Map<JobName, number>();
  private pausedUntil = new Map<JobName, number>();

  constructor(
    private readonly db: Db,
    private readonly sources: Sources = createSources(),
  ) {}

  async cycle(): Promise<Record<string, unknown>> {
    const cfg = loadConfig();
    const now = this.sources.clock.now().getTime();
    const thresholds = await getThresholds(this.db);
    const ctx: JobContext = { db: this.db, sources: this.sources, config: cfg, thresholds };
    const results: Record<string, unknown> = {};

    for (const job of JOBS) {
      if ((this.pausedUntil.get(job.name) ?? 0) > now) continue;
      if (now - (this.lastRun.get(job.name) ?? 0) < job.everyMs(cfg)) continue;
      this.lastRun.set(job.name, now);
      const t0 = Date.now();
      try {
        results[job.name] = await job.run(ctx);
        results[`${job.name}Ms`] = Date.now() - t0;
      } catch (err) {
        if (err instanceof RateLimitError) {
          this.pausedUntil.set(job.name, err.resetAt.getTime());
          log("warn", "rate limited — pausing job", { job: job.name, until: err.resetAt.toISOString() });
        } else {
          log("error", "job failed", { job: job.name, err });
        }
        results[job.name] = "error";
      }
    }

    await this.db
      .query(
        `INSERT INTO worker_state (key, value, updated_at) VALUES ('heartbeat', $1::jsonb, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
        [JSON.stringify({ at: new Date(now).toISOString(), results }), new Date(now)],
      )
      .catch((err) => log("warn", "heartbeat write failed", { err }));
    return results;
  }
}

/** Start the endless loop (used by `npm run worker` and by the inline worker in dev). */
export function startLoop(db: Db, sources?: Sources): () => void {
  const runner = new Runner(db, sources);
  const tickMs = loadConfig().worker.tickSeconds * 1000;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      const r = await runner.cycle();
      log("debug", "cycle", r);
    } catch (err) {
      log("error", "cycle crashed", { err });
    }
    if (!stopped) timer = setTimeout(tick, tickMs);
  };
  void tick();
  log("info", "worker started", { tickSeconds: tickMs / 1000, source: runner["sources"].twitter.name });
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
