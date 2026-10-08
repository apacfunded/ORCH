"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";

export async function requestRemovalAction(form: FormData) {
  // Honeypot: real people never fill the hidden "website" field.
  if (String(form.get("website") ?? "")) redirect("/about?sent=1#removal");

  const handle = String(form.get("handle") ?? "").trim().replace(/^@/, "");
  const contact = String(form.get("contact") ?? "").trim().slice(0, 200);
  const reason = String(form.get("reason") ?? "").trim().slice(0, 2000);
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) redirect("/about?err=handle#removal");

  const db = await getDb();
  const recent = await db.query(
    `SELECT id FROM removal_requests WHERE lower(handle) = lower($1) AND status = 'open' LIMIT 1`,
    [handle],
  );
  if (recent.length === 0) {
    await db.query(`INSERT INTO removal_requests (handle, contact, reason) VALUES ($1, $2, $3)`, [handle, contact, reason]);
  }
  redirect("/about?sent=1#removal");
}
