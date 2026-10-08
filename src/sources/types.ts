/** Everything Receipts needs from a tweet provider. Swap providers by implementing this interface. */

export interface SourceTweet {
  id: string;
  authorId: string;
  text: string;
  postedAt: Date;
}

export interface SourceProfile {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  followers: number;
  avatarUrl: string | null;
  /** Protected / suspended accounts are skipped — Receipts only tracks public accounts. */
  isPublic: boolean;
}

export type TweetLookup = { kind: "found"; text: string } | { kind: "missing" } | { kind: "error" };

export interface TwitterSource {
  readonly name: string;
  lookupUser(handle: string): Promise<SourceProfile | null>;
  fetchProfile(userId: string): Promise<SourceProfile | null>;
  /** Newest-first or oldest-first is fine; the worker sorts. `sinceId` excludes that tweet and older. */
  fetchUserTweets(userId: string, sinceId: string | null): Promise<SourceTweet[]>;
  /** Batch lookup (the X API allows 100 ids per call). Every requested id must be present in the result. */
  fetchTweets(ids: string[]): Promise<Map<string, TweetLookup>>;
}

export interface PriceSource {
  readonly name: string;
  /** Current market cap in USD, or null when the coin has no market. */
  getMarketCap(ca: string): Promise<number | null>;
}

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly resetAt: Date,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
