import { config } from "@/config";
import { getDb } from "@/db";
import { toDTO } from "@/lib/dto";
import { canView, minutesUntilPublic } from "@/lib/gate";
import { getAlert } from "@/server/queries";
import { IMAGE_SIZE, renderReceiptImage } from "@/server/receipt-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = IMAGE_SIZE;
export const contentType = "image/png";
export const alt = "A Receipts card";

/** Link preview for /receipt/[id]. Crawlers are anonymous, so fresh receipts preview as locked. */
export default async function OpenGraphImage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const item = Number.isInteger(id) && id > 0 ? await getAlert(await getDb(), id) : null;
  if (!item) return renderReceiptImage(null);
  const now = new Date();
  const delay = config().publicDelayMinutes;
  if (!canView(item.created_at, "public", now, delay)) return renderReceiptImage(null, minutesUntilPublic(item.created_at, now, delay));
  return renderReceiptImage(toDTO(item));
}
