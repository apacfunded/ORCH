import type { Config, Thresholds } from "../config";
import { one, type Db } from "../db";
import { extractCalls } from "../lib/ai-extract";
import type { CallPayload, CoordinatedPayload, DeletedPayload, EditedPayload, ProfileChangePayload } from "../lib/alerts";
import { detectCoordinated } from "../lib/trackers/coordination";
import { looksLikeAccountOutage, nextDeletionState, type TweetStatus } from "../lib/trackers/deletion";
import { diffProfile } from "../lib/trackers/profile";
import { HORIZONS } from "../lib/trackers/scorecard";
import type { Sources } from "../server/context";
import type { TweetLookup } from "../sources/types";
import { log } from "./log";

export interface JobContext {
  db: Db;
  sources: Sources;
  config: Config;
  thresholds: Thresholds;
}

interface AccountRow {
  id: number;
  x_user_id: string;
  handle: string;
  display_name: string;
  bio: string;
  followers: number;
  last_tweet_id: string | null;
  last_profile_at: Date | null;
}

/** Calls older than this at ingestion are stored but never priced: a late price would fake the result. */
const MAX_PRICING_LAG_MS = 30 * 60_000;
/** One coordinated-push receipt per coin per this long. */
const COORD_COOLDOWN_MS = 6 * 60 * 60_000;
/** Only fill a horizon close to when it is due; a value taken days late would be wrong. */
const HORIZON_GRACE_MS = 6 * 60 * 60_000;

/** Tweet ids are 64-bit integers in decimal; compare without losing precision. */
export function compareIds(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

async function insertAlert(
  db: Db,
  a: { type: string; accountId: number | null; tweetId?: string | null; ca?: string | null; payload: unknown; createdAt: Date },
): Promise<number> {
  const row = await one<{ id: number }>(
    db,
    `INSERT INTO alerts (type, account_id, tweet_id, ca, payload, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`,
    [a.type, a.accountId, a.tweetId ?? null, a.ca ?? null, JSON.stringify(a.payload), a.createdAt],
  );
  return row!.id;
}

async function safePrice(ctx: JobContext, ca: string, cache?: Map<string, number | null>): Promise<number | null> {
  if (cache?.has(ca)) return cache.get(ca)!;
  try {
    const v = await ctx.sources.prices.getMarketCap(ca);
    cache?.set(ca, v);
    return v;
  } catch (err) {
    log("warn", "price lookup failed", { ca, err });
    return null;
  }
}

// ── 1. Ingest new tweets + extract calls ───────────────────────────────────────────────────────────────

export async function ingestDueAccounts(ctx: JobContext): Promise<number> {
  const now = ctx.sources.clock.now();
  const accounts = await ctx.db.query<AccountRow>(
    `SELECT id, x_user_id, handle, display_name, bio, followers, last_tweet_id, last_profile_at
       FROM accounts
      WHERE active AND (last_polled_at IS NULL OR last_polled_at <= $1::timestamptz - make_interval(mins => poll_minutes))
      ORDER BY last_polled_at NULLS FIRST
      LIMIT 50`,
    [now],
  );
  let inserted = 0;
  for (const acc of accounts) inserted += await ingestAccount(ctx, acc);
  return inserted;
}

export async function ingestAccount(ctx: JobContext, acc: AccountRow): Promise<number> {
  const { db, sources, config } = ctx;
  const now = sources.clock.now();
  const tweets = await sources.twitter.fetchUserTweets(acc.x_user_id, acc.last_tweet_id);
  tweets.sort((a, b) => compareIds(a.id, b.id));
  const ai = config.anthropicApiKey ? { apiKey: config.anthropicApiKey, model: config.aiModel } : null;

  let inserted = 0;
  let newest = acc.last_tweet_id;
  for (const t of tweets) {
    if (!newest || compareIds(t.id, newest) > 0) newest = t.id;
    const row = await one<{ id: string }>(
      db,
      `INSERT INTO tweets (id, account_id, original_text, current_text, posted_at, ingested_at, last_checked_at)
       VALUES ($1, $2, $3, $3, $4, $5, $5)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [t.id, acc.id, t.text, t.postedAt, now],
    );
    if (!row) continue;
    inserted++;
    await db.query(`INSERT INTO tweet_versions (tweet_id, text, seen_at) VALUES ($1, $2, $3)`, [t.id, t.text, now]);

    const calls = await extractCalls(t.text, ai);
    const fresh = now.getTime() - t.postedAt.getTime() <= MAX_PRICING_LAG_MS;
    for (const c of calls) {
      const mcap = c.ca && fresh ? await safePrice(ctx, c.ca) : null;
      const callRow = await one<{ id: number }>(
        db,
        `INSERT INTO calls (tweet_id, account_id, ca, ticker, sentiment, confidence, called_at, mcap_at_call)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT DO NOTHING RETURNING id`,
        [t.id, acc.id, c.ca, c.ticker, c.sentiment, c.confidence, t.postedAt, mcap],
      );
      if (!callRow || !c.ca || c.sentiment === "bearish") continue;
      const payload: CallPayload = {
        handle: acc.handle,
        displayName: acc.display_name,
        tweetId: t.id,
        text: t.text,
        postedAt: t.postedAt.toISOString(),
        ca: c.ca,
        ticker: c.ticker,
        sentiment: c.sentiment,
        mcapAtCall: mcap,
      };
      await insertAlert(db, { type: "call", accountId: acc.id, tweetId: t.id, ca: c.ca, payload, createdAt: t.postedAt });
    }
  }
  await db.query(`UPDATE accounts SET last_tweet_id = $2, last_polled_at = $3 WHERE id = $1`, [acc.id, newest, now]);
  if (inserted) log("debug", "ingested tweets", { handle: acc.handle, inserted });
  return inserted;
}

// ── 2. Re-check recent tweets: deletions + edits ───────────────────────────────────────────────────────

interface RecheckRow {
  id: string;
  account_id: number;
  original_text: string;
  current_text: string;
  posted_at: Date;
  status: TweetStatus;
  fail_count: number;
  first_failed_at: Date | null;
  handle: string;
  display_name: string;
}

export async function recheckTweets(ctx: JobContext): Promise<{ checked: number; deleted: number; edited: number }> {
  const { db, sources, config, thresholds } = ctx;
  const now = sources.clock.now();
  const rows = await db.query<RecheckRow>(
    `SELECT t.id, t.account_id, t.original_text, t.current_text, t.posted_at, t.status, t.fail_count, t.first_failed_at,
            a.handle, a.display_name
       FROM tweets t JOIN accounts a ON a.id = t.account_id
      WHERE t.status IN ('live', 'unconfirmed')
        AND t.posted_at > $1::timestamptz - make_interval(hours => $2::int)
        AND (t.last_checked_at IS NULL OR t.last_checked_at <= $1::timestamptz - make_interval(mins => $3::int)
             OR t.status = 'unconfirmed')
      ORDER BY t.last_checked_at NULLS FIRST
      LIMIT 500`,
    [now, config.worker.recheckHours, config.worker.recheckEveryMinutes],
  );
  if (rows.length === 0) return { checked: 0, deleted: 0, edited: 0 };

  const lookups = await sources.twitter.fetchTweets(rows.map((r) => r.id));

  // Per-account outage guard.
  const perAccount = new Map<number, { checked: number; missing: number }>();
  for (const r of rows) {
    const s = perAccount.get(r.account_id) ?? { checked: 0, missing: 0 };
    s.checked++;
    if (lookups.get(r.id)?.kind === "missing") s.missing++;
    perAccount.set(r.account_id, s);
  }
  const outage = new Set<number>();
  for (const [accountId, s] of perAccount) {
    if (looksLikeAccountOutage(s.checked, s.missing)) {
      outage.add(accountId);
      log("warn", "account looks private/suspended — skipping deletion checks this pass", { accountId, ...s });
    }
  }

  let deleted = 0;
  let edited = 0;
  for (const r of rows) {
    let outcome: TweetLookup = lookups.get(r.id) ?? { kind: "error" };
    if (outcome.kind === "missing" && outage.has(r.account_id)) outcome = { kind: "error" };

    if (outcome.kind === "found" && outcome.text !== r.current_text) {
      edited++;
      await db.query(`INSERT INTO tweet_versions (tweet_id, text, seen_at) VALUES ($1, $2, $3)`, [r.id, outcome.text, now]);
      await db.query(`UPDATE tweets SET current_text = $2, edited = TRUE WHERE id = $1`, [r.id, outcome.text]);
      const payload: EditedPayload = {
        handle: r.handle,
        displayName: r.display_name,
        tweetId: r.id,
        before: r.current_text,
        after: outcome.text,
        postedAt: r.posted_at.toISOString(),
        editSeenAt: now.toISOString(),
      };
      await insertAlert(db, { type: "edited", accountId: r.account_id, tweetId: r.id, payload, createdAt: now });
    }

    const { state, event } = nextDeletionState(
      { status: r.status, failCount: r.fail_count, firstFailedAt: r.first_failed_at },
      outcome,
      now,
      { confirmFails: thresholds.deleteConfirmFails, confirmGapMinutes: thresholds.deleteConfirmGapMinutes },
    );
    await db.query(
      `UPDATE tweets SET status = $2, fail_count = $3, first_failed_at = $4, last_checked_at = $5,
              deleted_at = CASE WHEN $2 = 'deleted' AND deleted_at IS NULL THEN $5 ELSE deleted_at END
        WHERE id = $1`,
      [r.id, state.status, state.failCount, state.firstFailedAt, now],
    );

    if (event === "deleted") {
      deleted++;
      const calls = await db.query<{ ca: string; ticker: string | null; mcap_at_call: number | null }>(
        `SELECT ca, ticker, mcap_at_call FROM calls WHERE tweet_id = $1 AND ca IS NOT NULL`,
        [r.id],
      );
      const payload: DeletedPayload = {
        handle: r.handle,
        displayName: r.display_name,
        tweetId: r.id,
        text: r.current_text,
        postedAt: r.posted_at.toISOString(),
        deletedAt: now.toISOString(),
        calls: [],
      };
      for (const c of calls) {
        payload.calls.push({ ca: c.ca, ticker: c.ticker, mcapAtCall: c.mcap_at_call, mcapAtDelete: await safePrice(ctx, c.ca) });
      }
      await insertAlert(db, { type: "deleted", accountId: r.account_id, tweetId: r.id, ca: calls[0]?.ca ?? null, payload, createdAt: now });
    } else if (event === "restored") {
      log("info", "tweet reappeared after being marked deleted", { tweetId: r.id });
    }
  }
  return { checked: rows.length, deleted, edited };
}

// ── 3. Profile changes ─────────────────────────────────────────────────────────────────────────────────

export async function checkProfiles(ctx: JobContext): Promise<number> {
  const { db, sources, config, thresholds } = ctx;
  const now = sources.clock.now();
  const accounts = await db.query<AccountRow>(
    `SELECT id, x_user_id, handle, display_name, bio, followers, last_tweet_id, last_profile_at
       FROM accounts
      WHERE active AND (last_profile_at IS NULL OR last_profile_at <= $1::timestamptz - make_interval(mins => $2::int))
      ORDER BY last_profile_at NULLS FIRST
      LIMIT 50`,
    [now, config.worker.profileEveryMinutes],
  );
  let changes = 0;
  for (const acc of accounts) {
    const p = await sources.twitter.fetchProfile(acc.x_user_id);
    if (!p) {
      log("warn", "profile not found", { handle: acc.handle });
      await db.query(`UPDATE accounts SET last_profile_at = $2 WHERE id = $1`, [acc.id, now]);
      continue;
    }
    if (!p.isPublic) {
      log("warn", "account is no longer public — not tracking its profile", { handle: acc.handle });
      await db.query(`UPDATE accounts SET last_profile_at = $2 WHERE id = $1`, [acc.id, now]);
      continue;
    }

    const next = { handle: p.handle, displayName: p.displayName, bio: p.bio, followers: p.followers };
    const diff = acc.last_profile_at
      ? diffProfile({ handle: acc.handle, displayName: acc.display_name, bio: acc.bio, followers: acc.followers }, next, {
          followerSpikePct: thresholds.followerSpikePct,
        })
      : [];

    if (!acc.last_profile_at || diff.length) {
      await db.query(
        `INSERT INTO account_snapshots (account_id, handle, display_name, bio, followers, taken_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [acc.id, p.handle, p.displayName, p.bio, p.followers, now],
      );
    }
    const renamed = diff.some((ch) => ch.type === "rename");
    for (const ch of diff) {
      // A rename usually comes with a new display name; one receipt (the rename) carries both.
      if (ch.type === "display_name" && renamed) continue;
      changes++;
      const payload: ProfileChangePayload = {
        handle: ch.type === "rename" ? ch.to : p.handle,
        displayName: p.displayName,
        from: ch.from,
        to: ch.to,
        ...(ch.type === "followers" ? { pct: ch.pct } : {}),
        ...(ch.type === "rename" && acc.display_name !== p.displayName ? { previousDisplayName: acc.display_name } : {}),
      };
      await insertAlert(db, { type: ch.type, accountId: acc.id, payload, createdAt: now });
    }
    await db.query(
      `UPDATE accounts SET handle = $2, display_name = $3, bio = $4, followers = $5, avatar_url = $6, last_profile_at = $7 WHERE id = $1`,
      [acc.id, p.handle, p.displayName, p.bio, p.followers, p.avatarUrl, now],
    );
  }
  return changes;
}

// ── 4. Score calls at 1h / 24h / 7d ────────────────────────────────────────────────────────────────────

export async function scoreCalls(ctx: JobContext): Promise<number> {
  const { db, sources } = ctx;
  const now = sources.clock.now();
  const cache = new Map<string, number | null>();
  let updated = 0;
  for (const h of HORIZONS) {
    const due = new Date(now.getTime() - h.ms);
    const oldest = new Date(due.getTime() - HORIZON_GRACE_MS);
    const rows = await db.query<{ id: number; ca: string }>(
      `SELECT id, ca FROM calls
        WHERE ca IS NOT NULL AND mcap_at_call IS NOT NULL AND ${h.column} IS NULL
          AND called_at <= $1 AND called_at > $2
        ORDER BY called_at
        LIMIT 300`,
      [due, oldest],
    );
    for (const r of rows) {
      const mcap = await safePrice(ctx, r.ca, cache);
      if (mcap === null) continue;
      await db.query(`UPDATE calls SET ${h.column} = $2 WHERE id = $1`, [r.id, mcap]);
      updated++;
    }
  }
  return updated;
}

// ── 5. Coordinated shills ──────────────────────────────────────────────────────────────────────────────

export async function detectCoordination(ctx: JobContext): Promise<number> {
  const { db, sources, thresholds } = ctx;
  const now = sources.clock.now();
  const windowMs = thresholds.coordWindowMinutes * 60_000;
  const rows = await db.query<{ account_id: number; ca: string; called_at: Date }>(
    `SELECT account_id, ca, called_at FROM calls
      WHERE ca IS NOT NULL AND sentiment <> 'bearish' AND called_at > $1`,
    [new Date(now.getTime() - windowMs * 2)],
  );
  const pushes = detectCoordinated(
    rows.map((r) => ({ accountId: r.account_id, ca: r.ca, at: r.called_at })),
    { minAccounts: thresholds.coordMinAccounts, windowMinutes: thresholds.coordWindowMinutes },
  );
  let created = 0;
  for (const p of pushes) {
    const recent = await one<{ id: number }>(
      db,
      `SELECT id FROM alerts WHERE type = 'coordinated' AND ca = $1 AND created_at > $2 LIMIT 1`,
      [p.ca, new Date(now.getTime() - COORD_COOLDOWN_MS)],
    );
    if (recent) continue;
    const accounts = await db.query<{ id: number; handle: string }>(
      `SELECT id, handle FROM accounts WHERE id = ANY($1::int[]) ORDER BY handle`,
      [p.accountIds],
    );
    const ticker = await one<{ ticker: string | null }>(
      db,
      `SELECT ticker FROM calls WHERE ca = $1 AND ticker IS NOT NULL ORDER BY called_at DESC LIMIT 1`,
      [p.ca],
    );
    const payload: CoordinatedPayload = {
      ca: p.ca,
      ticker: ticker?.ticker ?? null,
      accounts,
      firstAt: p.firstAt.toISOString(),
      lastAt: p.lastAt.toISOString(),
      windowMinutes: thresholds.coordWindowMinutes,
      mcapAtDetect: await safePrice(ctx, p.ca),
    };
    await insertAlert(db, { type: "coordinated", accountId: null, ca: p.ca, payload, createdAt: now });
    created++;
  }
  return created;
}
