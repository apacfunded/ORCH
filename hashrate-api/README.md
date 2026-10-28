# Hashrate API (Vercel)

Serverless backend for orch.lol/hashrate. State lives in Vercel Blob as immutable JSON files; every wallet is derived from `MASTER_SEED`, so no secret is ever stored.

Routes: `GET /api/coins`, `GET /api/log`, `POST /api/launch`, `GET /api/launch/:id`, `GET /api/tick` (worker; public, 60s lock; `?secret=CRON_SECRET` forces), `GET /api/link-message`, `POST /api/link`, `GET /api/links/:wallet`.

Env: `BLOB_READ_WRITE_TOKEN`, `MASTER_SEED` (never change after first launch), `SOLANA_RPC_URL`, `PINATA_JWT`, `FEE_FORWARD_ADDRESS`, `LIVE` (`true` to really launch/claim), `CRON_SECRET`, `ALLOW_ORIGIN`.
