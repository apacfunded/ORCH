# Tally — prediction markets on Pump.fun coins

Live version 1: **real wallets, live prices, real settlement, play SOL.**
People connect Phantom / Solflare / Backpack, get 10 free play SOL, and bet on
real coins. Rounds open on the clock, settle on DexScreener prices, and pay out
automatically. No real money moves yet (that's version 2, see the bottom).

No npm packages needed. Node 18+.

## What's inside

```
public/        the site (index.html, styles.css, app.js, logo)
api/           serverless endpoints (Vercel picks these up automatically)
  state.js     GET  everything the page shows (markets, prices, results, leaderboard)
  login.js     GET  message to sign · POST signature -> session token
  me.js        GET  your balance and bets
  bet.js       POST place a bet
  refill.js    POST claim 10 play SOL when you're under 1 (once a day)
  cron.js      GET  run the engine (protected by CRON_SECRET)
lib/
  config.js    coins, timeframes, fees, limits  <- edit this to list other coins
  engine.js    opens rounds, records prices, settles, pays out
  prices.js    DexScreener price feed (+ mock prices for testing)
  store.js     Upstash Redis (or in-memory for local dev)
  auth.js      wallet sign-in (ed25519 signature check) and session tokens
scripts/
  dev-server.js   run it locally
  engine-test.js  simulated rounds, bets, payouts, voids, double-pay check
```

## Run it locally

```bash
npm run dev:mock   # fake prices, works offline -> http://localhost:3000
npm run dev        # live DexScreener prices
npm test           # engine test (rounds, payouts, refunds, signatures)
```
Without Upstash settings it uses memory, so data resets when you restart.

## Put it online (Vercel, about 10 minutes)

1. **Database.** Create a free Redis database at upstash.com (or in Vercel:
   Storage → Marketplace → Upstash). Copy the **REST URL** and **REST token**.
2. **Deploy.** Push this folder to a GitHub repo and import it in Vercel
   (Framework preset: *Other*, no build command), or run `npx vercel` in the folder.
3. **Environment variables** (Vercel → Project → Settings → Environment Variables):
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
   - `SESSION_SECRET`: long random string (`openssl rand -hex 32`)
   - `CRON_SECRET`: another long random string
   Redeploy after adding them.
4. **Keep the clock running.** Rounds open and settle when the engine runs. It
   runs whenever someone has the site open, but you also need a ping every
   minute so nothing is missed overnight. Free option: create a job at
   cron-job.org that calls
   `https://YOUR-SITE/api/cron?key=YOUR_CRON_SECRET` every 1 minute.
   (Vercel's own cron only runs once a day on the free plan; every minute needs Pro.)
5. Point your domain at it in Vercel → Domains.

## How the markets work

- **Up / Down rounds** at 5m, 15m, 1h, 4h, 1d, back to back on the UTC clock.
  Price to beat = market cap recorded at the round's start.
- **Price ladder**: 5 strikes per coin per day (80%–150% of the day's open),
  settles at 00:00 UTC.
- **Head to head**: which of two coins gains more % by the daily close.
- Betting locks 1 min before close (or 5% of the round: 3 min for 1h, 12 min
  for 4h, 72 min for daily).
- Payout: stake back + your share of the losing side, minus 3% of winnings.
  One-sided rounds and missing price data refund in full.
- Risk gates: a coin needs $1M+ daily volume for any market and $5M+ for
  5m/15m rounds. Edit in `lib/config.js`.
- When the server first starts mid-round, it skips rounds that are more than
  25% done and opens the next ones on the clock, so the first 5-minute rounds
  can take a few minutes to appear.

## Version 2: real SOL (not built yet)

To take real bets you'd replace the play balance with an on-chain pool
program (Anchor) that holds each market's YES/NO pools, settles from a
signed price report, and lets winners claim. That needs an audit before it
holds anyone's money. Real-money betting is also regulated in many places
(gambling / event-contract rules), so get legal advice and block restricted
regions first.
