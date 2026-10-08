import { NextResponse, type NextRequest } from "next/server";
import { toDTO } from "@/lib/dto";
import { getDb } from "@/db";
import { FEED_FILTERS } from "@/lib/alerts";
import { feedCutoff } from "@/lib/gate";
import { countLocked, getFeed } from "@/server/queries";
import { kickWorker } from "@/server/kick";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The gated feed. Delayed vs live filtering happens here, on the server, per request. */
export async function GET(req: NextRequest) {
  kickWorker();
  const viewer = await getViewer();
  const filter = req.nextUrl.searchParams.get("filter") ?? "all";
  const types = FEED_FILTERS[filter] ?? null;
  const beforeRaw = Number(req.nextUrl.searchParams.get("before"));
  const before = Number.isInteger(beforeRaw) && beforeRaw > 0 ? beforeRaw : null;

  const now = new Date();
  const cutoff = feedCutoff(viewer.tier, now, viewer.delayMinutes);
  const db = await getDb();
  const [items, locked] = await Promise.all([
    getFeed(db, { cutoff, beforeId: before, types, limit: 30 }),
    countLocked(db, cutoff, now, types),
  ]);
  return NextResponse.json(
    { items: items.map(toDTO), locked, tier: viewer.tier, delayMinutes: viewer.delayMinutes, serverTime: now.toISOString() },
    { headers: { "cache-control": "private, no-store" } },
  );
}
