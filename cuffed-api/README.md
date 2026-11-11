# Cuffed API (Vercel project `cuffed-api`)

Backend for orch.lol/cuffed. Every transaction is signed by the creator's own wallet; the server holds no keys.

Flow:
1. `POST /api/metadata`: image + metadata to Vercel Blob.
2. `POST /api/create-tx`: PumpPortal builds the pump.fun create + dev buy. Browser signs (wallet + mint keypair), `POST /api/send`.
3. `POST /api/cuff-tx`: builds two txs the creator approves together:
   - fee split: pump.fun fee sharing, creator 80% / Cuffed treasury 20%, locked forever (`update_fee_shares_v2`)
   - lock: 0.05 SOL launch fee to the treasury + non-cancelable Streamflow lock of the whole dev bag
     (`cliff` = all unlocks at the end, `linear` = equal slice per day)
4. `POST /api/register`: verifies launch, lock, fee and split on-chain, then lists the coin.
`GET /api/coins` lists coins. `GET /api/health?probe=1&mint=<pump coin>` builds (never sends) every tx.

Env: `BLOB_READ_WRITE_TOKEN` (auto), optional `SOLANA_RPC_URL`, `CUFFED_TREASURY`, `CUFFED_FEE_BPS` (default 2000),
`CUFFED_LAUNCH_FEE_SOL` (default 0.05), `PRIORITY_FEE_SOL`, `PRIORITY_MICROLAMPORTS`.
