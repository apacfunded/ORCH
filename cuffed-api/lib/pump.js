// pump.fun creator-fee sharing (Pump Fees program) via the official SDK.
import { PublicKey } from '@solana/web3.js';
import { createRequire } from 'node:module';
// The SDK's ESM build is mis-packaged (no "type": "module"), so load its CommonJS build.
const pump = createRequire(import.meta.url)('@pump-fun/pump-sdk');
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

/** create_fee_sharing_config + update_fee_shares_v2 (locks the split forever). */
export async function feeSharingIxs(creator, mint) {
  const c = new PublicKey(creator), m = new PublicKey(mint);
  const create = await PUMP_SDK.createFeeSharingConfig({ creator: c, mint: m, pool: null });
  const update = await PUMP_SDK.updateFeeSharesV2({
    authority: c, mint: m, currentShareholders: [c], newShareholders: shareholders(creator),
    quoteMint: NATIVE_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID,
  });
  return [create, update];
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
