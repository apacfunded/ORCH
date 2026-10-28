// GET /api/balance?address=...  -> { sol }   (the public RPC refuses most browser requests)
const { PublicKey } = require("@solana/web3.js");
const { route } = require("../lib/http");
const { connection, httpError } = require("../lib/env");

module.exports = route(["GET"], async (req) => {
  let pk;
  try { pk = new PublicKey(String(req.query.address || "")); } catch { throw httpError(400, "Bad address."); }
  return { sol: (await connection().getBalance(pk)) / 1e9 };
});
