import type { CallPayload, CoordinatedPayload, DeletedPayload, EditedPayload, ProfileChangePayload } from "./alerts";
import type { ReceiptDTO } from "./dto";
import { change, fmtDuration, fmtPct, fmtUsd } from "./format";

/** One factual line for share text and link previews. States what happened; never accuses. */
export function shareText(item: ReceiptDTO): string {
  switch (item.type) {
    case "deleted": {
      const p = item.payload as DeletedPayload;
      const lived = fmtDuration(new Date(p.deletedAt).getTime() - new Date(p.postedAt).getTime());
      const c = p.calls[0];
      const coin = c ? ` It called ${c.ticker ? `$${c.ticker}` : "a coin"} at ${fmtUsd(c.mcapAtCall)}; at deletion it was ${fmtUsd(c.mcapAtDelete)} (${fmtPct(change(c.mcapAtCall, c.mcapAtDelete))}).` : "";
      return `@${p.handle} deleted a tweet after ${lived}.${coin} 🧾`;
    }
    case "edited": {
      const p = item.payload as EditedPayload;
      return `@${p.handle} edited a post after it went out. Before and after: 🧾`;
    }
    case "coordinated": {
      const p = item.payload as CoordinatedPayload;
      const mins = fmtDuration(new Date(p.lastAt).getTime() - new Date(p.firstAt).getTime());
      return `${p.accounts.length} watched accounts posted ${p.ticker ? `$${p.ticker}` : "the same coin"} within ${mins}. 🧾`;
    }
    case "call": {
      const p = item.payload as CallPayload;
      const r = change(p.mcapAtCall, item.mcap_24h);
      const result = r === null ? "" : ` 24h later: ${fmtPct(r)}.`;
      return `@${p.handle} called ${p.ticker ? `$${p.ticker}` : "a coin"} at ${fmtUsd(p.mcapAtCall)}.${result} 🧾`;
    }
    case "rename": {
      const p = item.payload as ProfileChangePayload;
      return `@${p.from} is now @${p.to}. 🧾`;
    }
    case "followers": {
      const p = item.payload as ProfileChangePayload;
      return `@${p.handle} followers moved ${typeof p.pct === "number" ? fmtPct(p.pct / 100, 1) : ""} (${p.from} → ${p.to}). 🧾`;
    }
    default: {
      const p = item.payload as ProfileChangePayload;
      return `@${p.handle} changed their ${item.type === "bio" ? "bio" : "display name"}. 🧾`;
    }
  }
}
