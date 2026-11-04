# Paired API (Vercel project `paired-api`)

Backend for orch.lol/paired, adapted from hashrate-api. State lives in Vercel Blob; every wallet is derived from `MASTER_SEED`, so no secret is stored.

Flow: `POST /api/launch` (name, ticker, image, pairType, pairWith) → launcher sends `needSol` to the launch wallet → `GET /api/tick` creates the coin on pump.fun from that wallet → the same tick claims creator fees for every coin and forwards them to `FEE_FORWARD_ADDRESS`.

Routes: `GET /api/coins`, `GET /api/log`, `POST /api/launch`, `GET /api/launch/:id`, `GET /api/tick` (public, rate-limited; `?secret=CRON_SECRET` forces), `GET /api/health`.

Env: `BLOB_READ_WRITE_TOKEN`, `MASTER_SEED` (never change after the first launch), `FEE_FORWARD_ADDRESS`, `LIVE` (`true` to really launch/claim), `SOLANA_RPC_URL`, `CRON_SECRET`, `ALLOW_ORIGIN`.
