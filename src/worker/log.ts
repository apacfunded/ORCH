type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = ORDER[(process.env.LOG_LEVEL as Level) ?? "info"] ?? 20;

/** One JSON object per line, easy to grep and to ship to any log drain. */
export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (ORDER[level] < MIN) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields }, (_k, v) =>
    v instanceof Error ? { name: v.name, message: v.message } : v,
  );
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}
