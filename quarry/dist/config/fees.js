// ============================================================
// FEE CONFIG
// Coins launch on pump.fun, so trading fees are pump.fun's. What this site
// controls is how each coin's pump.fun CREATOR FEES are split. pump.fun lets a
// creator send creator fees to up to 10 wallets, so every launch from this site
// sets three recipients:
//   70% -> the coin's creator
//   20% -> buyback wallet: the team buys the main coin with it and burns it
//   10% -> holder-rewards wallet: paid out in SOL to main-coin holders
// Buybacks, burns and payouts are done manually. Percentages must add up to 100.
// ============================================================
const creatorSharePct = 70;
const buybackBurnPct = 20;
const mainHolderSolPct = 10;
export const fees = {
    creatorSharePct,
    buybackBurnPct,
    mainHolderSolPct,
    buybackWallet: "9pQYauakrr1wfpgNbuydTWnBs2aDGeHLYb8fz121aNbq",
    holderRewardsWallet: "9iUNVGTSfwzgg68NU3a2187zfY2E4j6xCoafQyPMBgbb",
    mainCoinMint: "DfGGdMDW8kGvU3bzjdLC5QsES829G4jUWqn2u4Sqpump",
    // buyback 9pQYauakrr1wfpgNbuydTWnBs2aDGeHLYb8fz121aNbq / holders 9iUNVGTSfwzgg68NU3a2187zfY2E4j6xCoafQyPMBgbb (enforced server-side)
    launchCostSol: null,
    holderRewardsPct: null,
    holderRewardsAvailable: false,
    launchpadSharePct: buybackBurnPct + mainHolderSolPct,
    launchpadFeeWallet: null,
};
if (creatorSharePct + buybackBurnPct + mainHolderSolPct !== 100)
    console.warn("fees.ts: creator-fee shares must add up to 100%");
export const fmtFee = (v) => (v === null ? "TBD" : `${v}%`);
