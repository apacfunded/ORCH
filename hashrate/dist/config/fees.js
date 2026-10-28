// Creator-fee settings. null = shown as "TBD" on the site.
export const FEES = {
    /** pump.fun creator fee as a share of volume, used only for estimates. */
    creatorFeeRate: 0.0005, // CONFIG: confirm pump.fun's current rate before launch
    /** Share of every coin's fees that goes to $HASH (matches PLATFORM_CUT in the backend). */
    rigCut: 0.1,
    /** Share that covers running costs (RPC, nodes, tx fees). */
    opsCut: null, // CONFIG
    /** Default rent share in the launch wizard. */
    defaultRentShare: 0.3,
    /** Average loss on rented hashpower, used in estimates. */
    rentalLoss: 0.1,
    /** Site launch fee in SOL, if any. */
    launchFeeSol: null, // CONFIG
    payoutEveryHours: 6,
};
export const pct = (n) => (n === null ? 'TBD' : `${parseFloat((n * 100).toFixed(n < 0.01 ? 3 : 1))}%`);
