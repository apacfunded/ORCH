// ============================================================
// BRAND CONFIG — rename the whole site from this one file.
// Name: Quarry. Mark: Ingot Stack (three bars stacked into a rising arrow).
// ============================================================
export const brand = {
    name: "Quarry",
    /** Short mark used in the header when there is no logo image yet. */
    mark: "Q",
    tagline: "Launch coins paired with the real world.",
    subline: "Launch on pump.fun, pick a commodity, and watch your coin priced in gold, silver, oil, uranium, coffee or cocoa here. Trading happens in SOL on pump.fun.",
    /** CONFIG: platform coin ticker. Shown as "Coming soon" while null. */
    platformTicker: null,
    /** CONFIG: X / Twitter handle without the @. null hides the link. */
    xHandle: null,
    /** CONFIG: Telegram invite URL. null hides the link. */
    telegram: null,
    /** CONFIG: path to a logo image (svg/png) relative to the site root. null uses the text mark. */
    logo: "https://d8j0ntlcm91z4.cloudfront.net/user_3K5xdyyILiZysqAFASaQNChCHCw/hf_20261027_104226_0ca018c2-cb8a-44ad-bff8-f027c7975352_min.webp",
    /** Public site URL used for share links. */
    siteUrl: "https://orch.lol/quarry",
    /** Shown in the footer and on the docs page. */
    riskLine: "Memecoins are highly volatile and can go to zero. Nothing on this site is financial advice.",
};
/** Shown wherever a pair chip appears: the pairing is a view on this site, not the on-chain pool. */
export const pairNote = "Pairs are shown on this site only. On pump.fun every coin trades in SOL; here its price is converted into the commodity.";
export const houseDisclaimer = "House token issued by the launchpad. Not backed by physical reserves and does not track the real commodity price.";
