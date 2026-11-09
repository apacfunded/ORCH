// ============================================================
// BRAND CONFIG — rename the whole site from this one file.
// Name: Quarry. Mark: the "Qy 00" assay element tile (components/Icons.js LOGO).
// ============================================================
export const brand = {
    name: "Quarry",
    /** Short mark used in the header when there is no logo image yet. */
    mark: "Q",
    tagline: "Every coin, weighed against the real world.",
    subline: "Launch on pump.fun. Get priced in gold, oil, uranium, coffee and 46 more.",
    /** CONFIG: platform coin ticker. Shown as "Coming soon" while null. */
    platformTicker: "QUARRY",
    /** Main coin CA on pump.fun. */
    mainCoinMint: null,
    /** CONFIG: X / Twitter handle without the @. null hides the link. */
    xHandle: null,
    /** CONFIG: Telegram invite URL. null hides the link. */
    telegram: null,
    /** CONFIG: path to a logo image (svg/png) relative to the site root. null uses the text mark. */
    logo: "https://d8j0ntlcm91z4.cloudfront.net/user_3K5xdyyILiZysqAFASaQNChCHCw/hf_20261104_093001_9f92ab4a-0ff3-4e3d-8edb-63c3f15d4172_min.webp",
    /** Ceramic tile render and the specimen-set photo used as page art. */
    tileArt: "https://d8j0ntlcm91z4.cloudfront.net/user_3K5xdyyILiZysqAFASaQNChCHCw/hf_20261104_093001_9f92ab4a-0ff3-4e3d-8edb-63c3f15d4172_min.webp",
    plateArt: "https://d8j0ntlcm91z4.cloudfront.net/user_3K5xdyyILiZysqAFASaQNChCHCw/hf_20261104_093001_a8320320-455b-4e9e-8ba2-0fca581b3390_min.webp",
    /** Public site URL used for share links. */
    siteUrl: "https://quary.lol",
    /** Shown in the footer and on the docs page. */
    riskLine: "Memecoins are highly volatile and can go to zero. Nothing on this site is financial advice.",
};
/** Shown wherever a pair chip appears: the pairing is a view on this site, not the on-chain pool. */
export const pairNote = "Commodity pricing is calculated on this site. On pump.fun every coin trades in SOL; here its USD price is divided by its element's USD price.";
export const houseDisclaimer = "House token issued by the launchpad. Not backed by physical reserves and does not track the real commodity price.";
