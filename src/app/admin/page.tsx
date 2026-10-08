import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/config";
import { getDb, one } from "@/db";
import { fmtAgo, fmtCount, fmtTime } from "@/lib/format";
import { getThresholds } from "@/server/context";
import { getViewer } from "@/server/viewer";
import { addAccountAction, resolveRemovalAction, saveThresholdsAction, setAccountAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin", robots: { index: false } };

const THRESHOLD_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "coordMinAccounts", label: "Coordinated push: accounts", hint: "Distinct watched accounts posting the same CA" },
  { key: "coordWindowMinutes", label: "Coordinated push: window (min)", hint: "Rolling window those posts must fall in" },
  { key: "followerSpikePct", label: "Follower swing (%)", hint: "Change between profile checks that prints a receipt" },
  { key: "deleteConfirmFails", label: "Deletion: failed checks", hint: "Consecutive not-found results before a tweet is marked deleted" },
  { key: "deleteConfirmGapMinutes", label: "Deletion: minimum gap (min)", hint: "Time between first and last failed check" },
];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const viewer = await getViewer();
  if (!viewer.isAdmin) {
    return (
      <div className="wrap page">
        <div className="lockcard">
          <h1 style={{ margin: "0 0 10px", fontSize: 28 }}>Admins only</h1>
          <p className="dim" style={{ margin: 0 }}>Connect a wallet listed in ADMIN_WALLETS to manage the watchlist.</p>
        </div>
      </div>
    );
  }
  const { ok, err } = await searchParams;
  const db = await getDb();
  const [accounts, thresholds, removals, heartbeat] = await Promise.all([
    db.query<{ id: number; handle: string; followers: number; active: boolean; poll_minutes: number; last_polled_at: Date | null; tweets: number }>(
      `SELECT a.id, a.handle, a.followers, a.active, a.poll_minutes, a.last_polled_at,
              (SELECT count(*)::int FROM tweets t WHERE t.account_id = a.id) AS tweets
         FROM accounts a ORDER BY a.active DESC, lower(a.handle)`,
    ),
    getThresholds(db),
    db.query<{ id: number; handle: string; contact: string; reason: string; created_at: Date }>(
      `SELECT id, handle, contact, reason, created_at FROM removal_requests WHERE status = 'open' ORDER BY created_at`,
    ),
    one<{ updated_at: Date }>(db, `SELECT updated_at FROM worker_state WHERE key = 'heartbeat'`),
  ]);
  const c = config();

  return (
    <div className="wrap page">
      <div className="page__head">
        <h1>Admin</h1>
        <p>
          Source: <b className="mono">{c.dataSource}</b> · prices: <b className="mono">{c.priceSource}</b> · AI extraction:{" "}
          <b className="mono">{c.anthropicApiKey ? c.aiModel : "off (rules only)"}</b> · worker heartbeat:{" "}
          <b className="mono">{heartbeat ? fmtAgo(heartbeat.updated_at) : "never"}</b>
        </p>
      </div>
      {ok ? <p className="flash flash--ok" role="status">{ok}</p> : null}
      {err ? <p className="flash flash--err" role="alert">{err}</p> : null}

      <h2 className="section-title">Add to watchlist <small>public accounts only</small></h2>
      <form action={addAccountAction} className="inline-form">
        <div className="field">
          <label htmlFor="handle">X handle</label>
          <input id="handle" name="handle" className="input" placeholder="@handle" required autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="poll">Check every (min)</label>
          <input id="poll" name="poll" type="number" min={1} max={1440} defaultValue={c.worker.defaultPollMinutes} className="input" style={{ width: 120 }} />
        </div>
        <button className="btn btn--primary" type="submit">Add account</button>
      </form>

      <h2 className="section-title">Watchlist <small>{accounts.filter((a) => a.active).length} active</small></h2>
      <div className="table-wrap">
        <table className="t" aria-label="Watchlist">
          <thead>
            <tr><th>Account</th><th className="num">Followers</th><th className="num">Tweets</th><th>Last checked</th><th>Check every (min)</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td><Link href={`/caller/${encodeURIComponent(a.handle)}`}>@{a.handle}</Link></td>
                <td className="num">{fmtCount(a.followers)}</td>
                <td className="num">{a.tweets}</td>
                <td>{a.last_polled_at ? fmtAgo(a.last_polled_at) : "—"}</td>
                <td colSpan={3}>
                  <form action={setAccountAction} className="row-actions">
                    <input type="hidden" name="id" value={a.id} />
                    <label className="sr-only" htmlFor={`poll-${a.id}`}>Check every (minutes) for @{a.handle}</label>
                    <input id={`poll-${a.id}`} name="poll" type="number" min={1} max={1440} defaultValue={a.poll_minutes} className="input" style={{ width: 90 }} />
                    <label className="sr-only" htmlFor={`active-${a.id}`}>Status for @{a.handle}</label>
                    <select id={`active-${a.id}`} name="active" defaultValue={a.active ? "1" : "0"} className="input">
                      <option value="1">Watching</option>
                      <option value="0">Paused</option>
                    </select>
                    <button className="btn btn--ghost btn--sm" type="submit">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Thresholds</h2>
      <form action={saveThresholdsAction} className="form">
        <div className="grid-2">
          {THRESHOLD_FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <label htmlFor={f.key}>{f.label}</label>
              <input id={f.key} name={f.key} type="number" min={0} step="any" defaultValue={(thresholds as Record<string, number>)[f.key]} className="input" />
              <span className="hint">{f.hint}</span>
            </div>
          ))}
        </div>
        <div><button className="btn btn--primary" type="submit">Save thresholds</button></div>
      </form>

      <h2 className="section-title">Removal requests <small>{removals.length} open</small></h2>
      {removals.length === 0 ? (
        <div className="empty"><p className="empty__body">No open requests.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="t" aria-label="Removal requests">
            <thead><tr><th>Handle</th><th>Contact</th><th>Reason</th><th>Received</th><th /></tr></thead>
            <tbody>
              {removals.map((r) => (
                <tr key={r.id}>
                  <td>@{r.handle}</td>
                  <td>{r.contact || "—"}</td>
                  <td style={{ whiteSpace: "normal", minWidth: 240 }}>{r.reason || "—"}</td>
                  <td>{fmtTime(r.created_at)}</td>
                  <td>
                    <form action={resolveRemovalAction} className="row-actions">
                      <input type="hidden" name="id" value={r.id} />
                      <button className="btn btn--danger btn--sm" name="decision" value="removed" type="submit">Stop watching @{r.handle}</button>
                      <button className="btn btn--ghost btn--sm" name="decision" value="dismissed" type="submit">Dismiss</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
