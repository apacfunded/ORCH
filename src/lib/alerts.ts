/** Alert payloads. Each is a frozen snapshot so a receipt never changes after it is printed. */

export type AlertType = "call" | "deleted" | "edited" | "coordinated" | "rename" | "display_name" | "bio" | "followers";

export interface CallPayload {
  handle: string;
  displayName: string;
  tweetId: string;
  text: string;
  postedAt: string;
  ca: string;
  ticker: string | null;
  sentiment: string;
  mcapAtCall: number | null;
}

export interface DeletedPayload {
  handle: string;
  displayName: string;
  tweetId: string;
  text: string;
  postedAt: string;
  deletedAt: string;
  calls: { ca: string; ticker: string | null; mcapAtCall: number | null; mcapAtDelete: number | null }[];
}

export interface EditedPayload {
  handle: string;
  displayName: string;
  tweetId: string;
  before: string;
  after: string;
  postedAt: string;
  editSeenAt: string;
}

export interface CoordinatedPayload {
  ca: string;
  ticker: string | null;
  accounts: { id: number; handle: string }[];
  firstAt: string;
  lastAt: string;
  windowMinutes: number;
  mcapAtDetect: number | null;
}

export interface ProfileChangePayload {
  handle: string;
  displayName: string;
  from: string | number;
  to: string | number;
  pct?: number;
  /** On a rename: the display name before, when it changed too. */
  previousDisplayName?: string;
}

export type AlertPayload = CallPayload | DeletedPayload | EditedPayload | CoordinatedPayload | ProfileChangePayload;

export interface AlertRow {
  id: number;
  type: AlertType;
  account_id: number | null;
  tweet_id: string | null;
  ca: string | null;
  payload: AlertPayload;
  created_at: Date;
}

export const ALERT_LABELS: Record<AlertType, string> = {
  call: "CALL",
  deleted: "DELETED",
  edited: "EDITED",
  coordinated: "COORDINATED PUSH",
  rename: "RENAMED",
  display_name: "NAME CHANGE",
  bio: "BIO CHANGE",
  followers: "FOLLOWER SWING",
};

/** Feed filter tabs → alert types. */
export const FEED_FILTERS: Record<string, AlertType[] | null> = {
  all: null,
  deleted: ["deleted"],
  edits: ["edited"],
  shills: ["coordinated"],
  calls: ["call"],
  accounts: ["rename", "display_name", "bio", "followers"],
};

export function tweetUrl(handle: string, tweetId: string): string {
  return `https://x.com/${handle}/status/${tweetId}`;
}
