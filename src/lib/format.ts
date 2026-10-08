/** Display formatting shared by server and client components. All times render in UTC. */

export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

/** Fraction → signed percent (0.5 → "+50%"). */
export function fmtPct(frac: number | null | undefined, digits = 0): string {
  if (frac === null || frac === undefined || !Number.isFinite(frac)) return "—";
  const v = frac * 100;
  const s = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toFixed(digits);
  return `${v > 0 ? "+" : ""}${s}%`;
}

export function change(from: number | null | undefined, to: number | null | undefined): number | null {
  if (!from || from <= 0 || to === null || to === undefined) return null;
  return to / from - 1;
}

export function fmtCount(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

export function shortCa(ca: string): string {
  return ca.length > 12 ? `${ca.slice(0, 4)}…${ca.slice(-4)}` : ca;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtTime(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  const hh = String(x.getUTCHours()).padStart(2, "0");
  const mm = String(x.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}, ${hh}:${mm} UTC`;
}

export function fmtDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h}h ${mins % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function fmtAgo(d: Date | string, now: Date = new Date()): string {
  const x = typeof d === "string" ? new Date(d) : d;
  const ms = now.getTime() - x.getTime();
  if (ms < 60_000) return "just now";
  return `${fmtDuration(ms)} ago`;
}

export function receiptNo(id: number): string {
  return `#${String(id).padStart(6, "0")}`;
}
