import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/CopyButton";
import { ReceiptCard } from "@/components/ReceiptCard";
import { config } from "@/config";
import { getDb } from "@/db";
import { ALERT_LABELS } from "@/lib/alerts";
import { toDTO } from "@/lib/dto";
import { canView, minutesUntilPublic } from "@/lib/gate";
import { receiptNo } from "@/lib/format";
import { shareText } from "@/lib/share";
import { getAlert } from "@/server/queries";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const id = parseId((await params).id);
  if (!id) return {};
  const item = await getAlert(await getDb(), id);
  if (!item) return {};
  // Crawlers have no session: if the receipt is still holder-only, don't leak its text into the preview.
  const publicNow = canView(item.created_at, "public", new Date(), config().publicDelayMinutes);
  const title = `${ALERT_LABELS[item.type]} ${receiptNo(item.id)}`;
  return { title, description: publicNow ? shareText(toDTO(item)) : "A fresh receipt, live for $RECEIPTS holders now." };
}

export default async function ReceiptPage({ params }: Params) {
  const id = parseId((await params).id);
  if (!id) notFound();
  const viewer = await getViewer();
  const item = await getAlert(await getDb(), id);
  if (!item) notFound();

  const now = new Date();
  if (!canView(item.created_at, viewer.tier, now, viewer.delayMinutes)) {
    const mins = minutesUntilPublic(item.created_at, now, viewer.delayMinutes);
    return (
      <div className="wrap page">
        <div className="lockcard">
          <p className="eyebrow" style={{ justifyContent: "center" }}>{ALERT_LABELS[item.type]} {receiptNo(item.id)}</p>
          <h1 style={{ margin: "0 0 10px", fontSize: 28 }}>Holders are reading this one now.</h1>
          <p className="dim" style={{ margin: 0 }}>
            It unlocks for everyone in {mins} {mins === 1 ? "minute" : "minutes"}.
            {viewer.gateOpen ? " Hold $RECEIPTS and connect your wallet to see it live." : ""}
          </p>
        </div>
      </div>
    );
  }

  const c = config();
  const dto = toDTO(item);
  const url = `${c.siteUrl}/receipt/${item.id}`;
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(shareText(dto))}&url=${encodeURIComponent(url)}`;
  return (
    <div className="wrap page">
      <ReceiptCard item={dto} standalone />
      <div className="share">
        <a className="btn btn--primary" href={intent} target="_blank" rel="noreferrer">Post this receipt on X</a>
        <CopyButton value={url} label="Copy link" className="btn btn--ghost" />
        <a className="btn btn--ghost" href={`/api/receipt/${item.id}/image`} download={`receipt-${item.id}.png`}>Download image</a>
      </div>
    </div>
  );
}
