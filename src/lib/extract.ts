import { isSolanaAddress } from "./base58";

export type Sentiment = "bullish" | "bearish" | "neutral";

export interface ExtractedCall {
  /** Solana mint address, when the tweet contains one. Only calls with a CA are priced and scored. */
  ca: string | null;
  ticker: string | null;
  sentiment: Sentiment;
  /** 0..1 — how sure we are this tweet is calling this coin. */
  confidence: number;
}

const ADDRESS_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
const CASHTAG_RE = /\$([A-Za-z][A-Za-z0-9]{1,9})(?![A-Za-z0-9])/g;

// Cashtags that are not coin calls.
const IGNORED_TICKERS = new Set(["USD", "USDC", "USDT", "SOL", "BTC", "ETH", "EUR", "GBP"]);

const BULLISH = [
  "buy", "bought", "aping", "aped", "ape", "loaded", "loading", "send", "sending", "moon", "gem", "early",
  "long", "bullish", "bags", "bag", "100x", "10x", "1000x", "lfg", "runner", "next leg", "accumulating", "conviction",
];
const BEARISH = [
  "rug", "rugged", "scam", "avoid", "stay away", "dump", "dumping", "sold", "short", "bearish", "honeypot",
  "dev sold", "careful", "exit", "jeet",
];

function countHits(text: string, words: string[]): number {
  let hits = 0;
  for (const w of words) {
    const re = new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    if (re.test(text)) hits++;
  }
  return hits;
}

export function detectSentiment(text: string): Sentiment {
  const bull = countHits(text, BULLISH);
  const bear = countHits(text, BEARISH);
  if (bear > bull) return "bearish";
  if (bull > 0) return "bullish";
  return "neutral";
}

/** Every distinct valid Solana address in the text, in order of appearance. */
export function extractAddresses(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(ADDRESS_RE)) {
    const start = m.index ?? 0;
    // Reject matches glued to other base58-ish characters (part of a longer token).
    const before = text[start - 1];
    const after = text[start + m[0].length];
    if (before && /[0-9A-Za-z]/.test(before)) continue;
    if (after && /[0-9A-Za-z]/.test(after)) continue;
    if (isSolanaAddress(m[0])) seen.add(m[0]);
  }
  return [...seen];
}

export function extractTickers(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(CASHTAG_RE)) {
    const t = m[1].toUpperCase();
    if (!IGNORED_TICKERS.has(t)) seen.add(t);
  }
  return [...seen];
}

/**
 * Rule-based extraction. Deterministic and free; the AI extractor (ai-extract.ts) refines tickers and
 * intent on top of this, but contract addresses always come from here so the AI can never invent one.
 */
export function extractCallsHeuristic(text: string): ExtractedCall[] {
  const addresses = extractAddresses(text);
  const tickers = extractTickers(text);
  const sentiment = detectSentiment(text);
  const calls: ExtractedCall[] = [];

  if (addresses.length === 1 && tickers.length <= 1) {
    calls.push({ ca: addresses[0], ticker: tickers[0] ?? null, sentiment, confidence: 0.95 });
    return calls;
  }
  for (const ca of addresses) calls.push({ ca, ticker: null, sentiment, confidence: 0.9 });
  // Ticker-only mentions: stored for context, never scored (we can't price a ticker reliably).
  if (addresses.length === 0) {
    for (const ticker of tickers) {
      calls.push({ ca: null, ticker, sentiment, confidence: sentiment === "neutral" ? 0.6 : 0.85 });
    }
  }
  return calls;
}

/** A call counts toward a caller's scorecard only when it has a CA and is not a warning. */
export function isScorable(call: Pick<ExtractedCall, "ca" | "sentiment" | "confidence">): boolean {
  return call.ca !== null && call.sentiment !== "bearish" && call.confidence >= 0.8;
}
