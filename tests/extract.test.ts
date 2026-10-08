import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAiCalls, extractCalls } from "../src/lib/ai-extract";
import { base58Decode, base58Encode, isSolanaAddress } from "../src/lib/base58";
import { detectSentiment, extractAddresses, extractCallsHeuristic, extractTickers, isScorable } from "../src/lib/extract";

const CA = base58Encode(new Uint8Array(32).map((_, i) => (i * 37 + 11) % 256));
const CA2 = base58Encode(new Uint8Array(32).map((_, i) => (i * 13 + 200) % 256));

test("base58 round-trips and validates Solana addresses", () => {
  const bytes = new Uint8Array([0, 0, 1, 2, 255, 128]);
  assert.deepEqual(base58Decode(base58Encode(bytes)), bytes);
  assert.equal(isSolanaAddress(CA), true);
  assert.equal(isSolanaAddress("So11111111111111111111111111111111111111112"), true);
  assert.equal(isSolanaAddress("0OIl" + CA.slice(4)), false, "rejects non-base58 characters");
  assert.equal(isSolanaAddress(CA.slice(0, 20)), false, "rejects short strings");
});

test("extracts contract addresses, ignoring junk and duplicates", () => {
  const text = `ape ${CA} now\n\nagain: ${CA}\nnot an address: 12345 or ${CA}xyz`;
  assert.deepEqual(extractAddresses(text), [CA]);
  assert.deepEqual(extractAddresses(`two coins ${CA} and ${CA2}`), [CA, CA2]);
  assert.deepEqual(extractAddresses("https://pump.fun/coin/" + CA), [CA]);
});

test("extracts cashtags but not fiat or majors", () => {
  assert.deepEqual(extractTickers("$wif $BONK and $SOL $USDC $1000 $pepe2"), ["WIF", "BONK", "PEPE2"]);
});

test("sentiment: bullish, bearish, neutral", () => {
  assert.equal(detectSentiment("aping this, loaded my bags"), "bullish");
  assert.equal(detectSentiment("careful, dev sold and it's a rug"), "bearish");
  assert.equal(detectSentiment("gm"), "neutral");
  assert.equal(detectSentiment("the drug store"), "neutral", "word boundaries: 'drug' is not 'rug'");
});

test("heuristic pairs one CA with one ticker", () => {
  const calls = extractCallsHeuristic(`$FROG is the play. loaded\n${CA}`);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ca, CA);
  assert.equal(calls[0].ticker, "FROG");
  assert.equal(calls[0].sentiment, "bullish");
  assert.equal(isScorable(calls[0]), true);
});

test("ticker-only and bearish mentions are never scorable", () => {
  const [tickerOnly] = extractCallsHeuristic("buying $FROG");
  assert.equal(tickerOnly.ca, null);
  assert.equal(isScorable(tickerOnly), false);
  const [warning] = extractCallsHeuristic(`stay away from this rug ${CA}`);
  assert.equal(warning.sentiment, "bearish");
  assert.equal(isScorable(warning), false);
});

test("AI output is sanitized: invented addresses are dropped", () => {
  const fake = base58Encode(new Uint8Array(32).fill(7));
  const raw = `Sure! {"calls":[{"ca":"${fake}","ticker":"$frog","sentiment":"bullish","confidence":0.9},{"ca":"${CA}","ticker":"frog","sentiment":"bullish","confidence":1.4}]}`;
  const calls = parseAiCalls(raw, `frog ${CA}`)!;
  assert.equal(calls.length, 2);
  assert.equal(calls[0].ca, null, "address not in the text becomes null");
  assert.equal(calls[0].ticker, "FROG");
  assert.equal(calls[1].ca, CA);
  assert.equal(calls[1].confidence, 1, "confidence clamped");
  assert.equal(parseAiCalls("not json", "x"), null);
});

test("extractCalls falls back to rules when the AI call fails, and keeps regex CAs", async () => {
  const failing = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  const calls = await extractCalls(`loaded ${CA}`, { apiKey: "k", model: "m", fetchImpl: failing });
  assert.equal(calls[0].ca, CA);

  const missesCa = (async () =>
    new Response(JSON.stringify({ content: [{ type: "text", text: '{"calls":[{"ca":null,"ticker":"FROG","sentiment":"bullish","confidence":0.9}]}' }] }), {
      status: 200,
    })) as typeof fetch;
  const merged = await extractCalls(`$FROG loaded ${CA}`, { apiKey: "k", model: "m", fetchImpl: missesCa });
  assert.deepEqual(merged.map((c) => c.ca), [CA], "the CA survives and no duplicate ticker-only call is added");
});
