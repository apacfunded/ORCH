/** Serverless tick: resumable seeding in time-boxed chunks, overlap lease, then live cycles. */
import { migrate, setDb } from "../../src/db";
import { runTick } from "../../src/worker/tick";
import { createPsqlDb } from "../support/psql-db";

const db = createPsqlDb({ host: process.env.PG_HOST ?? "/var/tmp", port: Number(process.env.PG_PORT ?? 5433), user: "receipts", database: process.env.PG_DB ?? "receipts_tick" });
setDb(db);
await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
await migrate(db);

const [a, b] = await Promise.all([runTick(db, 8_000), runTick(db, 8_000)]);
console.log("parallel ticks:", a.seeding ?? a.ok ?? a.skipped, "|", b.seeding ?? b.ok ?? b.skipped);
const one = await runTick(db, 8_000);
console.log("next tick:", JSON.stringify(one).slice(0, 160));
const seed = await db.query(`SELECT value FROM worker_state WHERE key = 'seed'`);
console.log("seed state:", seed[0]);
console.log("lease released:", (await db.query(`SELECT count(*)::int AS n FROM worker_state WHERE key = 'lease'`))[0]);
console.log("alerts so far:", await db.query(`SELECT type, count(*)::int AS n FROM alerts GROUP BY type ORDER BY type`));
