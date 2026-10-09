"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Thresholds } from "@/config";
import { getDb } from "@/db";
import { createSources, getThresholds, saveThresholds } from "@/server/context";
import { getViewer } from "@/server/viewer";
import { config } from "@/config";
import { isSolanaAddress } from "@/lib/base58";
import { checkMint } from "@/lib/solana";
import { clearLaunch, saveLaunch } from "@/server/launch";
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

export async function saveLaunchAction(form: FormData) {
  await requireAdmin();
  const mint = String(form.get("mint") ?? "").trim();
  const pumpUrl = String(form.get("pumpUrl") ?? "").trim();
  if (!isSolanaAddress(mint)) back({ err: "That isn't a Solana address. Paste the full CA (32 to 44 characters)." });
  if (pumpUrl && !/^https:\/\/[^\s]+$/.test(pumpUrl)) back({ err: "The buy link must start with https://" });
  const onChain = await checkMint(config().solanaRpcUrl, mint);
  if (onChain === "missing") back({ err: "No token exists at that address on Solana. Check the CA for a typo." });
  await saveLaunch(await getDb(), mint, pumpUrl);
  revalidatePath("/", "layout");
  back({
    ok:
      onChain === "ok"
        ? "CA is live on the site. Holders can now unlock the live feed."
        : "CA saved and live. Solana didn't answer, so it couldn't be double-checked on chain.",
  });
}

export async function clearLaunchAction() {
  await requireAdmin();
  await clearLaunch(await getDb());
  revalidatePath("/", "layout");
  back({ ok: "CA removed from the site." });
}
