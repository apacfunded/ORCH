/**
 * All runtime configuration, read once from the environment.
 * Every variable is documented in .env.example.
 */

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v.trim() === "" ? fallback : v.trim();
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Env ${name} must be a number, got "${raw}"`);
  return n;
}

function list(name: string): string[] {
  return str(name)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type DataSourceName = "mock" | "x";
export type PriceSourceName = "mock" | "dexscreener";

export function loadConfig() {
  const xToken = str("X_BEARER_TOKEN");
  const dataSource = (str("DATA_SOURCE", xToken ? "x" : "mock") as DataSourceName);
  if (dataSource !== "mock" && dataSource !== "x") throw new Error(`DATA_SOURCE must be "mock" or "x"`);
  if (dataSource === "x" && !xToken) throw new Error("DATA_SOURCE=x needs X_BEARER_TOKEN");

  const priceSource = (str("PRICE_SOURCE", dataSource === "mock" ? "mock" : "dexscreener") as PriceSourceName);

  // Vercel's Postgres integrations (Neon) set one of these.
  const databaseUrl = str("DATABASE_URL", str("POSTGRES_URL"));
  const onVercel = process.env.VERCEL === "1";

  return {
    databaseUrl,
    onVercel,
    pgliteDir: str("PGLITE_DIR", "./.data/pglite"),
    // Without a real Postgres, the web app and worker must share one process (PGlite is single-process).
    // Serverless hosts never run it inline: the scheduled /api/cron/worker endpoint does the work.
    runWorkerInline: str("RUN_WORKER_INLINE", databaseUrl || onVercel ? "0" : "1") === "1",
    cronSecret: str("CRON_SECRET"),

    dataSource,
    xBearerToken: xToken,
    priceSource,

    anthropicApiKey: str("ANTHROPIC_API_KEY"),
    aiModel: str("AI_MODEL", "claude-haiku-5-5"),

    solanaRpcUrl: str("SOLANA_RPC_URL", "https://api.mainnet-beta.solana.com"),
    mint: str("RECEIPTS_MINT"),
    minHold: num("MIN_HOLD", 1),
    whaleHold: num("WHALE_HOLD", 10_000_000),
    balanceRecheckSec: num("BALANCE_RECHECK_SECONDS", 300),

    publicDelayMinutes: num("PUBLIC_DELAY_MINUTES", 15),
    sessionSecret: str("SESSION_SECRET"),
    adminWallets: list("ADMIN_WALLETS"),
    siteUrl: str("SITE_URL", "http://localhost:3000").replace(/\/$/, ""),
    pumpUrl: str("PUMP_URL"),
    xHandle: str("X_HANDLE", "receipts"),
    partnerHandle: str("PARTNER_HANDLE", "OTCDOTCASH"),

    worker: {
      tickSeconds: num("WORKER_TICK_SECONDS", 30),
      defaultPollMinutes: num("POLL_MINUTES", 5),
      profileEveryMinutes: num("PROFILE_EVERY_MINUTES", 60),
      recheckHours: num("RECHECK_HOURS", 48),
      recheckEveryMinutes: num("RECHECK_EVERY_MINUTES", 10),
    },

    thresholds: {
      coordMinAccounts: num("COORD_MIN_ACCOUNTS", 5),
      coordWindowMinutes: num("COORD_WINDOW_MINUTES", 30),
      followerSpikePct: num("FOLLOWER_SPIKE_PCT", 20),
      deleteConfirmFails: num("DELETE_CONFIRM_FAILS", 2),
      deleteConfirmGapMinutes: num("DELETE_CONFIRM_GAP_MINUTES", 5),
    },
  };
}

export type Config = ReturnType<typeof loadConfig>;
export type Thresholds = Config["thresholds"];

let cached: Config | null = null;
export function config(): Config {
  if (!cached) cached = loadConfig();
  return cached;
}

/** Session secret, with a loud failure in production when it is missing. */
export function sessionSecret(): string {
  const c = config();
  if (c.sessionSecret) return c.sessionSecret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }
  return "dev-only-insecure-secret-change-me";
}
