// ============================================================
// ART — background images generated with Higgsfield (Nano Banana) for Quarry.
// They load straight from Higgsfield's CDN (the lighter _min.webp copies; swap to .png for full 2K). For a permanent copy, download each
// file into /assets and change the URL to e.g. "./assets/hero.png".
// Any image that fails to load falls back to the coded gradients/canvas art.
// ============================================================
const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3K5xdyyILiZysqAFASaQNChCHCw";
export const art = {
    /** Night quarry with a glowing stack of ingots, dark left side for the headline. 16:9 */
    hero: `${CDN}/hf_20261027_102415_18639ead-861a-40f7-887a-dd72dcbfffd8_min.webp`,
    /** Molten metal pouring into ingot molds. 21:9 — launch page header. */
    foundry: `${CDN}/hf_20261027_102416_bf4fb4fe-3ece-4f6f-ba2f-6b24718fb282_min.webp`,
    /** Commodity still life (gold, silver, oil, crystal, coffee, cocoa). 16:9 — pairs page + share image. */
    stillLife: `${CDN}/hf_20261027_102416_11904e2b-3880-4a29-9fbf-8388e50f046f_min.webp`,
    /** Board banner textures. 21:9 */
    gold: `${CDN}/hf_20261027_102416_2e24bd66-d47f-4819-a637-d9efc21d2028_min.webp`,
    silver: `${CDN}/hf_20261027_102418_500057a2-f79f-4498-8859-b415c66b85ec_min.webp`,
    /** Raw quarry rock with crimson/gold veins — every House board, tinted per commodity. */
    rock: `${CDN}/hf_20261027_102417_e34d8bbd-4a21-44d9-be3e-617749d17b0d_min.webp`,
};
/** Background image for a board banner. */
export function boardArt(id) {
    if (id === "gold")
        return art.gold;
    if (id === "silver")
        return art.silver;
    return art.rock;
}
/** Create an <img> that removes itself (and an optional class) if it fails to load. */
export function artImg(src, cls, onFail) {
    if (!src)
        return null;
    const img = document.createElement("img");
    img.className = cls;
    img.alt = "";
    img.decoding = "async";
    img.setAttribute("aria-hidden", "true");
    img.addEventListener("load", () => img.classList.add("loaded"));
    img.addEventListener("error", () => { img.remove(); onFail?.(); });
    img.src = src;
    return img;
}
