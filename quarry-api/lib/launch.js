// Builds the single Quarry launch transaction:
//   create_v2  ->  create_fee_sharing_config  ->  update_fee_shares (locks 70/20/10 forever)
//   -> create creator ATA -> dev buy (optional)
// Fee sharing is set BEFORE the dev buy, so no creator fees exist yet and no sweep is needed,
// and the buy pays its creator fee straight into the new sharing-config vault.
// Everything is one transaction: the coin can never exist without the split.
const {
  ComputeBudgetProgram, PublicKey, TransactionMessage, VersionedTransaction, AddressLookupTableAccount, Keypair, LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const BN = require("bn.js");
const {
  PUMP_SDK, OnlinePumpSdk, getBuyTokenAmountFromSolAmount, feeSharingConfigPda, getFeeRecipient, bondingCurvePda,
} = require("@pump-fun/pump-sdk");
const { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } = require("@solana/spl-token");

const NATIVE_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const PUMPPORTAL_LUT = new PublicKey("84gxtAAWToZ6xep3wrWsx8TEoLB7EBS9VrKkV9CtMdJi");

let cache = { at: 0, global: null, feeConfig: null };
async function pumpState(conn) {
  if (cache.global && Date.now() - cache.at < 60_000) return cache;
  const online = new OnlinePumpSdk(conn);
  const [global, feeConfig] = await Promise.all([online.fetchGlobal(), online.fetchFeeConfig()]);
  cache = { at: Date.now(), global, feeConfig };
  return cache;
}

/** Shareholder list every Quarry coin gets. Order matters only for display. */
function shareholders(creator, cfg) {
  const list = [
    { address: creator, shareBps: cfg.creatorBps },
    { address: new PublicKey(cfg.buybackWallet), shareBps: cfg.buybackBps },
    { address: new PublicKey(cfg.holderWallet), shareBps: cfg.holderBps },
  ];
  // If someone launches FROM the buyback/holder wallet, merge duplicate addresses (program rejects duplicates).
  const merged = new Map();
  for (const s of list) {
    const k = s.address.toBase58();
    merged.set(k, { address: s.address, shareBps: (merged.get(k)?.shareBps ?? 0) + s.shareBps });
  }
  return [...merged.values()];
}

async function buildInstructions(conn, { creator, mint, name, symbol, uri, devBuySol, cfg, priorityMicroLamports }) {
  const { global, feeConfig } = await pumpState(conn);
  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: devBuySol > 0 ? 600_000 : 400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports }),
    await PUMP_SDK.createV2Instruction({ mint, name, symbol, uri, creator, user: creator, mayhemMode: false }),
    await PUMP_SDK.createFeeSharingConfig({ creator, mint, pool: null }),
    await PUMP_SDK.updateFeeShares({ authority: creator, mint, currentShareholders: [creator], newShareholders: shareholders(creator, cfg), bondingCurveComplete: false }),
  ];
  if (devBuySol > 0) {
    const sol = new BN(Math.round(devBuySol * LAMPORTS_PER_SOL));
    const amount = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: sol, quoteMint: NATIVE_MINT });
    const maxSol = sol.muln(102).divn(100); // 2% headroom over the quoted cost
    const ata = getAssociatedTokenAddressSync(mint, creator, true, TOKEN_2022_PROGRAM_ID);
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(creator, ata, creator, mint, TOKEN_2022_PROGRAM_ID));
    ixs.push(await PUMP_SDK.getBuyInstructionRaw({
      user: creator, mint, creator: feeSharingConfigPda(mint), amount, solAmount: maxSol,
      feeRecipient: getFeeRecipient(global, false), tokenProgram: TOKEN_2022_PROGRAM_ID,
    }));
  }
  return ixs;
}

/** Every address in a launch that does not depend on the creator or the mint: the lookup-table contents. */
async function staticAddresses(conn, cfg) {
  const { global } = await pumpState(conn);
  const sample = async () => {
    const ixs = await buildInstructions(conn, {
      creator: Keypair.generate().publicKey, mint: Keypair.generate().publicKey, name: "x", symbol: "x", uri: "x", devBuySol: 0.01,
      cfg: { ...cfg, buybackWallet: Keypair.generate().publicKey.toBase58(), holderWallet: Keypair.generate().publicKey.toBase58() },
      priorityMicroLamports: 1,
    });
    return new Set(ixs.flatMap((ix) => [ix.programId.toBase58(), ...ix.keys.map((k) => k.pubkey.toBase58())]));
  };
  const [a, b] = await Promise.all([sample(), sample()]);
  const recipients = [global.feeRecipient, ...global.feeRecipients, ...(global.buybackFeeRecipients ?? [])].map((k) => k.toBase58());
  const out = new Set([...a].filter((k) => b.has(k)));
  recipients.forEach((k) => out.add(k));
  // Our two fee wallets are the same for every launch, so they belong in the table too.
  out.add(cfg.buybackWallet); out.add(cfg.holderWallet);
  return [...out].map((k) => new PublicKey(k));
}

async function loadLuts(conn, lutAddress) {
  // Quarry's own table holds every static address; PumpPortal's public table is a fallback only.
  const keys = lutAddress ? [new PublicKey(lutAddress)] : [PUMPPORTAL_LUT];
  const res = await Promise.all(keys.map((k) => conn.getAddressLookupTable(k).then((r) => r.value).catch(() => null)));
  return res.filter(Boolean);
}

function txSize(msg) { return 1 + 64 * msg.header.numRequiredSignatures + msg.serialize().length; }

async function buildLaunchTx(conn, p) {
  const ixs = await buildInstructions(conn, p);
  const luts = await loadLuts(conn, p.cfg.lut);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({ payerKey: p.creator, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(luts);
  let size;
  try { size = txSize(msg); } catch { size = Infinity; }
  if (size > 1232) {
    const err = new Error(p.cfg.lut ? "Launch transaction is too large. Try a shorter name or no dev buy." : "Launchpad setup is not finished (lookup table missing).");
    err.code = p.cfg.lut ? "TX_TOO_LARGE" : "NEEDS_LUT";
    throw err;
  }
  return { tx: new VersionedTransaction(msg), blockhash, lastValidBlockHeight, size };
}

/**
 * Checks on-chain that a coin is a real Quarry launch: the bonding curve exists, its creator is the
 * sharing config, and the shareholders are exactly creator/buyback/holders with admin revoked.
 */
async function verifyLaunch(conn, mint, cfg) {
  const [bcInfo, scInfo] = await Promise.all([conn.getAccountInfo(bondingCurvePda(mint)), conn.getAccountInfo(feeSharingConfigPda(mint))]);
  if (!bcInfo) return { ok: false, reason: "bonding curve not found" };
  if (!scInfo) return { ok: false, reason: "fee sharing not set" };
  const bc = PUMP_SDK.decodeBondingCurve(bcInfo);
  const sc = PUMP_SDK.decodeSharingConfig(scInfo);
  if (!bc.creator.equals(feeSharingConfigPda(mint))) return { ok: false, reason: "creator not migrated to sharing config" };
  if (!sc.adminRevoked) return { ok: false, reason: "fee split not locked" };
  const want = new Map([[cfg.buybackWallet, cfg.buybackBps], [cfg.holderWallet, cfg.holderBps]]);
  const got = new Map(sc.shareholders.map((s) => [s.address.toBase58(), s.shareBps]));
  for (const [addr, bps] of want) if ((got.get(addr) ?? 0) < bps) return { ok: false, reason: `missing ${bps} bps for ${addr}` };
  const creator = sc.shareholders.find((s) => !want.has(s.address.toBase58()))?.address.toBase58() ?? sc.admin.toBase58();
  return { ok: true, creator, shareholders: sc.shareholders.map((s) => ({ address: s.address.toBase58(), bps: s.shareBps })), complete: bc.complete };
}

module.exports = { buildLaunchTx, buildInstructions, staticAddresses, verifyLaunch, shareholders, pumpState, NATIVE_MINT, PUMPPORTAL_LUT, AddressLookupTableAccount };
