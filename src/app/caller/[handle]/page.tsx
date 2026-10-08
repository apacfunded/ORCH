import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ReceiptCard } from "@/components/ReceiptCard";
import { getDb } from "@/db";
import { tweetUrl } from "@/lib/alerts";
import { toDTO } from "@/lib/dto";
import { change, fmtCount, fmtPct, fmtTime, fmtUsd, shortCa } from "@/lib/format";
import { feedCutoff } from "@/lib/gate";
import { getCaller } from "@/server/queries";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params;
  return { title: `@${decodeURIComponent(handle)} scorecard` };
}

function Ret({ base, v }: { base: number | null; v: number | null }) {
  if (!base) return <td className="num">—</td>;
  if (v === null) return <td className="num dim">pending</td>;
  const r = change(base, v);
  return <td className={`num ${r !== null && r >= 0 ? "up" : "down"}`}>{fmtPct(r)}</td>;
}

export default async function CallerPage({ params }: Params) {
  const { handle } = await params;
  const viewer = await getViewer();
  const db = await getDb();
  const data = await getCaller(db, decodeURIComponent(handle), feedCutoff(viewer.tier, new Date(), viewer.delayMinutes));
  if (!data) notFound();
  if (data.renamedFrom) redirect(`/caller/${encodeURIComponent(data.account.handle)}`);

  const { account, card, calls, receipts, deletions } = data;
  return (
    <div className="wrap page">
      <div className="profile">
        <div>
          <h1>@{account.handle}</h1>
          <div className="profile__meta">
            {account.display_name} · {fmtCount(account.followers)} followers · watched since {fmtTime(account.added_at)}
          </div>
        </div>
        <a className="btn btn--ghost" href={`https://x.com/${account.handle}`} target="_blank" rel="noreferrer">Open on X</a>
      </div>
      {account.bio ? <p className="dim" style={{ marginTop: 8 }}>{account.bio}</p> : null}

      <div className="cards">
        <div className="card"><span className="card__n">{card.totalCalls}</span><span className="card__k">Calls</span></div>
        <div className="card"><span className="card__n">{card.hitRate === null ? "—" : `${Math.round(card.hitRate * 100)}%`}</span><span className="card__k">Hit rate (24h)</span></div>
        <div className="card"><span className={`card__n ${card.avgReturn24h === null ? "" : card.avgReturn24h >= 0 ? "up" : "down"}`}>{fmtPct(card.avgReturn24h)}</span><span className="card__k">Avg 24h return</span></div>
        <div className="card"><span className="card__n">{card.rugs}</span><span className="card__k">Rugs called</span></div>
        <div className="card"><span className="card__n">{deletions}</span><span className="card__k">Tweets deleted</span></div>
      </div>

      <h2 className="section-title">Call history <small>{calls.length} most recent</small></h2>
      {calls.length === 0 ? (
        <div className="empty"><p className="empty__body">No coin calls logged for this account yet.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="t" aria-label="Call history">
            <thead>
              <tr>
                <th>Called</th><th>Coin</th><th className="num">Mcap at call</th><th className="num">1h</th><th className="num">24h</th><th className="num">7d</th><th>Post</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id}>
                  <td>{fmtTime(c.called_at)}</td>
                  <td>{c.ticker ? `$${c.ticker} ` : ""}<span className="dim">{c.ca ? shortCa(c.ca) : ""}</span>{c.sentiment === "bearish" ? <span className="dim"> (warning)</span> : null}</td>
                  <td className="num">{fmtUsd(c.mcap_at_call)}</td>
                  <Ret base={c.mcap_at_call} v={c.mcap_1h} />
                  <Ret base={c.mcap_at_call} v={c.mcap_24h} />
                  <Ret base={c.mcap_at_call} v={c.mcap_7d} />
                  <td>
                    {c.status === "deleted" ? (
                      <span className="down">deleted</span>
                    ) : (
                      <a href={tweetUrl(account.handle, c.tweet_id)} target="_blank" rel="noreferrer">view</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="section-title">Receipts <small>deletions, edits, pushes and account changes</small></h2>
      {receipts.length === 0 ? (
        <div className="empty"><p className="empty__body">Clean record so far. Nothing deleted, edited or changed.</p></div>
      ) : (
        <div className="feed__grid">
          {receipts.map((r) => <ReceiptCard key={r.id} item={toDTO(r)} />)}
        </div>
      )}
    </div>
  );
}
