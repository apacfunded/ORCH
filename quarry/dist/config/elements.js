// ============================================================
// ELEMENTS — every commodity board as a tile on the Quarry table.
// Symbol + atomic-style number, grouped by category in table order.
// ============================================================
import { boardCommodities, categoryLabel } from "./commodities.js";
const SYMBOL = {
    gold: "Au", silver: "Ag", platinum: "Pt", palladium: "Pd", rhodium: "Rh", copper: "Cu", aluminum: "Al",
    zinc: "Zn", tin: "Sn", nickel: "Ni", cobalt: "Co", lithium: "Li", ironore: "Fe", steel: "St",
    titanium: "Ti", tungsten: "W", rareearths: "Re",
    oil: "Oi", natgas: "Ng", coal: "Cl", gasoline: "Gs", heatingoil: "Ho", propane: "Pr", jetfuel: "Jf",
    ethanol: "Et", uranium: "U",
    coffee: "Cf", cocoa: "Cc", wheat: "Wh", corn: "Cr", soybeans: "Sy", sugar: "Sg", oj: "Oj", cotton: "Ct",
    rice: "Ri", oats: "Oa", canola: "Cz", palmoil: "Po", tea: "Te", vanilla: "Va", lumber: "Lb", rubber: "Rb",
    cattle: "Lc", hogs: "Lh", milk: "Mk", salmon: "Sa", eggs: "Eg",
    water: "Wa", carbon: "Cb", diamonds: "Dm",
};
/** Category order on the table (columns on desktop, rows on phones). */
export const CATEGORY_ORDER = ["metals", "energy", "agriculture", "livestock", "wildcard"];
export const categoryShort = { metals: "Metals", energy: "Energy", agriculture: "Agriculture", livestock: "Livestock", wildcard: "Wildcards" };
let cache = null;
/** All boards in table order, each with its element symbol and number (01, 02 …). */
export function elements() {
    if (cache)
        return cache;
    const all = boardCommodities();
    const out = [];
    for (const cat of CATEGORY_ORDER) {
        const list = all.filter((c) => c.category === cat);
        // Backed first inside a group, then by name
        list.sort((a, b) => (a.tier === b.tier ? 0 : a.tier === "backed" ? -1 : 1));
        for (const c of list)
            out.push({ c, sym: SYMBOL[c.id] ?? c.name.slice(0, 2), n: 0 });
    }
    out.forEach((e, i) => (e.n = i + 1));
    cache = out;
    return out;
}
export const elementOf = (id) => elements().find((e) => e.c.id === id);
export const elNum = (n) => String(n).padStart(2, "0");
export { categoryLabel };
