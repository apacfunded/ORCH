// ============================================================
// FEE CONFIG
// Coins launch on pump.fun, so trading fees are pump.fun's. What this site
// controls is how each coin's pump.fun CREATOR FEES are split. pump.fun lets a
// creator send creator fees to up to 10 wallets, so every launch from this site
// sets three recipients:
//   70% -> the coin's creator
//   20% -> buyback wallet: the fee bot swaps it into the main coin and burns it
//   10% -> holder-rewards wallet: the fee bot pays it out in SOL to main-coin holders
// The bot lives in /fee-bot. Percentages must add up to 100.
// ============================================================
const creatorSharePct = 70;
const buybackBurnPct = 20;
const mainHolderSolPct = 10;
export const fees = {
    creatorSharePct,
    buybackBurnPct,
    mainHolderSolPct,
    buybackWallet: null, // CONFIG
    holderRewardsWallet: null, // CONFIG
    mainCoinMint: null, // CONFIG
    launchCostSol: null,
    holderRewardsPct: null,
    holderRewardsAvailable: false,
    launchpadSharePct: buybackBurnPct + mainHolderSolPct,
    launchpadFeeWallet: null,
};
if (creatorSharePct + buybackBurnPct + mainHolderSolPct !== 100)
    console.warn("fees.ts: creator-fee shares must add up to 100%");
export const fmtFee = (v) => (v === null ? "TBD" : `${v}%`);
