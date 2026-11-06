# A Movie Pad API
Vercel project `amoviepad` (amoviepad-aislopv1-8230.vercel.app), Blob store `amoviepad-store`.
- `POST /api/metadata` hosts the coin image + metadata (pump.fun's IPFS blocks server uploads).
- `POST /api/create-tx` builds the pump.fun create tx with PumpPortal; the browser signs it.
- `POST /api/send` relays the signed launch. `POST /api/register` verifies it on-chain and records the movie coin.
- `GET /api/tick` reads each coin's new trades and adds up its creator fees from pump.fun TradeEvents.
  Every 0.1 SOL of creator fees logs "Clip N generated" (capped at runtime x 60 / 8 shots).
  Run every 5 min by `.github/workflows/amoviepad-tick.yml`. Bonding-curve trades only (not PumpSwap after graduation).
- `GET /api/coins` returns every movie coin with its clip progress and the latest clip events.
