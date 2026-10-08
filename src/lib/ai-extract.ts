import { extractCallsHeuristic, extractAddresses, type ExtractedCall, type Sentiment } from "./extract";

const SYSTEM = `You read one crypto Twitter post and report which coins it is calling.
Reply with JSON only, no prose: {"calls":[{"ca":string|null,"ticker":string|null,"sentiment":"bullish"|"bearish"|"neutral","confidence":number}]}
Rules:
- "ca" must be copied exactly from the post or null. Never invent an address.
- "ticker" is the coin symbol without "$", uppercase, or null.
- "bullish" = the author is promoting or buying it; "bearish" = warning people off; otherwise "neutral".
- confidence is 0..1 that the post is about that coin.
- If the post calls no coin, reply {"calls":[]}.`;

interface AiOptions {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const SENTIMENTS: Sentiment[] = ["bullish", "bearish", "neutral"];

/** Parse and sanitize the model's JSON. Addresses not present in the text are dropped. */
export function parseAiCalls(raw: string, text: string): ExtractedCall[] | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const calls = (parsed as { calls?: unknown }).calls;
  if (!Array.isArray(calls)) return null;

  const realAddresses = new Set(extractAddresses(text));
  const out: ExtractedCall[] = [];
  for (const c of calls) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const ca = typeof o.ca === "string" && realAddresses.has(o.ca) ? o.ca : null;
    const ticker =
      typeof o.ticker === "string" && /^[A-Za-z][A-Za-z0-9]{1,9}$/.test(o.ticker.replace(/^\$/, ""))
        ? o.ticker.replace(/^\$/, "").toUpperCase()
        : null;
    const sentiment = SENTIMENTS.includes(o.sentiment as Sentiment) ? (o.sentiment as Sentiment) : "neutral";
    const confidence = typeof o.confidence === "number" ? Math.max(0, Math.min(1, o.confidence)) : 0.5;
    if (!ca && !ticker) continue;
    out.push({ ca, ticker, sentiment, confidence });
  }
  return out;
}

/**
 * AI extraction with a hard fallback to the heuristic. Contract addresses found by regex are always kept,
 * even if the model misses them.
 */
export async function extractCalls(text: string, ai?: AiOptions | null): Promise<ExtractedCall[]> {
  const heuristic = extractCallsHeuristic(text);
  if (!ai?.apiKey) return heuristic;

  const doFetch = ai.fetchImpl ?? fetch;
  try {
    const res = await doFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ai.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ai.model,
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: "user", content: text }],
      }),
      signal: AbortSignal.timeout(ai.timeoutMs ?? 15_000),
    });
    if (!res.ok) return heuristic;
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const raw = body.content?.find((b) => b.type === "text")?.text ?? "";
    const aiCalls = parseAiCalls(raw, text);
    if (!aiCalls) return heuristic;

    // Merge: keep every regex-found CA; prefer the AI's ticker/sentiment for it when it agrees.
    const merged = new Map<string, ExtractedCall>();
    for (const c of heuristic) merged.set(c.ca ?? `t:${c.ticker}`, c);
    const hasAddress = heuristic.some((h) => h.ca);
    for (const c of aiCalls) {
      // When the post carries a CA, ticker-only AI guesses are noise next to the real address.
      if (!c.ca && hasAddress) continue;
      const key = c.ca ?? `t:${c.ticker}`;
      const prev = merged.get(key);
      merged.set(key, prev ? { ...prev, ticker: c.ticker ?? prev.ticker, sentiment: c.sentiment, confidence: Math.max(prev.confidence, c.confidence) } : c);
    }
    return [...merged.values()];
  } catch {
    return heuristic;
  }
}
