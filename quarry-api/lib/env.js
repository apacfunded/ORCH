// Runtime config, all from Vercel environment variables (and one Blob-stored value: the lookup table).
const { Connection } = require("@solana/web3.js");
const store = require("./store");

const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
let conn = null;
const connection = () => (conn ??= new Connection(RPC, { commitment: "confirmed" }));

async function launchConfig() {
  const settings = (await store.getJson("config/settings.json")) || {};
  return {
    creatorBps: Number(process.env.CREATOR_BPS || 7000),
    buybackBps: Number(process.env.BUYBACK_BPS || 2000),
    holderBps: Number(process.env.HOLDER_BPS || 1000),
    buybackWallet: process.env.BUYBACK_WALLET || settings.buybackWallet || null,
    holderWallet: process.env.HOLDER_WALLET || settings.holderWallet || null,
    lut: process.env.QUARRY_LUT || settings.lut || null,
    adminWallet: process.env.ADMIN_WALLET || null,
    priorityMicroLamports: Number(process.env.PRIORITY_MICROLAMPORTS || 400_000),
    maxDevBuySol: Number(process.env.MAX_DEV_BUY_SOL || 50),
  };
}

function assertReady(cfg) {
  if (cfg.creatorBps + cfg.buybackBps + cfg.holderBps !== 10_000) throw httpError(500, "Fee shares must add up to 10000 bps.");
  if (!cfg.buybackWallet || !cfg.holderWallet) throw httpError(503, "Launching opens soon: the fee wallets are not set yet.");
}

function httpError(status, message, code) { const e = new Error(message); e.status = status; if (code) e.code = code; return e; }

module.exports = { connection, launchConfig, assertReady, httpError, RPC };
