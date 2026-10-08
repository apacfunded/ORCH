"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Thresholds } from "@/config";
import { getDb } from "@/db";
import { createSources, getThresholds, saveThresholds } from "@/server/context";
import { getViewer } from "@/server/viewer";
import { addAccount } from "@/worker/seed";

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer.isAdmin) throw new Error("Admins only");
  return viewer;
}

function back(params: Record<string, string>): never {
  redirect(`/admin?${new URLSearchParams(params)}`);
}

export async function addAccountAction(form: FormData) {
  await requireAdmin();
  const handle = String(form.get("handle") ?? "").trim().replace(/^@/, "");
  const poll = Math.min(Math.max(Number(form.get("poll") ?? 5) || 5, 1), 1440);
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) back({ err: "Enter an X handle like @caller (letters, numbers, underscores)." });
  const db = await getDb();
  const added = await addAccount(db, createSources().twitter, handle, poll);
  revalidatePath("/admin");
  if (!added) back({ err: `@${handle} wasn't found or isn't a public account.` });
  back({ ok: `Watching @${added.handle}.` });
}

export async function setAccountAction(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  const active = form.get("active") === "1";
  const poll = Math.min(Math.max(Number(form.get("poll") ?? 5) || 5, 1), 1440);
  if (!Number.isInteger(id)) back({ err: "Unknown account." });
  const db = await getDb();
  await db.query(`UPDATE accounts SET active = $2, poll_minutes = $3 WHERE id = $1`, [id, active, poll]);
  revalidatePath("/admin");
  back({ ok: "Account updated." });
}

export async function saveThresholdsAction(form: FormData) {
  await requireAdmin();
  const db = await getDb();
  const current = await getThresholds(db);
  const next: Thresholds = { ...current };
  for (const key of Object.keys(current) as (keyof Thresholds)[]) {
    const v = Number(form.get(key));
    if (Number.isFinite(v) && v >= 0) next[key] = v;
  }
  if (next.coordMinAccounts < 2) back({ err: "A coordinated push needs at least 2 accounts." });
  if (next.deleteConfirmFails < 1) back({ err: "Deletion needs at least 1 confirming check." });
  await saveThresholds(db, next);
  revalidatePath("/admin");
  back({ ok: "Thresholds saved. The worker picks them up on its next cycle." });
}

export async function resolveRemovalAction(form: FormData) {
  await requireAdmin();
  const id = Number(form.get("id"));
  const decision = form.get("decision") === "removed" ? "removed" : "dismissed";
  const db = await getDb();
  const rows = await db.query<{ handle: string }>(`UPDATE removal_requests SET status = $2 WHERE id = $1 RETURNING handle`, [id, decision]);
  if (decision === "removed" && rows[0]) {
    await db.query(`UPDATE accounts SET active = FALSE WHERE lower(handle) = lower($1)`, [rows[0].handle.replace(/^@/, "")]);
  }
  revalidatePath("/admin");
  back({ ok: decision === "removed" ? `Stopped watching @${rows[0]?.handle ?? ""}.` : "Request dismissed." });
}
