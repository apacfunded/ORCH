// pump.fun creator-fee sharing (Pump Fees program) via the official SDK.
import { PublicKey, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import pump from './pump-sdk.cjs';
export const { PUMP_SDK, feeSharingConfigPda } = pump;

export const NATIVE_MINT = new PublicKey('So11111111111111111111111111111111111111112');
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

export const TREASURY = () => process.env.CUFFED_TREASURY || '3h6qznGUXRJYpKs9e9xxvRK2wKmvccMy8BT7mshqt5j8';
export const TREASURY_BPS = () => Number(process.env.CUFFED_FEE_BPS || 2000); // 20% of creator fees
export const LAUNCH_FEE_LAMPORTS = () => Math.round(Number(process.env.CUFFED_LAUNCH_FEE_SOL ?? 0.05) * 1e9);

/** Creator keeps the rest; if the creator IS the treasury, it's one 100% shareholder. */
export function shareholders(creator) {
  const t = TREASURY(), bps = TREASURY_BPS();
  if (creator === t || bps <= 0) return [{ address: new PublicKey(creator), shareBps: 10_000 }];
  return [
    { address: new PublicKey(creator), shareBps: 10_000 - bps },
    { address: new PublicKey(t), shareBps: bps },
  ];
}

export const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
const ata = (owner, mint, prog = TOKEN_PROGRAM_ID) => PublicKey.findProgramAddressSync([owner.toBuffer(), prog.toBuffer(), mint.toBuffer()], ATA_PROGRAM)[0];

/** collect_creator_fee_v2 (from pump's IDL): sweeps the dev buy's creator fee to the creator.
 *  pump.fun refuses to migrate a coin to fee sharing while creator fees are unswept. */
export function collectCreatorFeeIx(creator) {
  const c = new PublicKey(creator);
  const vault = PublicKey.findProgramAddressSync([Buffer.from('creator-vault'), c.toBuffer()], PUMP_PROGRAM_ID)[0];
  const eventAuth = PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], PUMP_PROGRAM_ID)[0];
  const keys = [
    [c, true], [ata(c, NATIVE_MINT), true], [vault, true], [ata(vault, NATIVE_MINT), true],
    [NATIVE_MINT, false], [TOKEN_PROGRAM_ID, false], [ATA_PROGRAM, false], [SystemProgram.programId, false],
    [eventAuth, false], [PUMP_PROGRAM_ID, false],
  ].map(([pubkey, isWritable]) => ({ pubkey, isWritable, isSigner: false }));
  return new TransactionInstruction({ programId: PUMP_PROGRAM_ID, keys, data: Buffer.from([207, 17, 138, 242, 4, 34, 19, 56]) });
}

/** sweep_creator_fee (from pump's IDL): newer trades leave the creator fee waiting on the curve;
 *  this moves it into the creator vault. Must run before anything changes the creator. */
export function sweepCreatorFeeIx(creator, mint) {
  const c = new PublicKey(creator), m = new PublicKey(mint);
  const pda = (seeds) => PublicKey.findProgramAddressSync(seeds, PUMP_PROGRAM_ID)[0];
  const curve = pda([Buffer.from('bonding-curve'), m.toBuffer()]);
  const vault = pda([Buffer.from('creator-vault'), c.toBuffer()]);
  const keys = [
    [c, true, true], [pda([Buffer.from('global')]), false], [m, false], [NATIVE_MINT, false], [TOKEN_PROGRAM_ID, false],
    [ATA_PROGRAM, false], [SystemProgram.programId, false], [curve, true], [ata(curve, NATIVE_MINT), true],
    [vault, true], [ata(vault, NATIVE_MINT), true], [pda([Buffer.from('__event_authority')]), false], [PUMP_PROGRAM_ID, false],
  ].map(([pubkey, isWritable, isSigner = false]) => ({ pubkey, isWritable, isSigner }));
  return new TransactionInstruction({ programId: PUMP_PROGRAM_ID, keys, data: Buffer.from([32, 246, 191, 52, 8, 201, 73, 186]) });
}

/** sweep -> collect fees -> create_fee_sharing_config -> update_fee_shares_v2 (locks the split forever). */
export async function feeSharingIxs(creator, mint) {
  const c = new PublicKey(creator), m = new PublicKey(mint);
  const sweep = sweepCreatorFeeIx(creator, mint);
  const collect = collectCreatorFeeIx(creator);
  const create = await PUMP_SDK.createFeeSharingConfig({ creator: c, mint: m, pool: null });
  const update = await PUMP_SDK.updateFeeSharesV2({
    authority: c, mint: m, currentShareholders: [c], newShareholders: shareholders(creator),
    quoteMint: NATIVE_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID,
  });
  return [sweep, collect, create, update];
}

/** On-chain check: split is locked and the treasury holds at least its share. */
export async function verifyFeeSharing(rpcGetAccount, creator, mint) {
  if (creator === TREASURY()) return { ok: true, self: true };
  const pda = feeSharingConfigPda(new PublicKey(mint));
  const info = await rpcGetAccount(pda.toBase58());
  if (!info) return { ok: false, reason: 'Fee sharing is not set up on this coin.' };
  const sc = PUMP_SDK.decodeSharingConfig(info);
  if (!sc.adminRevoked) return { ok: false, reason: 'The fee split is not locked yet.' };
  const got = sc.shareholders.find((s) => s.address.toBase58() === TREASURY());
  if (!got || got.shareBps < TREASURY_BPS()) return { ok: false, reason: 'The Cuffed fee share is missing.' };
  return { ok: true, shareholders: sc.shareholders.map((s) => ({ address: s.address.toBase58(), bps: s.shareBps })) };
}
