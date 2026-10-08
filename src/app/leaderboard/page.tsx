import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { fmtPct } from "@/lib/format";
import { MIN_SCORED_FOR_RANK } from "@/lib/trackers/scorecard";
import { getLeaderboard, type CallerRow } from "@/server/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Leaderboard" };

function pctCell(v: number | null) {
  if (v === null) return <td className="num">—</td>;
  return <td className={`num ${v >= 0 ? "up" : "down"}`}>{fmtPct(v)}</td>;
}

function Table({ rows, label }: { rows: CallerRow[]; label: string }) {
  if (rows.length === 0) {
    return <div className="empty"><p className="empty__body">No caller has {MIN_SCORED_FOR_RANK} scored calls yet. Rankings fill in as 24-hour results land.</p></div>;
  }
  return (
    <div className="table-wrap">
      <table className="t" aria-label={label}>
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Caller</th>
            <th className="num">Calls</th>
            <th className="num">Hit rate</th>
            <th className="num">Avg 24h</th>
            <th>Best</th>
            <th>Worst</th>
            <th className="num">Rugs</th>
            <th className="num">Deleted</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 25).map((r, i) => (
            <tr key={r.id}>
              <td className="num">{i + 1}</td>
              <td><Link href={`/caller/${encodeURIComponent(r.handle)}`}>@{r.handle}</Link></td>
              <td className="num">{r.card.scored}/{r.card.totalCalls}</td>
              <td className="num">{r.card.hitRate === null ? "—" : `${Math.round(r.card.hitRate * 100)}%`}</td>
              {pctCell(r.card.avgReturn24h)}
              <td>{r.card.best ? <span className="up">{r.card.best.ticker ? `$${r.card.best.ticker} ` : ""}{fmtPct(r.card.best.return24h)}</span> : "—"}</td>
              <td>{r.card.worst ? <span className="down">{r.card.worst.ticker ? `$${r.card.worst.ticker} ` : ""}{fmtPct(r.card.worst.return24h)}</span> : "—"}</td>
              <td className="num">{r.card.rugs}</td>
              <td className="num">{r.deletions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Leaderboard() {
  const db = await getDb();
  const { best, worst, unranked } = await getLeaderboard(db);
  return (
    <div className="wrap page">
      <div className="page__head">
        <h1>Leaderboard</h1>
        <p>
          Every call is scored on what the coin did 24 hours later. Hit rate counts calls that were up after 24h. A rug is any
          check under 10% of the market cap at call time. Callers need {MIN_SCORED_FOR_RANK} scored calls to be ranked.
        </p>
      </div>

      <h2 className="section-title">Worst callers <small>lowest hit rate and returns</small></h2>
      <Table rows={worst} label="Worst callers" />

      <h2 className="section-title">Best callers <small>highest hit rate and returns</small></h2>
      <Table rows={best} label="Best callers" />

      {unranked.length ? (
        <>
          <h2 className="section-title">Watching <small>not enough scored calls yet</small></h2>
          <div className="table-wrap">
            <table className="t" aria-label="Unranked callers">
              <thead>
                <tr><th>Caller</th><th className="num">Calls</th><th className="num">Scored</th><th className="num">Deleted</th></tr>
              </thead>
              <tbody>
                {unranked.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/caller/${encodeURIComponent(r.handle)}`}>@{r.handle}</Link></td>
                    <td className="num">{r.card.totalCalls}</td>
                    <td className="num">{r.card.scored}</td>
                    <td className="num">{r.deletions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
