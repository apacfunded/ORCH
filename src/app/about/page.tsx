import type { Metadata } from "next";
import { config } from "@/config";
import { getDb } from "@/db";
import { getThresholds } from "@/server/context";
import { requestRemovalAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "How it works" };

export default async function About({ searchParams }: { searchParams: Promise<{ sent?: string; err?: string }> }) {
  const { sent, err } = await searchParams;
  const c = config();
  const t = await getThresholds(await getDb());
  return (
    <div className="wrap page">
      <div className="page__head">
        <h1>How Receipts works</h1>
        <p>An AI watches a list of public crypto Twitter accounts and prints a receipt whenever something worth remembering happens.</p>
      </div>

      <div className="prose">
        <h2>The four trackers</h2>
        <ul>
          <li><b>Caller scorecards.</b> Every coin an account posts with a contract address is logged with its market cap at that moment, then re-checked after 1 hour, 24 hours and 7 days.</li>
          <li><b>Deleted tweets and edits.</b> Every tweet is saved when we first see it. A tweet is marked deleted only after it fails to load {t.deleteConfirmFails}+ times, at least {t.deleteConfirmGapMinutes} minutes apart, so outages and rate limits don&apos;t create false receipts.</li>
          <li><b>Coordinated pushes.</b> When {t.coordMinAccounts} or more watched accounts post the same contract address within {t.coordWindowMinutes} minutes, that gets a receipt.</li>
          <li><b>Account changes.</b> Handle renames, display name and bio edits, and follower swings of {t.followerSpikePct}% or more.</li>
        </ul>

        <h2>Holding $RECEIPTS</h2>
        <p>
          Everyone sees every receipt, {c.publicDelayMinutes} minutes after it prints. Holders see them live. Connect a Solana wallet
          and sign a message (free, no transaction); the server reads your balance on chain and re-checks it every few minutes.
          {c.mint ? "" : " Live access opens when $RECEIPTS launches."}
        </p>
        <p>Creator fees pay for the data and the AI, so the watcher keeps running as long as the coin trades.</p>

        <h2>Ground rules</h2>
        <ul>
          <li>Public accounts only: callers, KOLs and project accounts. Never private individuals, never protected accounts.</li>
          <li>Receipts state facts: what was posted, when it changed or disappeared, what the price did. They don&apos;t accuse anyone.</li>
          <li>Every receipt keeps a link to the original post while it exists.</li>
        </ul>

        <h2 id="removal">Request removal</h2>
        <p>If you run an account on the watchlist and want it removed, send a request. We review every one.</p>
        {sent ? <p className="flash flash--ok" role="status">Request received. We&apos;ll review it soon.</p> : null}
        {err ? <p className="flash flash--err" role="alert">Enter the X handle like @name (letters, numbers and underscores).</p> : null}
        <form action={requestRemovalAction} className="form">
          <div className="field">
            <label htmlFor="r-handle">Account handle</label>
            <input id="r-handle" name="handle" className="input" placeholder="@handle" required maxLength={16} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="r-contact">How we can reach you <span className="dim">(optional)</span></label>
            <input id="r-contact" name="contact" className="input" maxLength={200} />
          </div>
          <div className="field">
            <label htmlFor="r-reason">Anything we should know <span className="dim">(optional)</span></label>
            <textarea id="r-reason" name="reason" className="input" maxLength={2000} />
          </div>
          <div aria-hidden="true" style={{ position: "absolute", left: -9999 }}>
            <label htmlFor="r-website">Website</label>
            <input id="r-website" name="website" tabIndex={-1} autoComplete="off" />
          </div>
          <div><button className="btn btn--primary" type="submit">Send request</button></div>
        </form>
      </div>
    </div>
  );
}
