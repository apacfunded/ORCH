import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { FeedClient } from "@/components/FeedClient";
import { ReceiptCard } from "@/components/ReceiptCard";
import { getDb } from "@/db";
import { toDTO } from "@/lib/dto";
import { fmtCount } from "@/lib/format";
import { feedCutoff } from "@/lib/gate";
import { countLocked, getFeed, getStats } from "@/server/queries";
import { getLaunch } from "@/server/launch";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";

export default async function Home() {
  const viewer = await getViewer();
  const db = await getDb();
  const now = new Date();
  const cutoff = feedCutoff(viewer.tier, now, viewer.delayMinutes);
  const [items, locked, stats, [hero], launch] = await Promise.all([
    getFeed(db, { cutoff, limit: 30 }),
    countLocked(db, cutoff, now),
    getStats(db),
    getFeed(db, { cutoff, limit: 1, types: ["deleted"] }),
    getLaunch(db),
  ]);
  const heroItem = hero ?? items[0];

  return (
    <div className="wrap">
      <section className="hero">
        <div>
          <p className="eyebrow">AI watching crypto Twitter</p>
          <h1>
            Deleted tweets don&apos;t <em>disappear</em>. They get receipts.
          </h1>
          <p className="hero__sub">
            Receipts watches CT callers around the clock. It logs every coin they shill, catches deleted tweets and quiet edits,
            flags coordinated pushes and scores every call.
          </p>
          {launch.mint ? (
            <div className="ca-box">
              <span className="ca-box__k">$RECEIPTS CA</span>
              <code className="ca-box__v">{launch.mint}</code>
              <div className="ca-box__actions">
                <CopyButton value={launch.mint} label="Copy CA" className="btn btn--primary btn--sm" />
                <a href={launch.pumpUrl} className="btn btn--ghost btn--sm" target="_blank" rel="noreferrer">Buy on pump.fun</a>
                <a href={launch.dexUrl} className="btn btn--ghost btn--sm" target="_blank" rel="noreferrer">Chart</a>
              </div>
            </div>
          ) : null}
          <div className="hero__cta">
            <Link href="/leaderboard" className={launch.mint ? "btn btn--ghost" : "btn btn--primary"}>See the worst callers</Link>
            <Link href="/about" className="btn btn--ghost">How it works</Link>
          </div>
          <div className="stats" role="list">
            <div className="stat" role="listitem"><span className="stat__n">{fmtCount(stats.watched)}</span><span className="stat__k">Accounts watched</span></div>
            <div className="stat" role="listitem"><span className="stat__n">{fmtCount(stats.calls)}</span><span className="stat__k">Calls tracked</span></div>
            <div className="stat" role="listitem"><span className="stat__n">{fmtCount(stats.deleted)}</span><span className="stat__k">Deletions caught</span></div>
            <div className="stat" role="listitem"><span className="stat__n">{fmtCount(stats.coordinated)}</span><span className="stat__k">Coordinated pushes</span></div>
          </div>
        </div>

        <div className="printer" aria-label="Latest receipt">
          <div className="printer__body">
            <span className="printer__label">RCPT-01 · PRINTING</span>
            <span className="printer__led" aria-hidden="true" />
            <span className="printer__slot" aria-hidden="true" />
          </div>
          <div className="printer__feed">
            <div className="printer__paper">
              {heroItem ? (
                <ReceiptCard item={toDTO(heroItem)} />
              ) : (
                <div className="receipt">
                  <div className="r-head"><span className="r-type">WARMING UP</span></div>
                  <div className="r-rule r-rule--double" />
                  <p className="r-text">The first receipts print as soon as the watcher finishes its first pass.</p>
                  <div className="barcode" aria-hidden="true" />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <FeedClient
        initialItems={items.map(toDTO)}
        initialLocked={locked}
        tier={viewer.tier}
        delayMinutes={viewer.delayMinutes}
        gateOpen={viewer.gateOpen}
      />
    </div>
  );
}
