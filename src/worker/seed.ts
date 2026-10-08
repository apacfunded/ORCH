import { config } from "../config";
import { one, type Db } from "../db";
import { createSources } from "../server/context";
import { DEMO_ACCOUNTS } from "../sources/mock";
import type { Clock, TwitterSource } from "../sources/types";
import { log } from "./log";
import { Runner } from "./runner";

const STEP_MS = 10 * 60_000;

/** Add an account to the watchlist by handle. Returns the account id, or null if it can't be tracked. */
export async function addAccount(db: Db, twitter: TwitterSource, handle: string, pollMinutes = 5): Promise<{ id: number; handle: string } | null> {
  const p = await twitter.lookupUser(handle);
  if (!p || !p.isPublic) return null;
  const rows = await db.query<{ id: number; handle: string }>(
    `INSERT INTO accounts (x_user_id, handle, display_name, bio, followers, avatar_url, poll_minutes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (x_user_id) DO UPDATE SET active = TRUE
     RETURNING id, handle`,
    [p.userId, p.handle, p.displayName, p.bio, p.followers, p.avatarUrl, pollMinutes],
  );
  return rows[0];
}

interface SeedState {
  simNow: number;
  done: boolean;
}

async function readSeed(db: Db): Promise<SeedState | null> {
  const row = await one<{ value: SeedState }>(db, `SELECT value FROM worker_state WHERE key = 'seed'`);
  return row?.value ?? null;
}

async function writeSeed(db: Db, s: SeedState): Promise<void> {
  await db.query(
    `INSERT INTO worker_state (key, value, updated_at) VALUES ('seed', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       WHERE (worker_state.value->>'done')::boolean IS NOT TRUE
         AND (worker_state.value->>'simNow')::bigint <= (EXCLUDED.value->>'simNow')::bigint`,
    [JSON.stringify(s)],
  );
}

/**
 * Replay the simulated world in 10-minute steps through the real worker jobs, resumable across calls.
 * Each call works for at most `budgetMs`, so it fits inside a serverless function's time limit; the demo
 * catches up to the present over a few calls. Returns true once the replay has reached "now".
 *
 * - Fresh database: adds the demo accounts and starts `hours` in the past.
 * - Database that already has accounts and no seed record: treated as already seeded (never re-seeds).
 */
export async function advanceSeed(db: Db, opts: { hours?: number; budgetMs?: number } = {}): Promise<{ done: boolean; simNow: Date }> {
  const hours = opts.hours ?? 48;
  const budgetMs = opts.budgetMs ?? Number.POSITIVE_INFINITY;
  const started = Date.now();

  let state = await readSeed(db);
  if (state?.done) return { done: true, simNow: new Date(state.simNow) };

  let simNow = state?.simNow ?? Date.now() - hours * 60 * 60_000;
  const clock: Clock = { now: () => new Date(simNow) };
  const sources = createSources(clock);
  if (sources.twitter.name !== "mock") throw new Error("Demo seeding only runs with DATA_SOURCE=mock");

  if (!state) {
    const existing = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM accounts`);
    if (existing?.n) {
      await writeSeed(db, { simNow: Date.now(), done: true });
      return { done: true, simNow: new Date() };
    }
    for (const a of DEMO_ACCOUNTS) await addAccount(db, sources.twitter, a.handle);
    log("info", "seeding demo world", { accounts: DEMO_ACCOUNTS.length, hours });
    state = { simNow, done: false };
    await writeSeed(db, state);
  }

  const runner = new Runner(db, sources);
  // While replaying, re-check each tweet once per simulated hour instead of every 10 minutes: the replay
  // takes ~6x fewer queries and deletions still confirm (two misses an hour apart).
  const worker = config().worker;
  const liveRecheck = worker.recheckEveryMinutes;
  worker.recheckEveryMinutes = Math.max(liveRecheck, 60);
  try {
    while (Date.now() - simNow > STEP_MS && Date.now() - started < budgetMs) {
      await runner.cycle();
      simNow += STEP_MS;
      await writeSeed(db, { simNow, done: false });
    }
  } finally {
    worker.recheckEveryMinutes = liveRecheck;
  }

  const done = Date.now() - simNow <= STEP_MS;
  if (done) {
    simNow = Date.now();
    await runner.cycle();
    await writeSeed(db, { simNow, done: true });
    const counts = await db.query<{ type: string; n: number }>(`SELECT type, count(*)::int AS n FROM alerts GROUP BY type ORDER BY type`);
    log("info", "seed complete", { alerts: Object.fromEntries(counts.map((c) => [c.type, c.n])) });
  } else {
    log("info", "seed in progress", { simNow: new Date(simNow).toISOString() });
  }
  return { done, simNow: new Date(simNow) };
}

/** Seed the demo in one go (local dev, `npm run seed`). */
export async function seedDemo(db: Db, hours = 48): Promise<void> {
  await advanceSeed(db, { hours });
}
