import type { Db } from "../db";
import { createSources } from "../server/context";
import { DEMO_ACCOUNTS } from "../sources/mock";
import type { Clock, TwitterSource } from "../sources/types";
import { log } from "./log";
import { Runner } from "./runner";

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

/**
 * Seed the demo: add every mock account, then replay the last `hours` of the simulated world in 10-minute
 * steps through the real worker jobs. The feed, scorecards and leaderboard start full and every timestamp
 * is consistent with what the live worker produces afterwards.
 */
export async function seedDemo(db: Db, hours = 72): Promise<void> {
  const end = Date.now();
  let simNow = end - hours * 60 * 60_000;
  const clock: Clock = { now: () => new Date(simNow) };
  const sources = createSources(clock);
  if (sources.twitter.name !== "mock") throw new Error("seedDemo only runs with DATA_SOURCE=mock");

  for (const a of DEMO_ACCOUNTS) await addAccount(db, sources.twitter, a.handle);
  log("info", "seeding demo world", { accounts: DEMO_ACCOUNTS.length, hours });

  const runner = new Runner(db, sources);
  const step = 10 * 60_000;
  for (; simNow <= end; simNow += step) {
    await runner.cycle();
  }
  simNow = end;
  await runner.cycle();
  const counts = await db.query<{ type: string; n: number }>(`SELECT type, count(*)::int AS n FROM alerts GROUP BY type ORDER BY type`);
  log("info", "seed complete", { alerts: Object.fromEntries(counts.map((c) => [c.type, c.n])) });
}
