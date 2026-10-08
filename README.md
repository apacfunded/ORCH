# Receipts ($RECEIPTS)

**The AI that keeps receipts on crypto Twitter.** Deleted tweets don't disappear. They get receipts.

Receipts watches a list of public CT callers and prints a receipt whenever something worth remembering happens:

| Tracker | What it catches |
| --- | --- |
| **Caller scorecards** | Every coin a caller posts with a contract address, priced at call time and re-checked at 1h, 24h and 7d. Hit rate, average return, best/worst call, rugs. |
| **Deleted tweets & edits** | Every tweet is snapshotted on ingest. A tweet is marked deleted only after 2+ not-found checks at least 5 minutes apart. Edits are diffed and kept. |
| **Coordinated shills** | 5+ watched accounts posting the same CA inside 30 minutes. |
| **Account changes** | Handle renames, display-name and bio edits, follower swings of 20%+. |

Holders of $RECEIPTS see the feed live; everyone else sees it 15 minutes later.

---

## Quick start (no keys needed)

```bash
npm install
npm run dev
```

Open http://localhost:3000. On first boot the app creates an embedded Postgres (PGlite) in `./.data`. It replays **48 hours of a simulated CT world**: 12 invented callers, a new coin every 2 hours, moons, rugs, deletions, edits, coordinated pushes and renames. The feed, scorecards and leaderboard open full, and new receipts keep printing live. Everything simulated is labelled "Example data until launch".

To reset the demo, stop the server and delete `./.data`.

## Going live

1. **Postgres.** Create a database (Supabase, Neon, Railway…) and set `DATABASE_URL`. Tables are created automatically on boot (`npm run migrate` runs them by hand).
2. **X API.** Set `X_BEARER_TOKEN` (developer.x.com, app-only bearer token). This switches `DATA_SOURCE` to `x` and prices to DexScreener. Check X's current API pricing and read limits before you size the watchlist. Reads are metered and are the main running cost.
3. **Watchlist.** Set `ADMIN_WALLETS` to your wallet, sign in, open `/admin` and add public accounts by handle. Start with ~50 and set check intervals per account (hot callers every 2–5 min, others 15–30).
4. **Session secret.** `SESSION_SECRET=$(openssl rand -base64 48)`. Required in production.
5. **RPC.** Set `SOLANA_RPC_URL` to a paid RPC (Helius, Triton, QuickNode). The public endpoint is rate limited.
6. **AI extraction (optional).** Set `ANTHROPIC_API_KEY` for better ticker/intent reading. Contract addresses always come from regex, so the model can't invent one.
7. **Launch.** After deploying $RECEIPTS on pump.fun, set `RECEIPTS_MINT`, `MIN_HOLD`, `WHALE_HOLD` and `PUMP_URL`. Live access turns on for holders immediately. Before that, everyone (except admins) gets the delayed feed.

Every variable is documented in [`.env.example`](.env.example).

### Pre-launch tip

Start the watcher a few days **before** the coin goes live. Launch day then opens with a feed full of real catches and a populated leaderboard.

## Deploying

The app needs the web app, Postgres, and something that runs the worker on a schedule.

### Vercel (recommended: no servers to manage)

1. **Import** the GitHub repo in Vercel (framework: Next.js, defaults are fine).
2. **Database:** in the project, open **Storage → Create → Neon (Postgres)** and connect it. That sets `DATABASE_URL` / `POSTGRES_URL` for you. Tables are created on first request.
3. **Environment variables:** set `SESSION_SECRET`, `CRON_SECRET`, `SITE_URL` (your production URL) and `ADMIN_WALLETS`, then redeploy.
4. **Worker schedule:** in the GitHub repo, add the Actions secrets `SITE_URL` and `CRON_SECRET` (same value as on Vercel). `.github/workflows/worker.yml` then calls `/api/cron/worker` every 5 minutes. Run it once by hand from the Actions tab to start right away.

Each tick does up to ~45 seconds of work and then stops, so it fits Vercel's function limits. On an empty database in demo mode, the first several ticks replay 36 hours of the simulated world. The site fills in over ~30 minutes, then switches to live cycles. A lock row stops overlapping ticks from double-processing.

On a Vercel Pro plan you can use Vercel Cron instead: add `{"crons":[{"path":"/api/cron/worker","schedule":"*/5 * * * *"}]}` to `vercel.json`. Vercel sends the `CRON_SECRET` header automatically. Don't add a sub-daily cron on the Hobby plan, because the deploy will fail.

GitHub pauses scheduled workflows in repos with no activity for 60 days; any push re-enables them.

### One always-on server (Railway, Render, Fly, a VPS)

Run `npm run build && npm start` with `DATABASE_URL` and `RUN_WORKER_INLINE=1`, and the worker runs inside the web process. Or run `npm run worker` as a second process against the same database.

## How it works

```
X API ──► worker ──► Postgres ◄── Next.js app ──► browser
DexScreener ─┘   (5 jobs)          (gates live vs delayed per request)
```

The worker runs five jobs on a 30-second tick. A job that fails is logged and retried next tick; a rate-limited job pauses until the provider's reset time.

1. **ingest**: new tweets for each account whose check interval is due. Extract calls and price fresh ones.
2. **recheck**: batch-look-up recent tweets (100 per request). Run the deletion state machine, diff for edits, and guard against account-wide outages.
3. **profiles**: hourly profile diffs (renames, bio, followers).
4. **score**: fill 1h/24h/7d market caps as they come due.
5. **coordination**: rolling-window detection of coordinated pushes.

Every receipt (`alerts` table) stores a frozen snapshot, so it renders the same forever, even after a rename or deletion.

**Access:** the browser connects a wallet through the Wallet Standard (Phantom, Solflare, Backpack…) and signs a one-time message (no transaction). The server verifies the Ed25519 signature with Node's crypto, burns the nonce, reads the $RECEIPTS balance over RPC and sets an httpOnly session cookie. Balances are re-read every 5 minutes. Feed filtering, receipt pages and receipt images are all gated server-side.

## Project layout

```
src/
  app/                 Next.js pages + API routes
    api/feed           gated feed (live vs delayed)
    api/auth/*         nonce → signature verify → session
    api/receipt/[id]   PNG receipt cards
    api/cron/worker    one worker tick (scheduled; CRON_SECRET)
    receipt/[id]       receipt page + link preview image
    caller/[handle]    per-caller scorecard
    leaderboard, about, admin
  components/          ReceiptCard, FeedClient, WalletButton
  lib/                 pure logic: extraction, trackers, gate, auth, formatting
  sources/             TwitterSource / PriceSource adapters: X API, DexScreener, mock world
  worker/              jobs, runner, seed, serverless tick, inline worker
  db/                  tiny SQL interface (Postgres or PGlite) + migrations
tests/                 unit tests (node:test) + Postgres integration scripts
```

## Tests

```bash
npm test          # 30 unit tests: extraction, all four trackers, gate, signatures, sessions, mock world
```

`tests/integration/simulate.mts` replays the mock world through the real worker jobs against a real Postgres. Point it at any database with `PG_HOST`, `PG_PORT` and `PG_DB`. `tests/integration/queries.mts` then runs the page queries against the result, and `tests/integration/tick.mts` checks the serverless tick (resumable seeding and the overlap lock).

## Ground rules baked in

- Public accounts only. Protected or suspended accounts are skipped, and anyone can request removal at `/about#removal`.
- Receipts state facts: what was posted, when it changed or disappeared, what the price did. Copy never accuses.
- Calls seen more than 30 minutes late are stored but not scored, so a late price can't fake a result.

## Next up (not in v1)

- Holder voting on which accounts get added
- Whale-tier Telegram/Discord alert bot
- Auto-posting receipt cards from the @receipts X account
- Personal watchlists, a public API
- Tracking pump.fun theses as callouts alongside tweets
