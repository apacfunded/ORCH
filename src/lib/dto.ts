import type { AlertType } from "./alerts";

/** A feed item as sent to the browser (dates as ISO strings). */
export interface ReceiptDTO {
  id: number;
  type: AlertType;
  payload: unknown;
  created_at: string;
  tweet_status: string | null;
  mcap_1h: number | null;
  mcap_24h: number | null;
  mcap_7d: number | null;
}

/** Convert a DB row to a browser-safe DTO. */
export function toDTO(row: {
  id: number;
  type: AlertType;
  payload: unknown;
  created_at: Date | string;
  tweet_status: string | null;
  mcap_1h: number | null;
  mcap_24h: number | null;
  mcap_7d: number | null;
}): ReceiptDTO {
  return {
    id: row.id,
    type: row.type,
    payload: row.payload,
    created_at: typeof row.created_at === "string" ? row.created_at : row.created_at.toISOString(),
    tweet_status: row.tweet_status,
    mcap_1h: row.mcap_1h,
    mcap_24h: row.mcap_24h,
    mcap_7d: row.mcap_7d,
  };
}
