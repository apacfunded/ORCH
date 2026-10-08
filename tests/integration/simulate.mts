/**
 * Integration run of the real worker jobs against a real Postgres, using the mock world.
 * Usage: PG_HOST=/var/tmp PG_PORT=5433 PG_USER=receipts PG_DB=receipts_test tsx tests/integration/simulate.mts [hours]
 */
import { migrate, setDb } from "../../src/db";
import { seedDemo } from "../../src/worker/seed";
import { createPsqlDb } from "../support/psql-db";

const db = createPsqlDb({
  host: process.env.PG_HOST ?? "/var/tmp",
  port: Number(process.env.PG_PORT ?? 5433),
  user: process.env.PG_USER ?? "receipts",
  database: process.env.PG_DB ?? "receipts_test",
});
setDb(db);
await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
console.log("migrations:", await migrate(db));

const hours = Number(process.argv[2] ?? 12);
const t0 = Date.now();
await seedDemo(db, hours);
console.log(`seeded ${hours}h in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const q = (s: string) => db.query(s);
console.log("alerts by type:", await q(`SELECT type, count(*)::int AS n FROM alerts GROUP BY type ORDER BY type`));
console.log("tweets by status:", await q(`SELECT status, count(*)::int AS n, sum(edited::int)::int AS edited FROM tweets GROUP BY status`));
console.log("calls:", await q(`SELECT count(*)::int AS n, count(mcap_at_call)::int AS priced, count(mcap_1h)::int AS h1, count(mcap_24h)::int AS h24 FROM calls`));
console.log("sample deleted:", (await q(`SELECT payload FROM alerts WHERE type='deleted' ORDER BY id DESC LIMIT 1`))[0]);
console.log("sample coordinated:", (await q(`SELECT payload FROM alerts WHERE type='coordinated' ORDER BY id DESC LIMIT 1`))[0]);
console.log("sample rename:", (await q(`SELECT payload FROM alerts WHERE type='rename' ORDER BY id DESC LIMIT 1`))[0]);
