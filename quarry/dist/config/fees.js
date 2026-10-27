// ============================================================
// FEE CONFIG — all values are placeholders (TBD) until the owner sets them.
// Coins launch on pump.fun, so trading fees are pump.fun's. What this site
// controls is how the coin's pump.fun CREATOR FEES are split: pump.fun lets a
// creator send creator fees to up to 10 wallets, so the launch transaction can
// set the launchpad wallet as one recipient.
// ============================================================
export const fees = {
    launchpadSharePct: null, // TBD
    creatorSharePct: null, // TBD
    holderRewardsPct: null, // TBD
    holderRewardsAvailable: true,
    launchpadFeeWallet: null, // CONFIG
    launchCostSol: null, // TBD
};
export const fmtFee = (v) => (v === null ? "TBD" : `${v}%`);
