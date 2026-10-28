// One-time launchpad setup: the address lookup table that lets a launch (create + locked fee split +
// dev buy) fit in ONE transaction.
//   GET  /api/setup                    -> { ready, lut, buybackWallet, holderWallet, admin }
//   POST /api/setup { payer }          -> { lut, txs: [base64...] } to sign (create + extend)
//   POST /api/setup { lut, txs }       -> sends the signed txs, checks the table, saves it
const { AddressLookupTableProgram, PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } = require("@solana/web3.js");
const { route, body } = require("../lib/http");
const store = require("../lib/store");
const { connection, launchConfig, assertReady, httpError } = require("../lib/env");
const { staticAddresses } = require("../lib/launch");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = route(["GET", "POST"], async (req) => {
  const cfg = await launchConfig();
  const admin = cfg.adminWallet || cfg.buybackWallet;
  if (req.method === "GET") return { ready: !!(cfg.lut && cfg.buybackWallet && cfg.holderWallet), lut: cfg.lut, buybackWallet: cfg.buybackWallet, holderWallet: cfg.holderWallet, admin, split: [cfg.creatorBps, cfg.buybackBps, cfg.holderBps] };

  assertReady(cfg);
  const b = await body(req);
  const conn = connection();

  if (b.payer) {
    const payer = new PublicKey(String(b.payer));
    if (!admin || payer.toBase58() !== admin) throw httpError(403, `Only the admin wallet (${admin}) can run setup.`);
    const addrs = await staticAddresses(conn, cfg);
    const slot = await conn.getSlot("finalized");
    const [createIx, lut] = AddressLookupTableProgram.createLookupTable({ authority: payer, payer, recentSlot: slot });
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    const chunks = [];
    for (let i = 0; i < addrs.length; i += 20) chunks.push(addrs.slice(i, i + 20));
    const txs = chunks.map((chunk, i) => {
      const ixs = [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200_000 })];
      if (i === 0) ixs.push(createIx);
      ixs.push(AddressLookupTableProgram.extendLookupTable({ lookupTable: lut, authority: payer, payer, addresses: chunk }));
      return Buffer.from(new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message()).serialize()).toString("base64");
    });
    await store.putJson("config/setup-pending.json", { lut: lut.toBase58(), payer: payer.toBase58(), count: addrs.length }, { cache: 0 });
    return { lut: lut.toBase58(), txs, addresses: addrs.length };
  }

  if (b.lut && Array.isArray(b.txs)) {
    const pending = await store.getJson("config/setup-pending.json");
    if (!pending || pending.lut !== b.lut) throw httpError(400, "Start setup again.");
    const sigs = [];
    for (const t of b.txs) {
      const raw = Buffer.from(String(t), "base64");
      const sig = await conn.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: "confirmed" });
      for (let i = 0; i < 30; i++) { const st = (await conn.getSignatureStatuses([sig])).value[0]; if (st?.err) throw httpError(400, `Setup tx failed: ${JSON.stringify(st.err)}`); if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") break; await sleep(1000); }
      sigs.push(sig);
    }
    await sleep(1500);
    const table = (await conn.getAddressLookupTable(new PublicKey(b.lut))).value;
    const want = (await staticAddresses(conn, cfg)).map((k) => k.toBase58());
    const have = new Set((table?.state.addresses || []).map((k) => k.toBase58()));
    const missing = want.filter((k) => !have.has(k));
    if (missing.length) throw httpError(400, `Lookup table is missing ${missing.length} addresses.`);
    const settings = (await store.getJson("config/settings.json")) || {};
    await store.putJson("config/settings.json", { ...settings, lut: b.lut, lutCreatedAt: Date.now() }, { cache: 0 });
    return { ok: true, lut: b.lut, signatures: sigs };
  }
  throw httpError(400, "Bad request.");
});
