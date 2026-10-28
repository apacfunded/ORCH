// POST /api/submit  { tx: base64 signed launch transaction }
// Sends it, waits for confirmation, verifies the locked fee split on-chain, then lists the coin.
// POST /api/submit  { mint }  (no tx) retries the verification for a launch that already landed.
const { VersionedTransaction, PublicKey } = require("@solana/web3.js");
const { route, body } = require("../lib/http");
const store = require("../lib/store");
const { connection, launchConfig, httpError } = require("../lib/env");
const { finalize } = require("../lib/registry");

const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendAndConfirm(conn, raw, blockhash, lastValidBlockHeight) {
  const sig = await conn.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 0, preflightCommitment: "confirmed" });
  const started = Date.now();
  while (Date.now() - started < 55_000) {
    const st = (await conn.getSignatureStatuses([sig])).value[0];
    if (st?.err) throw httpError(400, `Launch failed on-chain: ${JSON.stringify(st.err)}`);
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
    const h = await conn.getBlockHeight("confirmed");
    if (h > lastValidBlockHeight) throw httpError(408, "The launch expired before it landed. Nothing was spent. Try again.", "EXPIRED");
    await conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => {});
    await sleep(2000);
  }
  const e = httpError(202, "Still confirming. Check back in a minute.", "PENDING"); e.signature = sig; throw e;
}

module.exports = route(["POST"], async (req, res) => {
  const b = await body(req);
  const conn = connection();
  const cfg = await launchConfig();

  if (!b.tx && b.mint) {
    const coin = await finalize(conn, cfg, new PublicKey(String(b.mint)).toBase58(), b.signature);
    return { ok: true, coin };
  }

  let tx;
  try { tx = VersionedTransaction.deserialize(Buffer.from(String(b.tx || ""), "base64")); } catch { throw httpError(400, "Bad transaction."); }
  const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
  const nSig = tx.message.header.numRequiredSignatures;
  const signers = keys.slice(0, nSig);
  // The mint is the second signer (fee payer = creator first). Make sure this is a launch we built.
  const mint = signers.find((k) => k !== signers[0]);
  const pending = mint ? await store.getJson(`pending/${mint}.json`) : null;
  if (!pending || pending.creator !== signers[0]) throw httpError(400, "Unknown launch. Start again from the launch page.");
  if (!tx.message.compiledInstructions.some((ix) => keys[ix.programIdIndex] === PUMP)) throw httpError(400, "Not a pump.fun launch.");
  if (tx.signatures.some((s) => s.every((x) => x === 0))) throw httpError(400, "The transaction is missing a signature.");

  const { lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  let sig;
  try {
    sig = await sendAndConfirm(conn, tx.serialize(), tx.message.recentBlockhash, lastValidBlockHeight);
  } catch (e) {
    if (e.code === "PENDING") return res.status(202).json({ pending: true, signature: e.signature, mint });
    const logs = e.logs || e.transactionLogs;
    if (logs) console.error("preflight logs", logs.slice(-15));
    throw e.status ? e : httpError(400, simplify(e.message));
  }
  // Give the RPC a moment to see the new accounts, then verify and list.
  for (let i = 0; i < 5; i++) {
    try { const coin = await finalize(conn, cfg, mint, sig); return { ok: true, signature: sig, coin }; }
    catch (e) { if (e.code !== "NOT_VERIFIED" || i === 4) return res.status(202).json({ pending: true, signature: sig, mint, reason: e.message }); await sleep(1500); }
  }
});

function simplify(msg) {
  if (/insufficient (funds|lamports)/i.test(msg) || /0x1\b/.test(msg)) return "Not enough SOL in your wallet for this launch.";
  if (/Blockhash not found/i.test(msg)) return "The launch expired before it was sent. Try again.";
  if (/TooMuchSolRequired|0x1772|slippage/i.test(msg)) return "Price moved during the dev buy. Try again.";
  return msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
}
