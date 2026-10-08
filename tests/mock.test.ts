import assert from "node:assert/strict";
import { test } from "node:test";
import { extractCallsHeuristic } from "../src/lib/extract";
import { receiptLines } from "../src/lib/receipt-lines";
import { shareText } from "../src/lib/share";
import { coinByAddress, coinByIndex, DEMO_ACCOUNTS, MockPrices, MockTwitterSource, mockMarketCap } from "../src/sources/mock";

const clockAt = (iso: string) => ({ now: () => new Date(iso) });

test("the mock world is deterministic across instances", async () => {
  const a = new MockTwitterSource(clockAt("2026-10-08T12:00:00Z"));
  const b = new MockTwitterSource(clockAt("2026-10-08T12:00:00Z"));
  assert.deepEqual(await a.fetchUserTweets("demo-01", null), await b.fetchUserTweets("demo-01", null));
});

test("mock coins round-trip through their address and have prices", () => {
  const coin = coinByIndex(3570);
  assert.equal(coinByAddress(coin.ca)?.index, 3570);
  assert.equal(coinByAddress("So11111111111111111111111111111111111111112"), null);
  assert.equal(mockMarketCap(coin, coin.launchAt - 1), null, "no market before launch");
  assert.ok((mockMarketCap(coin, coin.launchAt + 3_600_000) ?? 0) > 0);
});

test("mock tweets carry real-looking calls the extractor understands", async () => {
  const src = new MockTwitterSource(clockAt("2026-10-08T12:00:00Z"));
  const prices = new MockPrices(clockAt("2026-10-08T12:00:00Z"));
  let withCa = 0;
  for (const acc of DEMO_ACCOUNTS) {
    for (const t of await src.fetchUserTweets(acc.userId, null)) {
      for (const c of extractCallsHeuristic(t.text)) {
        if (!c.ca) continue;
        withCa++;
        assert.ok(coinByAddress(c.ca), "every CA in the mock is a mock coin");
        assert.notEqual(await prices.getMarketCap(c.ca), null);
      }
    }
  }
  assert.ok(withCa > 20, `expected plenty of calls in 24h, got ${withCa}`);
});

test("a scheduled deletion makes the tweet go missing, and sinceId paging works", async () => {
  // Find a tweet that the simulation deletes, by scanning a day of activity.
  const early = new MockTwitterSource(clockAt("2026-10-07T00:00:00Z"));
  const ids: string[] = [];
  for (const acc of DEMO_ACCOUNTS) ids.push(...(await early.fetchUserTweets(acc.userId, null)).map((t) => t.id));
  const later = new MockTwitterSource(clockAt("2026-10-07T12:00:00Z"));
  const results = await later.fetchTweets(ids);
  const missing = [...results.values()].filter((r) => r.kind === "missing").length;
  assert.ok(missing > 0, "some calls get deleted within 12h");
  assert.ok(missing < ids.length / 2, "but most tweets survive");

  const list = await early.fetchUserTweets("demo-02", null);
  const mid = list[Math.floor(list.length / 2)];
  const after = await early.fetchUserTweets("demo-02", mid.id);
  assert.ok(after.every((t) => Number(t.id) > Number(mid.id)));
});

test("share text and image lines state facts for every receipt type", () => {
  const base = { id: 7, created_at: "2026-10-08T12:00:00.000Z", tweet_status: null, mcap_1h: null, mcap_24h: 50_000, mcap_7d: null };
  const deleted = { ...base, type: "deleted" as const, payload: { handle: "x", displayName: "X", tweetId: "1", text: "buy $T", postedAt: "2026-10-08T10:00:00.000Z", deletedAt: "2026-10-08T12:00:00.000Z", calls: [{ ca: "CA111111111111111111111111111111", ticker: "T", mcapAtCall: 100_000, mcapAtDelete: 5_000 }] } };
  assert.match(shareText(deleted), /@x deleted a tweet after 2h 0m\. It called \$T at \$100\.0K; at deletion it was \$5\.0K \(-95%\)/);
  assert.equal(receiptLines(deleted).stamp, "DELETED");
  const callItem = { ...base, type: "call" as const, payload: { handle: "y", displayName: "Y", tweetId: "2", text: "t", postedAt: base.created_at, ca: "CA111111111111111111111111111111", ticker: "Q", sentiment: "bullish", mcapAtCall: 100_000 } };
  assert.match(shareText(callItem), /24h later: -50%/);
  for (const text of [shareText(deleted), shareText(callItem)]) {
    assert.doesNotMatch(text, /scam|fraud|liar|rug ?pull/i, "receipts never accuse");
  }
});
