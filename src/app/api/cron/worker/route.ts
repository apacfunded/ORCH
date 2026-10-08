import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/config";
import { getDb } from "@/db";
import { runTick } from "@/worker/tick";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest, secret: string): boolean {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Runs one worker tick. Protected by CRON_SECRET (sent as "Authorization: Bearer <secret>", which is also
 * exactly what Vercel Cron sends). Scheduled by .github/workflows/worker.yml every 5 minutes.
 */
async function handle(req: NextRequest) {
  const secret = config().cronSecret;
  if (!secret) return NextResponse.json({ error: "Set CRON_SECRET to enable the worker endpoint." }, { status: 503 });
  if (!authorized(req, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  const result = await runTick(await getDb(), 45_000);
  return NextResponse.json({ ...result, ms: Date.now() - started });
}

export const GET = handle;
export const POST = handle;
