import { one, type Db } from "../db";
import type { AlertRow, AlertType } from "../lib/alerts";
import { computeScorecard, rankCallers, type Scorecard } from "../lib/trackers/scorecard";

export interface FeedItem extends AlertRow {
  /** For calls: the tweet's status now (a call can be deleted later). */
  tweet_status: string | null;
  mcap_1h: number | null;
  mcap_24h: number | null;
  mcap_7d: number | null;
}

const FEED_SELECT = `
  SELECT a.id, a.type, a.account_id, a.tweet_id, a.ca, a.payload, a.created_at,
         t.status AS tweet_status, c.mcap_1h, c.mcap_24h, c.mcap_7d
    FROM alerts a
    LEFT JOIN tweets t ON t.id = a.tweet_id
    LEFT JOIN LATERAL (
      SELECT mcap_1h, mcap_24h, mcap_7d FROM calls
       WHERE a.type = 'call' AND calls.tweet_id = a.tweet_id AND calls.ca = a.ca
       LIMIT 1
    ) c ON TRUE`;

export async function getFeed(
  db: Db,
  opts: { cutoff: Date; beforeId?: number | null; limit?: number; types?: AlertType[] | null; accountId?: number },
): Promise<FeedItem[]> {
  const params: unknown[] = [opts.cutoff];
  const where = ["a.created_at <= $1"];
  if (opts.beforeId) {
    params.push(opts.beforeId);
    where.push(`a.id < $${params.length}`);
  }
  if (opts.types?.length) {
    params.push(opts.types);
    where.push(`a.type = ANY($${params.length}::text[])`);
  }
  if (opts.accountId) {
    params.push(opts.accountId);
    where.push(`a.account_id = $${params.length}`);
  }
  params.push(Math.min(Math.max(opts.limit ?? 30, 1), 100));
  return db.query<FeedItem>(
    `${FEED_SELECT} WHERE ${where.join(" AND ")} ORDER BY a.id DESC LIMIT $${params.length}`,
    params,
  );
}

/** How many receipts exist that this viewer can't see yet (the public delay). */
export async function countLocked(db: Db, cutoff: Date, now: Date, types?: AlertType[] | null): Promise<number> {
  const params: unknown[] = [cutoff, now];
  let typeSql = "";
  if (types?.length) {
    params.push(types);
    typeSql = ` AND type = ANY($3::text[])`;
  }
  const row = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM alerts WHERE created_at > $1 AND created_at <= $2${typeSql}`, params);
  return row?.n ?? 0;
}

export async function getAlert(db: Db, id: number): Promise<FeedItem | null> {
  return one<FeedItem>(db, `${FEED_SELECT} WHERE a.id = $1`, [id]);
}

export async function getStats(db: Db) {
  return (
    (await one<{ watched: number; calls: number; deleted: number; coordinated: number }>(
      db,
      `SELECT (SELECT count(*)::int FROM accounts WHERE active) AS watched,
              (SELECT count(*)::int FROM calls WHERE ca IS NOT NULL) AS calls,
              (SELECT count(*)::int FROM tweets WHERE status = 'deleted') AS deleted,
              (SELECT count(*)::int FROM alerts WHERE type = 'coordinated') AS coordinated`,
    )) ?? { watched: 0, calls: 0, deleted: 0, coordinated: 0 }
  );
}

export interface CallerRow {
  id: number;
  handle: string;
  display_name: string;
  followers: number;
  deletions: number;
  card: Scorecard;
}

interface CallRecord {
  id: number;
  account_id: number;
  ticker: string | null;
  ca: string | null;
  sentiment: string;
  called_at: Date;
  tweet_id: string;
  mcap_at_call: number | null;
  mcap_1h: number | null;
  mcap_24h: number | null;
  mcap_7d: number | null;
}

function toScoreInput(c: CallRecord) {
  return {
    id: c.id,
    ticker: c.ticker,
    ca: c.ca,
    sentiment: c.sentiment,
    mcapAtCall: c.mcap_at_call,
    mcap1h: c.mcap_1h,
    mcap24h: c.mcap_24h,
    mcap7d: c.mcap_7d,
  };
}

export async function getCallers(db: Db): Promise<CallerRow[]> {
  const accounts = await db.query<{ id: number; handle: string; display_name: string; followers: number; deletions: number }>(
    `SELECT a.id, a.handle, a.display_name, a.followers,
            (SELECT count(*)::int FROM tweets t WHERE t.account_id = a.id AND t.status = 'deleted') AS deletions
       FROM accounts a WHERE a.active ORDER BY a.handle`,
  );
  const calls = await db.query<CallRecord>(
    `SELECT id, account_id, ticker, ca, sentiment, called_at, tweet_id, mcap_at_call, mcap_1h, mcap_24h, mcap_7d
       FROM calls WHERE ca IS NOT NULL AND called_at > now() - interval '90 days'`,
  );
  const byAccount = new Map<number, CallRecord[]>();
  for (const c of calls) {
    const arr = byAccount.get(c.account_id) ?? [];
    arr.push(c);
    byAccount.set(c.account_id, arr);
  }
  return accounts.map((a) => ({ ...a, card: computeScorecard((byAccount.get(a.id) ?? []).map(toScoreInput)) }));
}

export async function getLeaderboard(db: Db) {
  const rows = await getCallers(db);
  const { best, worst } = rankCallers(rows);
  const unranked = rows.filter((r) => !best.includes(r));
  return { best, worst, unranked };
}

export async function getCaller(db: Db, handle: string, cutoff: Date) {
  const clean = handle.replace(/^@/, "").toLowerCase();
  let account = await one<{ id: number; handle: string; display_name: string; bio: string; followers: number; added_at: Date; active: boolean }>(
    db,
    `SELECT id, handle, display_name, bio, followers, added_at, active FROM accounts WHERE lower(handle) = $1`,
    [clean],
  );
  let renamedFrom: string | null = null;
  if (!account) {
    // Old handle? Follow it through the snapshots.
    const snap = await one<{ account_id: number }>(
      db,
      `SELECT account_id FROM account_snapshots WHERE lower(handle) = $1 ORDER BY taken_at DESC LIMIT 1`,
      [clean],
    );
    if (snap) {
      account = await one(db, `SELECT id, handle, display_name, bio, followers, added_at, active FROM accounts WHERE id = $1`, [snap.account_id]);
      renamedFrom = clean;
    }
  }
  if (!account) return null;

  const calls = await db.query<CallRecord & { status: string }>(
    `SELECT c.id, c.account_id, c.ticker, c.ca, c.sentiment, c.called_at, c.tweet_id, c.mcap_at_call, c.mcap_1h, c.mcap_24h, c.mcap_7d,
            t.status
       FROM calls c JOIN tweets t ON t.id = c.tweet_id
      WHERE c.account_id = $1 AND c.ca IS NOT NULL AND c.called_at <= $2
      ORDER BY c.called_at DESC LIMIT 100`,
    [account.id, cutoff],
  );
  const allCalls = await db.query<CallRecord>(
    `SELECT id, account_id, ticker, ca, sentiment, called_at, tweet_id, mcap_at_call, mcap_1h, mcap_24h, mcap_7d
       FROM calls WHERE account_id = $1 AND ca IS NOT NULL AND called_at > now() - interval '90 days'`,
    [account.id],
  );
  const receipts = await getFeed(db, {
    cutoff,
    accountId: account.id,
    types: ["deleted", "edited", "rename", "display_name", "bio", "followers"],
    limit: 50,
  });
  const coordinated = await db.query<FeedItem>(
    `SELECT a.id, a.type, a.account_id, a.tweet_id, a.ca, a.payload, a.created_at,
            NULL AS tweet_status, NULL::float8 AS mcap_1h, NULL::float8 AS mcap_24h, NULL::float8 AS mcap_7d
       FROM alerts a
      WHERE a.type = 'coordinated' AND a.created_at <= $2
        AND a.payload->'accounts' @> jsonb_build_array(jsonb_build_object('id', $1::int))
      ORDER BY a.id DESC LIMIT 20`,
    [account.id, cutoff],
  );
  const deletions = await one<{ n: number }>(db, `SELECT count(*)::int AS n FROM tweets WHERE account_id = $1 AND status = 'deleted'`, [account.id]);
  return {
    account,
    renamedFrom,
    calls,
    card: computeScorecard(allCalls.map(toScoreInput)),
    receipts: [...receipts, ...coordinated].sort((a, b) => b.id - a.id),
    deletions: deletions?.n ?? 0,
  };
}
