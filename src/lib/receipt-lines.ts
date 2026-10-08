import { ALERT_LABELS, type CallPayload, type CoordinatedPayload, type DeletedPayload, type EditedPayload, type ProfileChangePayload } from "./alerts";
import type { ReceiptDTO } from "./dto";
import { change, fmtCount, fmtDuration, fmtPct, fmtTime, fmtUsd, receiptNo, shortCa } from "./format";

export interface ReceiptLines {
  label: string;
  number: string;
  who: string | null;
  text: string | null;
  struck: boolean;
  stamp: string | null;
  rows: [string, string][];
  time: string;
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Plain-data version of a receipt, for the PNG renderer (and anything else that can't use React DOM). */
export function receiptLines(item: ReceiptDTO): ReceiptLines {
  const base = { label: ALERT_LABELS[item.type], number: receiptNo(item.id), time: fmtTime(item.created_at), stamp: null, struck: false };
  switch (item.type) {
    case "call": {
      const p = item.payload as CallPayload;
      const rows: [string, string][] = [
        ["COIN", `${p.ticker ? `$${p.ticker} ` : ""}${shortCa(p.ca)}`],
        ["MCAP AT CALL", fmtUsd(p.mcapAtCall)],
      ];
      if (item.mcap_24h !== null) rows.push(["AFTER 24H", fmtPct(change(p.mcapAtCall, item.mcap_24h))]);
      else if (item.mcap_1h !== null) rows.push(["AFTER 1H", fmtPct(change(p.mcapAtCall, item.mcap_1h))]);
      return { ...base, who: `@${p.handle}`, text: clip(p.text, 200), rows, stamp: item.tweet_status === "deleted" ? "DELETED LATER" : null };
    }
    case "deleted": {
      const p = item.payload as DeletedPayload;
      const rows: [string, string][] = [
        ["POSTED", fmtTime(p.postedAt)],
        ["LIVED FOR", fmtDuration(new Date(p.deletedAt).getTime() - new Date(p.postedAt).getTime())],
      ];
      const c = p.calls[0];
      if (c) {
        rows.push(["COIN", `${c.ticker ? `$${c.ticker} ` : ""}${shortCa(c.ca)}`]);
        rows.push(["CALL → DELETE", `${fmtUsd(c.mcapAtCall)} → ${fmtUsd(c.mcapAtDelete)} (${fmtPct(change(c.mcapAtCall, c.mcapAtDelete))})`]);
      }
      return { ...base, who: `@${p.handle}`, text: clip(p.text, 200), struck: true, stamp: "DELETED", rows };
    }
    case "edited": {
      const p = item.payload as EditedPayload;
      return { ...base, who: `@${p.handle}`, text: clip(`BEFORE: ${p.before}\nAFTER: ${p.after}`, 240), rows: [["POSTED", fmtTime(p.postedAt)]] };
    }
    case "coordinated": {
      const p = item.payload as CoordinatedPayload;
      const span = fmtDuration(new Date(p.lastAt).getTime() - new Date(p.firstAt).getTime());
      return {
        ...base,
        who: null,
        text: `${p.accounts.length} watched accounts posted the same coin within ${span}.`,
        rows: [
          ["COIN", `${p.ticker ? `$${p.ticker} ` : ""}${shortCa(p.ca)}`],
          ["ACCOUNTS", clip(p.accounts.map((a) => `@${a.handle}`).join(" "), 70)],
          ["MCAP AT DETECT", fmtUsd(p.mcapAtDetect)],
        ],
      };
    }
    case "rename": {
      const p = item.payload as ProfileChangePayload;
      return { ...base, who: null, text: "Handle changed.", rows: [["FROM", `@${p.from}`], ["TO", `@${p.to}`]] };
    }
    case "followers": {
      const p = item.payload as ProfileChangePayload;
      return {
        ...base,
        who: `@${p.handle}`,
        text: null,
        rows: [["BEFORE", fmtCount(Number(p.from))], ["NOW", fmtCount(Number(p.to))], ["CHANGE", fmtPct(typeof p.pct === "number" ? p.pct / 100 : null, 1)]],
      };
    }
    default: {
      const p = item.payload as ProfileChangePayload;
      return { ...base, who: `@${p.handle}`, text: clip(`BEFORE: ${p.from || "(empty)"}\nAFTER: ${p.to || "(empty)"}`, 240), rows: [] };
    }
  }
}
