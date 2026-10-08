/** Runs the page/feed queries against the database left by simulate.mts. */
import { feedCutoff } from "../../src/lib/gate";
import { countLocked, getAlert, getCaller, getFeed, getLeaderboard, getStats } from "../../src/server/queries";
import { createPsqlDb } from "../support/psql-db";

const db = createPsqlDb({ host: process.env.PG_HOST ?? "/var/tmp", port: Number(process.env.PG_PORT ?? 5433), user: "receipts", database: process.env.PG_DB ?? "receipts_test" });
const now = new Date();
const pub = feedCutoff("public", now, 15);
const feed = await getFeed(db, { cutoff: pub, limit: 5 });
console.log("feed:", feed.map((f) => [f.id, f.type, f.tweet_status, f.mcap_1h, f.created_at instanceof Date]));
console.log("deleted only:", (await getFeed(db, { cutoff: pub, types: ["deleted"], limit: 3 })).map((f) => f.id));
console.log("page 2:", (await getFeed(db, { cutoff: pub, beforeId: feed.at(-1)!.id, limit: 3 })).map((f) => f.id));
console.log("locked (public):", await countLocked(db, pub, now), "locked (holder):", await countLocked(db, now, now));
console.log("stats:", await getStats(db));
const lb = await getLeaderboard(db);
console.log("leaderboard sizes:", lb.best.length, lb.worst.length, lb.unranked.length, lb.unranked[0]?.card);
const caller = await getCaller(db, "gemhunter_vex", now);
console.log("caller:", caller?.account.handle, caller?.calls.length, caller?.receipts.map((r) => r.type), caller?.card.totalCalls);
const renamed = await getCaller(db, "degenpriest", now);
console.log("old handle resolves:", renamed?.renamedFrom, "→", renamed?.account.handle);
const coordId = (await getFeed(db, { cutoff: now, types: ["coordinated"], limit: 1 }))[0]?.id;
const coordMember = coordId ? (await getAlert(db, coordId))!.payload as any : null;
if (coordMember) {
  const c = await getCaller(db, coordMember.accounts[0].handle, now);
  console.log("coordinated shows on member page:", c?.receipts.some((r) => r.type === "coordinated"));
}
