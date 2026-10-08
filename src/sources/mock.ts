import { base58Decode, base58Encode } from "../lib/base58";
import type { Clock, PriceSource, SourceProfile, SourceTweet, TweetLookup, TwitterSource } from "./types";

/**
 * A deterministic, endless simulation of crypto Twitter, so the whole app runs with zero API keys.
 *
 * Everything is a pure function of time: the same moment always produces the same tweets, deletions,
 * edits, renames, follower swings and coin prices, in every process. That lets the web app, the worker and
 * the seed script agree without sharing state. All handles and coins are invented ("Example data").
 */

const ORIGIN = Date.UTC(2026, 0, 1);
const MIN = 60_000;
const HOUR = 60 * MIN;
const BUCKET = 10 * MIN;
const COIN_EVERY = 2 * HOUR;

// ── deterministic randomness ──────────────────────────────────────────────────────────────────────────

function mix(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    h ^= p + 0x7f4a7c15 + (h << 6) + (h >>> 2);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length)];
}

// ── accounts ──────────────────────────────────────────────────────────────────────────────────────────

interface DemoAccount {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  followers: number;
  /** Chance of tweeting in any 10-minute bucket. */
  activity: number;
  /** Chance of deleting a call that went badly. */
  deletes: number;
  /** Chance of editing a call shortly after posting. */
  edits: number;
  renames?: boolean;
  spikes?: boolean;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { userId: "demo-01", handle: "gemhunter_vex", displayName: "Vex | gem hunter", bio: "early on everything. nfa", followers: 48_200, activity: 0.09, deletes: 0.7, edits: 0 },
  { userId: "demo-02", handle: "0xNightCaller", displayName: "Night Caller", bio: "calls at 3am. you sleep, i print", followers: 121_000, activity: 0.08, deletes: 0.1, edits: 0.3 },
  { userId: "demo-03", handle: "degenpriest", displayName: "the degen priest", bio: "blessing your bags since 2021", followers: 33_900, activity: 0.07, deletes: 0.5, edits: 0, renames: true },
  { userId: "demo-04", handle: "mooncandle_mo", displayName: "Mo", bio: "green candles only", followers: 9_800, activity: 0.1, deletes: 0, edits: 0.2 },
  { userId: "demo-05", handle: "ser_alpha_ape", displayName: "ser alpha", bio: "alpha group in bio (it's not)", followers: 76_500, activity: 0.06, deletes: 0.6, edits: 0, spikes: true },
  { userId: "demo-06", handle: "bagsecured", displayName: "bag secured", bio: "secured. mostly.", followers: 15_300, activity: 0.08, deletes: 0, edits: 0 },
  { userId: "demo-07", handle: "trenchwizard", displayName: "Trench Wizard 🧙", bio: "casting buys", followers: 54_100, activity: 0.07, deletes: 0.2, edits: 0.1 },
  { userId: "demo-08", handle: "callooor", displayName: "callooor", bio: "i call. you ape. we pray", followers: 22_700, activity: 0.09, deletes: 0.4, edits: 0 },
  { userId: "demo-09", handle: "pumpprophet", displayName: "Pump Prophet", bio: "foretold 9 of my last 3 calls", followers: 88_000, activity: 0.06, deletes: 0.3, edits: 0, renames: true },
  { userId: "demo-10", handle: "lowcapkira", displayName: "Kira", bio: "sub 1m mcap or nothing", followers: 12_400, activity: 0.08, deletes: 0, edits: 0.1 },
  { userId: "demo-11", handle: "soldierofsol", displayName: "Soldier of SOL", bio: "never selling (sold)", followers: 41_000, activity: 0.07, deletes: 0.2, edits: 0, spikes: true },
  { userId: "demo-12", handle: "apexchad_sim", displayName: "Apex Chad", bio: "top 1% caller, self-reported", followers: 64_300, activity: 0.06, deletes: 0.5, edits: 0 },
];

const RENAME_EVERY = 36 * HOUR;
const SPIKE_EVERY = 30 * HOUR;

function profileAt(a: DemoAccount, at: number): SourceProfile {
  const t = at - ORIGIN;
  let handle = a.handle;
  let displayName = a.displayName;
  if (a.renames) {
    const epoch = Math.floor(t / RENAME_EVERY);
    if (epoch % 2 === 1) {
      handle = `${a.handle.slice(0, 11)}_v${(epoch % 7) + 2}`;
      displayName = `${a.displayName} (new acc)`;
    }
  }
  let followers = a.followers * (1 + 0.01 * Math.sin(t / (5 * HOUR) + a.followers));
  if (a.spikes) {
    const phase = (t % SPIKE_EVERY) / SPIKE_EVERY;
    if (phase < 0.5) followers *= 1.38;
  }
  return {
    userId: a.userId,
    handle,
    displayName,
    bio: a.bio,
    followers: Math.round(followers),
    avatarUrl: null,
    isPublic: true,
  };
}

// ── coins ─────────────────────────────────────────────────────────────────────────────────────────────

type Trajectory = "moon" | "rug" | "pumpdump" | "steady" | "bleed";
const TRAJECTORIES: Trajectory[] = ["moon", "rug", "pumpdump", "steady", "bleed", "rug", "pumpdump", "bleed"];
const SYLLABLES = ["BON", "WIF", "PEP", "FRO", "GOB", "MEW", "POP", "ZOR", "KEK", "DOG", "MOO", "GIGA", "CHAD", "PIX", "NUB", "SNEK", "BLOB", "TUR", "YAP", "LOOM"];
const SUFFIXES = ["", "GO", "CAT", "INU", "AI", "HAT", "PAD", "X", "IO", "OOR"];
const MASK = 0x5a3c9e17;
const MAGIC = [0x52, 0x43]; // "RC" — marks an address as a mock coin

export interface MockCoin {
  index: number;
  ca: string;
  ticker: string;
  launchAt: number;
  mcap0: number;
  trajectory: Trajectory;
}

export function coinByIndex(index: number): MockCoin {
  const r = rng(mix(index, 777));
  const bytes = new Uint8Array(32);
  const masked = (index ^ MASK) >>> 0;
  // Random leading bytes (so addresses look varied), then a marker and the coin index at the end.
  for (let i = 0; i < 26; i++) bytes[i] = Math.floor(r() * 256);
  bytes[0] |= 0x40; // avoid leading zero bytes ("111…" prefixes)
  bytes[26] = MAGIC[0];
  bytes[27] = MAGIC[1];
  bytes[28] = (masked >>> 24) & 0xff;
  bytes[29] = (masked >>> 16) & 0xff;
  bytes[30] = (masked >>> 8) & 0xff;
  bytes[31] = masked & 0xff;
  const ticker = (pick(r, SYLLABLES) + pick(r, SUFFIXES)).slice(0, 10);
  return {
    index,
    ca: base58Encode(bytes),
    ticker,
    launchAt: ORIGIN + index * COIN_EVERY,
    mcap0: Math.round(50_000 + r() * 350_000),
    trajectory: pick(r, TRAJECTORIES),
  };
}

export function coinByAddress(ca: string): MockCoin | null {
  let bytes: Uint8Array;
  try {
    bytes = base58Decode(ca);
  } catch {
    return null;
  }
  if (bytes.length !== 32 || bytes[26] !== MAGIC[0] || bytes[27] !== MAGIC[1]) return null;
  const masked = ((bytes[28] << 24) | (bytes[29] << 16) | (bytes[30] << 8) | bytes[31]) >>> 0;
  const coin = coinByIndex((masked ^ MASK) >>> 0);
  return coin.ca === ca ? coin : null;
}

export function mockMarketCap(coin: MockCoin, at: number): number | null {
  const h = (at - coin.launchAt) / HOUR;
  if (h < 0) return null;
  const m = coin.mcap0;
  let v: number;
  switch (coin.trajectory) {
    case "moon":
      v = m * (1 + 9 * (1 - Math.exp(-h / 18)));
      break;
    case "rug":
      v = h < 3 ? m * (1 + h * 0.5) : m * 0.03;
      break;
    case "pumpdump":
      v = h < 1 ? m * (1 + 2 * h) : m * Math.max(0.15, 3 * Math.exp(-(h - 1) / 5));
      break;
    case "steady":
      v = m * (1 + (0.3 * Math.min(h, 48)) / 48);
      break;
    case "bleed":
      v = m * Math.max(0.35, 1 - (0.65 * Math.min(h, 24)) / 24);
      break;
  }
  const noise = 1 + 0.03 * Math.sin(h * 3 + coin.index);
  return Math.round(v * noise);
}

// ── tweets ────────────────────────────────────────────────────────────────────────────────────────────

interface MockTweet extends SourceTweet {
  deleteAt: number | null;
  editAt: number | null;
  editedText: string | null;
}

const CALL_TEMPLATES = [
  "{CA}\n\n${T} chart is clean. loaded",
  "aping ${T} here. this one sends\n{CA}",
  "${T} is the play today. early\n\n{CA}",
  "my bags: ${T}\n{CA}\nnfa",
  "${T} {CA} dev is cooking, 10x from here",
  "bought more ${T}. conviction\n{CA}",
];
const BEARISH_TEMPLATES = [
  "stay away from ${T}. dev wallet is moving",
  "careful with ${T}, top holders look bundled",
  "sold all my ${T}. not touching it again",
];
const CHATTER = [
  "gm trenches",
  "volume is back. stay sharp",
  "who's still up",
  "timeline is quiet today",
  "solana szn is not over",
  "new ATH in screen time",
  "remember to take profits",
];

const COORD_CYCLE = 48; // buckets (8h)
const COORD_SIZE = 6;

function fill(t: string, coin: MockCoin): string {
  return t.replaceAll("${T}", `$${coin.ticker}`).replaceAll("{CA}", coin.ca);
}

function recentCoins(at: number): MockCoin[] {
  const newest = Math.floor((at - ORIGIN) / COIN_EVERY);
  const out: MockCoin[] = [];
  for (let i = Math.max(0, newest - 3); i <= newest; i++) out.push(coinByIndex(i));
  return out;
}

function bucketTweets(b: number): MockTweet[] {
  const start = ORIGIN + b * BUCKET;
  const r = rng(mix(b, 1337));
  const tweets: MockTweet[] = [];

  // Coordinated push: once per cycle, a rotating crew calls the newest coin within 20 minutes.
  const cycle = Math.floor(b / COORD_CYCLE);
  const pos = b % COORD_CYCLE;
  const crew = new Set<number>();
  if (pos === 7 || pos === 8) {
    const cr = rng(mix(cycle, 4242));
    while (crew.size < COORD_SIZE) crew.add(Math.floor(cr() * DEMO_ACCOUNTS.length));
  }
  const crewHalf = [...crew].sort((x, y) => x - y).filter((_, i) => (pos === 7 ? i < 3 : i >= 3));
  const crewCoin = coinByIndex(Math.floor((ORIGIN + cycle * COORD_CYCLE * BUCKET - ORIGIN) / COIN_EVERY));

  DEMO_ACCOUNTS.forEach((a, k) => {
    const postedAt = start + Math.floor(r() * 9 * MIN) + k * 1000;
    const roll = r();
    const typeRoll = r();
    const extra = r();
    const extra2 = r();
    const id = String(b * 100 + k);

    if (crewHalf.includes(k)) {
      tweets.push({ id, authorId: a.userId, text: fill(pick(rng(mix(b, k)), CALL_TEMPLATES), crewCoin), postedAt: new Date(postedAt), deleteAt: null, editAt: null, editedText: null });
      return;
    }
    if (roll > a.activity) return;

    let text: string;
    let deleteAt: number | null = null;
    let editAt: number | null = null;
    let editedText: string | null = null;
    const coins = recentCoins(postedAt).filter((c) => c.launchAt <= postedAt);

    if (typeRoll < 0.55 && coins.length) {
      const coin = coins[Math.floor(extra * coins.length)];
      text = fill(CALL_TEMPLATES[Math.floor(extra2 * CALL_TEMPLATES.length)], coin);
      const goesBad = coin.trajectory === "rug" || coin.trajectory === "pumpdump" || coin.trajectory === "bleed";
      if (goesBad && extra2 < a.deletes) deleteAt = postedAt + (2 + Math.floor(extra * 4)) * HOUR;
      else if (extra < a.edits) {
        editAt = postedAt + (15 + Math.floor(extra2 * 25)) * MIN;
        editedText = `${text}\n\nedit: not financial advice, dyor`;
      }
    } else if (typeRoll < 0.7 && coins.length) {
      const coin = coins[Math.floor(extra * coins.length)];
      text = fill(BEARISH_TEMPLATES[Math.floor(extra2 * BEARISH_TEMPLATES.length)], coin);
    } else {
      text = CHATTER[Math.floor(extra * CHATTER.length)];
    }
    tweets.push({ id, authorId: a.userId, text, postedAt: new Date(postedAt), deleteAt, editAt, editedText });
  });
  return tweets;
}

function tweetById(id: string): MockTweet | null {
  const n = Number(id);
  if (!Number.isInteger(n) || n < 0) return null;
  const b = Math.floor(n / 100);
  return bucketTweets(b).find((t) => t.id === id) ?? null;
}

function textAt(t: MockTweet, at: number): string {
  return t.editAt !== null && at >= t.editAt && t.editedText ? t.editedText : t.text;
}

// ── sources ───────────────────────────────────────────────────────────────────────────────────────────

export class MockTwitterSource implements TwitterSource {
  readonly name = "mock";
  constructor(private readonly clock: Clock) {}

  private account(userId: string) {
    return DEMO_ACCOUNTS.find((a) => a.userId === userId) ?? null;
  }

  async lookupUser(handle: string): Promise<SourceProfile | null> {
    const now = this.clock.now().getTime();
    const h = handle.replace(/^@/, "").toLowerCase();
    for (const a of DEMO_ACCOUNTS) {
      const p = profileAt(a, now);
      if (p.handle.toLowerCase() === h || a.handle.toLowerCase() === h) return p;
    }
    return null;
  }

  async fetchProfile(userId: string): Promise<SourceProfile | null> {
    const a = this.account(userId);
    return a ? profileAt(a, this.clock.now().getTime()) : null;
  }

  async fetchUserTweets(userId: string, sinceId: string | null): Promise<SourceTweet[]> {
    const now = this.clock.now().getTime();
    const k = DEMO_ACCOUNTS.findIndex((a) => a.userId === userId);
    if (k < 0) return [];
    const earliest = now - 24 * HOUR;
    let fromBucket = Math.floor((earliest - ORIGIN) / BUCKET);
    if (sinceId) fromBucket = Math.max(fromBucket, Math.floor(Number(sinceId) / 100));
    const toBucket = Math.floor((now - ORIGIN) / BUCKET);
    const out: SourceTweet[] = [];
    for (let b = fromBucket; b <= toBucket; b++) {
      const t = bucketTweets(b).find((x) => x.authorId === userId);
      if (!t) continue;
      if (sinceId && Number(t.id) <= Number(sinceId)) continue;
      if (t.postedAt.getTime() > now || t.postedAt.getTime() < earliest) continue;
      if (t.deleteAt !== null && now >= t.deleteAt) continue;
      out.push({ id: t.id, authorId: t.authorId, text: textAt(t, now), postedAt: t.postedAt });
    }
    return out;
  }

  async fetchTweets(ids: string[]): Promise<Map<string, TweetLookup>> {
    const now = this.clock.now().getTime();
    const out = new Map<string, TweetLookup>();
    for (const id of ids) {
      const t = tweetById(id);
      if (!t || t.postedAt.getTime() > now) out.set(id, { kind: "missing" });
      else if (t.deleteAt !== null && now >= t.deleteAt) out.set(id, { kind: "missing" });
      else out.set(id, { kind: "found", text: textAt(t, now) });
    }
    return out;
  }
}

export class MockPrices implements PriceSource {
  readonly name = "mock";
  constructor(private readonly clock: Clock) {}
  async getMarketCap(ca: string): Promise<number | null> {
    const coin = coinByAddress(ca);
    return coin ? mockMarketCap(coin, this.clock.now().getTime()) : null;
  }
}
