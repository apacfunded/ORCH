export type Horizon = "1h" | "24h" | "7d";

export const HORIZONS: { key: Horizon; column: "mcap_1h" | "mcap_24h" | "mcap_7d"; ms: number }[] = [
  { key: "1h", column: "mcap_1h", ms: 60 * 60_000 },
  { key: "24h", column: "mcap_24h", ms: 24 * 60 * 60_000 },
  { key: "7d", column: "mcap_7d", ms: 7 * 24 * 60 * 60_000 },
];

export interface ScoredCallInput {
  id?: number;
  ticker?: string | null;
  ca: string | null;
  sentiment: string;
  mcapAtCall: number | null;
  mcap1h: number | null;
  mcap24h: number | null;
  mcap7d: number | null;
}

export interface Scorecard {
  totalCalls: number;
  /** Calls with a 24h result. */
  scored: number;
  hits: number;
  /** 0..1, null when nothing is scored yet. */
  hitRate: number | null;
  /** Mean 24h return, as a fraction (0.5 = +50%). */
  avgReturn24h: number | null;
  best: { ticker: string | null; ca: string; return24h: number } | null;
  worst: { ticker: string | null; ca: string; return24h: number } | null;
  rugs: number;
}

export function returnAt(call: ScoredCallInput, h: Horizon): number | null {
  const base = call.mcapAtCall;
  const v = h === "1h" ? call.mcap1h : h === "24h" ? call.mcap24h : call.mcap7d;
  if (!base || base <= 0 || v === null || v === undefined) return null;
  return v / base - 1;
}

/** A rug: any later market cap check came in under 10% of the market cap at call time. */
export function isRug(call: ScoredCallInput): boolean {
  if (!call.mcapAtCall) return false;
  return [call.mcap1h, call.mcap24h, call.mcap7d].some((v) => v !== null && v !== undefined && v < call.mcapAtCall! * 0.1);
}

export function computeScorecard(calls: ScoredCallInput[]): Scorecard {
  const eligible = calls.filter((c) => c.ca && c.sentiment !== "bearish");
  let hits = 0;
  let sum = 0;
  let scored = 0;
  let best: Scorecard["best"] = null;
  let worst: Scorecard["worst"] = null;
  let rugs = 0;

  for (const c of eligible) {
    if (isRug(c)) rugs++;
    const r = returnAt(c, "24h");
    if (r === null) continue;
    scored++;
    sum += r;
    if (r > 0) hits++;
    if (!best || r > best.return24h) best = { ticker: c.ticker ?? null, ca: c.ca!, return24h: r };
    if (!worst || r < worst.return24h) worst = { ticker: c.ticker ?? null, ca: c.ca!, return24h: r };
  }

  return {
    totalCalls: eligible.length,
    scored,
    hits,
    hitRate: scored ? hits / scored : null,
    avgReturn24h: scored ? sum / scored : null,
    best,
    worst,
    rugs,
  };
}

/** Leaderboards only rank callers with enough scored calls to mean something. */
export const MIN_SCORED_FOR_RANK = 5;

export function rankCallers<T extends { card: Scorecard }>(rows: T[]): { best: T[]; worst: T[] } {
  const ranked = rows.filter((r) => r.card.scored >= MIN_SCORED_FOR_RANK);
  const score = (r: T) => (r.card.hitRate ?? 0) * 0.6 + Math.tanh(r.card.avgReturn24h ?? 0) * 0.4;
  const best = [...ranked].sort((a, b) => score(b) - score(a));
  const worst = [...ranked].sort((a, b) => score(a) - score(b) || b.card.rugs - a.card.rugs);
  return { best, worst };
}
