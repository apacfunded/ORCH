import assert from "node:assert/strict";
import { test } from "node:test";
import { detectCoordinated } from "../src/lib/trackers/coordination";
import { looksLikeAccountOutage, nextDeletionState, type DeletionState } from "../src/lib/trackers/deletion";
import { diffProfile } from "../src/lib/trackers/profile";
import { computeScorecard, isRug, rankCallers, returnAt } from "../src/lib/trackers/scorecard";

const MIN = 60_000;
const t0 = new Date("2026-10-08T12:00:00Z");
const at = (m: number) => new Date(t0.getTime() + m * MIN);
const rules = { confirmFails: 2, confirmGapMinutes: 5 };
const live: DeletionState = { status: "live", failCount: 0, firstFailedAt: null };

// ── deletion ──────────────────────────────────────────────────────────────

test("one missing fetch is never a deletion", () => {
  const r = nextDeletionState(live, { kind: "missing" }, at(0), rules);
  assert.equal(r.state.status, "unconfirmed");
  assert.equal(r.event, null);
});

test("deleted only after 2 failures at least 5 minutes apart", () => {
  const s1 = nextDeletionState(live, { kind: "missing" }, at(0), rules).state;
  const tooSoon = nextDeletionState(s1, { kind: "missing" }, at(2), rules);
  assert.equal(tooSoon.state.status, "unconfirmed", "2 failures but only 2 minutes apart");
  const confirmed = nextDeletionState(tooSoon.state, { kind: "missing" }, at(6), rules);
  assert.equal(confirmed.state.status, "deleted");
  assert.equal(confirmed.event, "deleted");
});

test("errors (rate limits, outages) never move the state", () => {
  const s1 = nextDeletionState(live, { kind: "missing" }, at(0), rules).state;
  const r = nextDeletionState(s1, { kind: "error" }, at(10), rules);
  assert.deepEqual(r.state, s1);
  assert.equal(r.event, null);
});

test("a tweet that comes back resets to live; a confirmed delete reports 'restored'", () => {
  const s1 = nextDeletionState(live, { kind: "missing" }, at(0), rules).state;
  const back = nextDeletionState(s1, { kind: "found", text: "x" }, at(3), rules);
  assert.deepEqual(back.state, live);
  assert.equal(back.event, null);
  const deleted: DeletionState = { status: "deleted", failCount: 2, firstFailedAt: at(0) };
  assert.equal(nextDeletionState(deleted, { kind: "found", text: "x" }, at(60), rules).event, "restored");
  assert.equal(nextDeletionState(deleted, { kind: "missing" }, at(60), rules).event, null, "no duplicate deletion receipt");
});

test("mass disappearance of one account looks like an outage, not deletions", () => {
  assert.equal(looksLikeAccountOutage(10, 9), true);
  assert.equal(looksLikeAccountOutage(10, 3), false);
  assert.equal(looksLikeAccountOutage(3, 3), false, "too few tweets to tell");
});

// ── coordination ─────────────────────────────────────────────────────────

test("flags 5+ distinct accounts on one CA inside the window", () => {
  const m = [1, 2, 3, 4, 5].map((id, i) => ({ accountId: id, ca: "COIN", at: at(i * 5) }));
  const pushes = detectCoordinated(m, { minAccounts: 5, windowMinutes: 30 });
  assert.equal(pushes.length, 1);
  assert.deepEqual(pushes[0].accountIds, [1, 2, 3, 4, 5]);
  assert.equal(pushes[0].firstAt.getTime(), at(0).getTime());
  assert.equal(pushes[0].lastAt.getTime(), at(20).getTime());
});

test("same account posting repeatedly doesn't count twice; spread-out posts don't trigger", () => {
  const spam = [1, 1, 1, 2, 3, 4].map((id, i) => ({ accountId: id, ca: "COIN", at: at(i) }));
  assert.equal(detectCoordinated(spam, { minAccounts: 5, windowMinutes: 30 }).length, 0);
  const slow = [1, 2, 3, 4, 5].map((id, i) => ({ accountId: id, ca: "COIN", at: at(i * 20) }));
  assert.equal(detectCoordinated(slow, { minAccounts: 5, windowMinutes: 30 }).length, 0);
});

test("separate coins are evaluated separately", () => {
  const m = [
    ...[1, 2, 3, 4, 5].map((id) => ({ accountId: id, ca: "A", at: at(id) })),
    ...[1, 2, 3].map((id) => ({ accountId: id, ca: "B", at: at(id) })),
  ];
  const pushes = detectCoordinated(m, { minAccounts: 5, windowMinutes: 30 });
  assert.deepEqual(pushes.map((p) => p.ca), ["A"]);
});

// ── profile ──────────────────────────────────────────────────────────────

const prof = { handle: "caller", displayName: "Caller", bio: "gm", followers: 10_000 };

test("detects renames (case-insensitive), bio edits and follower swings", () => {
  assert.deepEqual(diffProfile(prof, { ...prof, handle: "CALLER" }, { followerSpikePct: 20 }), []);
  const changes = diffProfile(prof, { handle: "caller_v2", displayName: "Caller", bio: "new bio", followers: 13_000 }, { followerSpikePct: 20 });
  assert.deepEqual(changes.map((c) => c.type), ["rename", "bio", "followers"]);
  const f = changes.find((c) => c.type === "followers");
  assert.ok(f && f.type === "followers" && f.pct === 30);
  const drop = diffProfile(prof, { ...prof, followers: 7_000 }, { followerSpikePct: 20 });
  assert.equal(drop[0].type, "followers");
});

test("ignores small swings and tiny accounts", () => {
  assert.deepEqual(diffProfile(prof, { ...prof, followers: 11_000 }, { followerSpikePct: 20 }), []);
  const tiny = { ...prof, followers: 100 };
  assert.deepEqual(diffProfile(tiny, { ...tiny, followers: 300 }, { followerSpikePct: 20 }), []);
});

// ── scorecard ────────────────────────────────────────────────────────────

const call = (mcapAtCall: number | null, mcap24h: number | null, extra: Partial<Parameters<typeof computeScorecard>[0][0]> = {}) => ({
  ca: "C",
  ticker: "T",
  sentiment: "bullish",
  mcapAtCall,
  mcap1h: null,
  mcap24h,
  mcap7d: null,
  ...extra,
});

test("scorecard math: hit rate, average, best, worst, rugs", () => {
  const card = computeScorecard([
    call(100, 200, { ticker: "UP" }), // +100%
    call(100, 50, { ticker: "DOWN" }), // -50%
    call(100, 5, { ticker: "RUG" }), // -95%, rug
    call(100, null), // pending: not scored
    call(100, 300, { sentiment: "bearish" }), // warnings never count
    call(100, 300, { ca: null }), // no CA never counts
  ]);
  assert.equal(card.totalCalls, 4);
  assert.equal(card.scored, 3);
  assert.equal(card.hits, 1);
  assert.equal(card.hitRate, 1 / 3);
  assert.ok(Math.abs(card.avgReturn24h! - (1 - 0.5 - 0.95) / 3) < 1e-9);
  assert.equal(card.best?.ticker, "UP");
  assert.equal(card.worst?.ticker, "RUG");
  assert.equal(card.rugs, 1);
});

test("returns and rugs handle missing data", () => {
  assert.equal(returnAt(call(null, 100), "24h"), null);
  assert.equal(returnAt(call(100, null), "24h"), null);
  assert.equal(isRug(call(100, null, { mcap1h: 9 })), true);
  assert.equal(isRug(call(100, 11)), false);
  assert.equal(computeScorecard([]).hitRate, null);
});

test("ranking requires 5 scored calls and orders best/worst", () => {
  const good = { name: "good", card: computeScorecard(Array.from({ length: 5 }, () => call(100, 300))) };
  const bad = { name: "bad", card: computeScorecard(Array.from({ length: 5 }, () => call(100, 20))) };
  const fresh = { name: "fresh", card: computeScorecard([call(100, 900)]) };
  const { best, worst } = rankCallers([bad, fresh, good]);
  assert.deepEqual(best.map((r) => r.name), ["good", "bad"]);
  assert.deepEqual(worst.map((r) => r.name), ["bad", "good"]);
});
