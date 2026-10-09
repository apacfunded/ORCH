import { readFile, readdir, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config";

/**
 * A deliberately tiny database interface: parameterized SQL in, rows out. Two drivers implement it:
 * - Postgres (postgres.js) when DATABASE_URL is set — production.
 * - PGlite (embedded Postgres in WASM) otherwise — zero-setup local dev.
 * Both speak real Postgres SQL, so the queries are identical.
 */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Run statements that take no parameters (migrations). */
  exec(text: string): Promise<void>;
  close(): Promise<void>;
}

export async function one<T>(db: Db, text: string, params?: unknown[]): Promise<T | null> {
  const rows = await db.query<T>(text, params);
  return rows[0] ?? null;
}

/** Encode JS arrays as Postgres array literals ('{a,b}') so both drivers bind `$n::text[]` identically. */
export function normalizeParams(params: unknown[]): unknown[] {
  return params.map((p) =>
    Array.isArray(p)
      ? `{${p.map((v) => (v === null || v === undefined ? "NULL" : `"${String(v).replace(/(["\\])/g, "\\$1")}"`)).join(",")}}`
      : p,
  );
}

async function createPostgres(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 10, idle_timeout: 30, prepare: false, onnotice: () => {} });
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await sql.unsafe(text, normalizeParams(params) as never[])) as unknown as T[];
    },
    async exec(text) {
      await sql.unsafe(text);
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

async function createPglite(dir: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  await mkdir(dir, { recursive: true });
  const pg = new PGlite(dir);
  await pg.waitReady;
  return {
    async query<T>(text: string, params: unknown[] = []) {
      return (await pg.query<T>(text, normalizeParams(params))).rows;
    },
    async exec(text) {
      await pg.exec(text);
    },
    async close() {
      await pg.close();
    },
  };
}

const g = globalThis as unknown as { __receiptsDb?: Promise<Db> };

/** Process-wide singleton (survives Next.js dev hot reloads). Runs migrations on first use. */
export function getDb(): Promise<Db> {
  if (!g.__receiptsDb) {
    g.__receiptsDb = (async () => {
      const c = config();
      if (!c.databaseUrl && c.onVercel) {
        throw new Error("No database: add Postgres to this Vercel project (Storage → Neon) or set DATABASE_URL.");
      }
      const db = c.databaseUrl ? await createPostgres(c.databaseUrl) : await createPglite(c.pgliteDir);
      await migrate(db);
      return db;
    })().catch((err) => {
      g.__receiptsDb = undefined;
      throw err;
    });
  }
  return g.__receiptsDb;
}

/** Use a specific Db (tests, scripts). */
export function setDb(db: Db) {
  g.__receiptsDb = Promise.resolve(db);
}

export async function migrate(db: Db): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const dir = path.join(process.cwd(), "src", "db", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set((await db.query<{ name: string }>(`SELECT name FROM _migrations`)).map((r) => r.name));
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(path.join(dir, f), "utf8");
    await db.exec(sql);
    await db.query(`INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`, [f]);
    applied.push(f);
  }
  return applied;
}
