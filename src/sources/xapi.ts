import { RateLimitError, type SourceProfile, type SourceTweet, type TweetLookup, type TwitterSource } from "./types";

const BASE = "https://api.x.com/2";
const USER_FIELDS = "description,public_metrics,profile_image_url,protected,name,username";
const TWEET_FIELDS = "created_at,author_id";

interface XUser {
  id: string;
  username: string;
  name: string;
  description?: string;
  protected?: boolean;
  profile_image_url?: string;
  public_metrics?: { followers_count: number };
}
interface XTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  note_tweet?: { text: string };
}
interface XError {
  resource_id?: string;
  value?: string;
  title?: string;
  type?: string;
  detail?: string;
}

function toProfile(u: XUser): SourceProfile {
  return {
    userId: u.id,
    handle: u.username,
    displayName: u.name,
    bio: u.description ?? "",
    followers: u.public_metrics?.followers_count ?? 0,
    avatarUrl: u.profile_image_url ?? null,
    isPublic: !u.protected,
  };
}

/**
 * Official X API v2 source (app-only bearer token). Handles 429s by throwing RateLimitError with the reset
 * time, which the worker uses to pause that job instead of hammering the API.
 */
export class XApiSource implements TwitterSource {
  readonly name = "x";
  constructor(
    private readonly bearer: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async get<T>(path: string): Promise<{ data?: T; errors?: XError[]; includes?: unknown }> {
    const res = await this.fetchImpl(`${BASE}${path}`, {
      headers: { authorization: `Bearer ${this.bearer}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429) {
      const reset = Number(res.headers.get("x-rate-limit-reset"));
      const resetAt = Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : new Date(Date.now() + 15 * 60_000);
      throw new RateLimitError(`X API rate limited on ${path.split("?")[0]}`, resetAt);
    }
    if (res.status === 404) return { errors: [{ type: "https://api.twitter.com/2/problems/resource-not-found" }] };
    if (!res.ok) throw new Error(`X API ${res.status} on ${path.split("?")[0]}`);
    return (await res.json()) as { data?: T; errors?: XError[] };
  }

  async lookupUser(handle: string): Promise<SourceProfile | null> {
    const clean = handle.replace(/^@/, "").trim();
    if (!/^[A-Za-z0-9_]{1,15}$/.test(clean)) return null;
    const body = await this.get<XUser>(`/users/by/username/${clean}?user.fields=${USER_FIELDS}`);
    return body.data ? toProfile(body.data) : null;
  }

  async fetchProfile(userId: string): Promise<SourceProfile | null> {
    const body = await this.get<XUser>(`/users/${encodeURIComponent(userId)}?user.fields=${USER_FIELDS}`);
    return body.data ? toProfile(body.data) : null;
  }

  async fetchUserTweets(userId: string, sinceId: string | null): Promise<SourceTweet[]> {
    const params = new URLSearchParams({ max_results: "100", "tweet.fields": TWEET_FIELDS, exclude: "retweets" });
    if (sinceId) params.set("since_id", sinceId);
    else params.set("start_time", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
    const body = await this.get<XTweet[]>(`/users/${encodeURIComponent(userId)}/tweets?${params}`);
    return (body.data ?? []).map((t) => ({
      id: t.id,
      authorId: t.author_id,
      text: t.note_tweet?.text ?? t.text,
      postedAt: new Date(t.created_at),
    }));
  }

  async fetchTweets(ids: string[]): Promise<Map<string, TweetLookup>> {
    const out = new Map<string, TweetLookup>();
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const body = await this.get<XTweet[]>(`/tweets?ids=${chunk.join(",")}&tweet.fields=${TWEET_FIELDS}`);
      for (const t of body.data ?? []) out.set(t.id, { kind: "found", text: t.note_tweet?.text ?? t.text });
      for (const e of body.errors ?? []) {
        const id = e.resource_id ?? e.value;
        if (!id) continue;
        // Only a true "not found" counts toward deletion. Authorization errors (protected / suspended
        // accounts) are not deletions.
        const notFound = (e.type ?? "").includes("resource-not-found") || e.title === "Not Found Error";
        out.set(id, notFound ? { kind: "missing" } : { kind: "error" });
      }
      for (const id of chunk) if (!out.has(id)) out.set(id, { kind: "error" });
    }
    return out;
  }
}
