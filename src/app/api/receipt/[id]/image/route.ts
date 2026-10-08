import { config } from "@/config";
import { getDb } from "@/db";
import { toDTO } from "@/lib/dto";
import { canView, minutesUntilPublic } from "@/lib/gate";
import { getAlert } from "@/server/queries";
import { renderReceiptImage } from "@/server/receipt-image";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** PNG receipt card. Gated like the page: a holder-only receipt renders as a locked card for everyone else. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });
  const item = await getAlert(await getDb(), id);
  if (!item) return new Response("Not found", { status: 404 });

  const viewer = await getViewer();
  const now = new Date();
  const delay = config().publicDelayMinutes;
  if (!canView(item.created_at, viewer.tier, now, delay)) {
    const img = await renderReceiptImage(null, minutesUntilPublic(item.created_at, now, delay));
    img.headers.set("cache-control", "private, no-store");
    return img;
  }
  return renderReceiptImage(toDTO(item));
}
