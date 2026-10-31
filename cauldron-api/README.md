# Cauldron API (Vercel project `cauldron-api`)

Backend for orch.lol/cauldron. Launches are signed by the creator's own wallet, so the server holds no keys.

Flow: `POST /api/metadata` (image + metadata to Vercel Blob, or Pinata if `PINATA_JWT` is set)
→ `POST /api/create-tx` (PumpPortal builds the pump.fun create tx)
→ browser: wallet signs, mint keypair co-signs
→ `POST /api/send` (relays only pump.fun txs to Solana)
→ `POST /api/register` (verifies the tx on-chain, records the coin).
`GET /api/coins` lists coins. `GET /api/health?probe=1` checks Blob, RPC and PumpPortal.

Env: `BLOB_READ_WRITE_TOKEN` (auto), `ALLOW_ORIGIN`, optional `SOLANA_RPC_URL`, `PINATA_JWT`, `PRIORITY_FEE_SOL`.
