// POST /api/build  { creator, mint, metaId, devBuySol }
// Returns the unsigned launch transaction (base64). The browser signs it with the wallet AND the fresh
// mint keypair, then posts it to /api/submit.
const { PublicKey } = require("@solana/web3.js");
const { route, body } = require("../lib/http");
const store = require("../lib/store");
const { connection, launchConfig, assertReady, httpError } = require("../lib/env");
const { buildLaunchTx } = require("../lib/launch");

const SITE = process.env.SITE_URL || "https://quary.lol";
const pk = (v, what) => { try { return new PublicKey(String(v)); } catch { throw httpError(400, `Bad ${what} address.`); } };

module.exports = route(["POST"], async (req) => {
  const b = await body(req);
  const cfg = await launchConfig();
  assertReady(cfg);
  const creator = pk(b.creator, "wallet");
  const mint = pk(b.mint, "mint");
  const metaId = String(b.metaId || "");
  const meta = /^[1-9A-HJ-NP-Za-km-z]{6,20}$/.test(metaId) ? await store.getJson(`meta/${metaId}.json`) : null;
  if (!meta) throw httpError(400, "Upload the coin details first.");
  const devBuySol = Math.max(0, Number(b.devBuySol) || 0);
  if (devBuySol > cfg.maxDevBuySol) throw httpError(400, `Dev buy is capped at ${cfg.maxDevBuySol} SOL.`);

  const conn = connection();
  if (await conn.getAccountInfo(mint)) throw httpError(409, "That mint address is already used. Try again.");
  if (devBuySol > 0) {
    const bal = await conn.getBalance(creator);
    if (bal < (devBuySol + 0.03) * 1e9) throw httpError(400, `Not enough SOL: you need about ${(devBuySol + 0.03).toFixed(3)} SOL (dev buy + ~0.03 for rent and fees).`);
  }

  const { tx, blockhash, lastValidBlockHeight, size } = await buildLaunchTx(conn, {
    creator, mint, name: meta.name, symbol: meta.symbol, uri: `${SITE}/m/${metaId}`, devBuySol, cfg, priorityMicroLamports: cfg.priorityMicroLamports,
  });

  await store.putJson(`pending/${mint.toBase58()}.json`, {
    mint: mint.toBase58(), creator: creator.toBase58(), metaId, board: meta.quarry?.board, name: meta.name, symbol: meta.symbol,
    image: meta.image, description: meta.description, twitter: meta.twitter || null, telegram: meta.telegram || null, website: meta.website || null,
    devBuySol, createdAt: Date.now(),
  }, { cache: 0 });

  return { tx: Buffer.from(tx.serialize()).toString("base64"), blockhash, lastValidBlockHeight, size, split: { creatorBps: cfg.creatorBps, buybackBps: cfg.buybackBps, holderBps: cfg.holderBps, buybackWallet: cfg.buybackWallet, holderWallet: cfg.holderWallet } };
});
