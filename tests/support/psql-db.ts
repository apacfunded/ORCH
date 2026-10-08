import { spawnSync } from "node:child_process";
import type { Db } from "../../src/db";

/**
 * Test-only Db that talks to a real Postgres through the `psql` CLI. Lets the integration test exercise the
 * production SQL without any npm driver installed. Parameters are inlined as escaped literals.
 * Never use this outside tests.
 */
function literal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Array.isArray(v)) return v.length ? `ARRAY[${v.map(literal).join(",")}]` : "'{}'";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function inline(text: string, params: unknown[]): string {
  return text.replace(/\$(\d+)/g, (_m, n) => literal(params[Number(n) - 1]));
}

function revive(row: Record<string, unknown>): Record<string, unknown> {
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "string" && /_at$/.test(k) && !Number.isNaN(Date.parse(v))) row[k] = new Date(v);
  }
  return row;
}

export function createPsqlDb(conn: { host: string; port: number; user: string; database: string }): Db {
  const run = (sql: string): string => {
    const r = spawnSync(
      "psql",
      ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-h", conn.host, "-p", String(conn.port), "-U", conn.user, "-d", conn.database],
      { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    if (r.status !== 0) throw new Error(`psql failed: ${r.stderr}\nSQL: ${sql.slice(0, 500)}`);
    return r.stdout;
  };
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const sql = inline(text, params).trim().replace(/;$/, "");
      const returnsRows = /^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql);
      if (!returnsRows) {
        run(sql + ";");
        return [] as T[];
      }
      const out = run(`WITH __q AS (${sql}) SELECT coalesce(json_agg(__q), '[]'::json) FROM __q;`).trim();
      return (JSON.parse(out) as Record<string, unknown>[]).map(revive) as T[];
    },
    async exec(text: string) {
      run(text);
    },
    async close() {},
  };
}
