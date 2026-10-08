import Link from "next/link";
export type { ReceiptDTO } from "@/lib/dto";
import {
  ALERT_LABELS,
  tweetUrl,
  type AlertType,
  type CallPayload,
  type CoordinatedPayload,
  type DeletedPayload,
  type EditedPayload,
  type ProfileChangePayload,
} from "@/lib/alerts";
import type { ReceiptDTO } from "@/lib/dto";
import { change, fmtCount, fmtDuration, fmtPct, fmtTime, fmtUsd, receiptNo, shortCa } from "@/lib/format";

function Row({ k, v, tone }: { k: string; v: React.ReactNode; tone?: "up" | "down" | null }) {
  return (
    <div className="r-row">
      <span className="r-k">{k}</span>
      <span className={`r-v${tone ? ` r-${tone}` : ""}`}>{v}</span>
    </div>
  );
}

function tone(frac: number | null): "up" | "down" | null {
  if (frac === null) return null;
  return frac >= 0 ? "up" : "down";
}

function Handle({ handle }: { handle: string }) {
  return (
    <Link className="r-handle" href={`/caller/${encodeURIComponent(handle)}`}>
      @{handle}
    </Link>
  );
}

function Coin({ ticker, ca }: { ticker: string | null; ca: string }) {
  return (
    <span className="r-coin">
      {ticker ? <b>${ticker}</b> : null} <span className="r-ca" title={ca}>{shortCa(ca)}</span>
    </span>
  );
}

function Body({ item }: { item: ReceiptDTO }) {
  switch (item.type) {
    case "call": {
      const p = item.payload as CallPayload;
      const r1 = change(p.mcapAtCall, item.mcap_1h);
      const r24 = change(p.mcapAtCall, item.mcap_24h);
      const r7 = change(p.mcapAtCall, item.mcap_7d);
      return (
        <>
          <div className="r-who"><Handle handle={p.handle} /> <span className="r-dim">{p.displayName}</span></div>
          <p className="r-text">{p.text}</p>
          <div className="r-rule" />
          <Row k="COIN" v={<Coin ticker={p.ticker} ca={p.ca} />} />
          <Row k="MCAP AT CALL" v={fmtUsd(p.mcapAtCall)} />
          {p.mcapAtCall ? (
            <>
              <Row k="AFTER 1H" v={item.mcap_1h === null ? "pending" : fmtPct(r1)} tone={tone(r1)} />
              <Row k="AFTER 24H" v={item.mcap_24h === null ? "pending" : fmtPct(r24)} tone={tone(r24)} />
              {item.mcap_7d !== null ? <Row k="AFTER 7D" v={fmtPct(r7)} tone={tone(r7)} /> : null}
            </>
          ) : (
            <Row k="RESULT" v="not scored (seen late)" />
          )}
          <Row k="POSTED" v={fmtTime(p.postedAt)} />
          {item.tweet_status === "deleted" ? <div className="stamp stamp--small">DELETED LATER</div> : null}
        </>
      );
    }
    case "deleted": {
      const p = item.payload as DeletedPayload;
      return (
        <>
          <div className="r-who"><Handle handle={p.handle} /> <span className="r-dim">{p.displayName}</span></div>
          <div className="r-stamped">
            <p className="r-text r-text--struck">{p.text}</p>
            <div className="stamp">DELETED</div>
          </div>
          <div className="r-rule" />
          <Row k="POSTED" v={fmtTime(p.postedAt)} />
          <Row k="DELETED" v={fmtTime(p.deletedAt)} />
          <Row k="LIVED FOR" v={fmtDuration(new Date(p.deletedAt).getTime() - new Date(p.postedAt).getTime())} />
          {p.calls.map((c) => {
            const r = change(c.mcapAtCall, c.mcapAtDelete);
            return (
              <div key={c.ca}>
                <div className="r-rule" />
                <Row k="COIN" v={<Coin ticker={c.ticker} ca={c.ca} />} />
                <Row k="MCAP AT CALL" v={fmtUsd(c.mcapAtCall)} />
                <Row k="MCAP AT DELETE" v={fmtUsd(c.mcapAtDelete)} />
                <Row k="CHANGE" v={fmtPct(r)} tone={tone(r)} />
              </div>
            );
          })}
        </>
      );
    }
    case "edited": {
      const p = item.payload as EditedPayload;
      return (
        <>
          <div className="r-who"><Handle handle={p.handle} /> <span className="r-dim">{p.displayName}</span></div>
          <div className="r-label">BEFORE</div>
          <p className="r-text r-text--struck">{p.before}</p>
          <div className="r-label">AFTER</div>
          <p className="r-text">{p.after}</p>
          <div className="r-rule" />
          <Row k="POSTED" v={fmtTime(p.postedAt)} />
          <Row k="EDIT SEEN" v={fmtTime(p.editSeenAt)} />
        </>
      );
    }
    case "coordinated": {
      const p = item.payload as CoordinatedPayload;
      const spanMs = new Date(p.lastAt).getTime() - new Date(p.firstAt).getTime();
      return (
        <>
          <p className="r-headline">
            {p.accounts.length} watched accounts posted the same coin within {fmtDuration(spanMs)}.
          </p>
          <div className="r-rule" />
          <Row k="COIN" v={<Coin ticker={p.ticker} ca={p.ca} />} />
          <Row k="FIRST POST" v={fmtTime(p.firstAt)} />
          <Row k="LAST POST" v={fmtTime(p.lastAt)} />
          <Row k="MCAP AT DETECT" v={fmtUsd(p.mcapAtDetect)} />
          <div className="r-rule" />
          <ul className="r-list">
            {p.accounts.map((a) => (
              <li key={a.id}><Handle handle={a.handle} /></li>
            ))}
          </ul>
        </>
      );
    }
    case "rename": {
      const p = item.payload as ProfileChangePayload;
      return (
        <>
          <p className="r-headline">Handle changed.</p>
          <div className="r-rule" />
          <Row k="FROM" v={`@${p.from}`} />
          <Row k="TO" v={<Handle handle={String(p.to)} />} />
          {p.previousDisplayName ? <Row k="NAME" v={`${p.previousDisplayName} → ${p.displayName}`} /> : null}
        </>
      );
    }
    case "display_name":
    case "bio": {
      const p = item.payload as ProfileChangePayload;
      return (
        <>
          <div className="r-who"><Handle handle={p.handle} /></div>
          <div className="r-label">BEFORE</div>
          <p className="r-text r-text--struck">{String(p.from) || "(empty)"}</p>
          <div className="r-label">AFTER</div>
          <p className="r-text">{String(p.to) || "(empty)"}</p>
        </>
      );
    }
    case "followers": {
      const p = item.payload as ProfileChangePayload;
      const frac = typeof p.pct === "number" ? p.pct / 100 : null;
      return (
        <>
          <div className="r-who"><Handle handle={p.handle} /> <span className="r-dim">{p.displayName}</span></div>
          <div className="r-rule" />
          <Row k="FOLLOWERS BEFORE" v={fmtCount(Number(p.from))} />
          <Row k="FOLLOWERS NOW" v={fmtCount(Number(p.to))} />
          <Row k="CHANGE" v={fmtPct(frac, 1)} tone={tone(frac)} />
        </>
      );
    }
  }
}

function sourceLink(item: ReceiptDTO): string | null {
  const p = item.payload as { handle?: string; tweetId?: string };
  if ((item.type === "call" || item.type === "edited") && p.handle && p.tweetId && item.tweet_status !== "deleted") {
    return tweetUrl(p.handle, p.tweetId);
  }
  return null;
}

export function ReceiptCard({ item, standalone = false }: { item: ReceiptDTO; standalone?: boolean }) {
  const src = sourceLink(item);
  return (
    <article className={`receipt receipt--${item.type}${standalone ? " receipt--standalone" : ""}`} aria-label={`${ALERT_LABELS[item.type]} receipt ${receiptNo(item.id)}`}>
      <header className="r-head">
        <span className="r-type">{ALERT_LABELS[item.type]}</span>
        <Link className="r-no" href={`/receipt/${item.id}`}>{receiptNo(item.id)}</Link>
      </header>
      <div className="r-rule r-rule--double" />
      <Body item={item} />
      <div className="r-rule" />
      <footer className="r-foot">
        <span>{fmtTime(item.created_at)}</span>
        <span className="r-links">
          {src ? <a href={src} target="_blank" rel="noreferrer">View post</a> : null}
          {!standalone ? <Link href={`/receipt/${item.id}`}>Open receipt</Link> : null}
        </span>
      </footer>
      <div className="barcode" aria-hidden="true" />
    </article>
  );
}
