// ============================================================
// COMMODITY ROSTER — every board, badge, pair chip and filter on the site
// is generated from this list. Add a commodity here and it appears everywhere.
//
// Coins launch on pump.fun and trade in SOL. The commodity is a site-side pairing:
// this site groups each coin onto a board and converts its price into that commodity.
//
// IMPORTANT: no mint addresses are hardcoded. Fill `mint`
// yourself once you have chosen the quote token for each commodity.
// ============================================================
export const commodities = [
    // ---------- LAUNCH BOARDS ----------
    {
        id: "gold",
        name: "Gold",
        symbol: "GOLD",
        tier: "backed",
        status: "live",
        mint: null, // CONFIG: candidate quote tokens are tokenized gold already on Solana (e.g. XAUt, Oro GOLD, GLDx, GLDon). Pick one and paste its mint.
        issuer: null, // CONFIG: { name: "Issuer", url: "https://..." } once the gold token is chosen
        color: "#e6b84a",
        color2: "#f7e3a1",
        icon: "gold",
        category: "metals",
        blurb: "The anchor. Coins priced in tokenized gold.",
        unlockProgress: 1,
        unit: "oz",
        material: "molten",
    },
    {
        id: "silver",
        name: "Silver",
        symbol: "SILVER",
        tier: "backed",
        status: "live",
        mint: null, // CONFIG: candidate quote token is tokenized silver on Solana (e.g. SILV). Paste its mint.
        issuer: null, // CONFIG
        color: "#c7d1dc",
        color2: "#eef3f8",
        icon: "silver",
        category: "metals",
        blurb: "Cheaper ounces, faster boards.",
        unlockProgress: 1,
        unit: "oz",
        material: "brushed",
    },
    {
        id: "oil",
        name: "Crude Oil",
        symbol: "OIL",
        tier: "house",
        status: "live",
        mint: null, // CONFIG: House token mint once launched
        issuer: null,
        color: "#5b4b8a",
        color2: "#2a1f3d",
        icon: "oil",
        category: "energy",
        blurb: "Black gold. House board, open for launches.",
        unlockProgress: 1,
        unit: "bbl",
        material: "oilslick",
    },
    {
        id: "uranium",
        name: "Uranium",
        symbol: "URANIUM",
        tier: "house",
        status: "live",
        mint: null, // CONFIG
        issuer: null,
        color: "#9cff3d",
        color2: "#2f6b12",
        icon: "uranium",
        category: "energy",
        blurb: "Glows in the dark. House board, open for launches.",
        unlockProgress: 1,
        unit: "lb",
        material: "glow",
    },
    {
        id: "coffee",
        name: "Coffee",
        symbol: "COFFEE",
        tier: "house",
        status: "live",
        mint: null, // CONFIG
        issuer: null,
        color: "#b5793f",
        color2: "#4a2b17",
        icon: "coffee",
        category: "agriculture",
        blurb: "Roasted. House board, open for launches.",
        unlockProgress: 1,
        unit: "lb",
        material: "steam",
    },
    {
        id: "cocoa",
        name: "Cocoa",
        symbol: "COCOA",
        tier: "house",
        status: "live",
        mint: null, // CONFIG
        issuer: null,
        color: "#d08a7a",
        color2: "#3b1d16",
        icon: "cocoa",
        category: "agriculture",
        blurb: "Dark and bitter. House board, open for launches.",
        unlockProgress: 1,
        unit: "ton",
        material: "swirl",
    },
    // ---------- MORE HOUSE BOARDS (all live) ----------
    ...house("platinum", "Platinum", "PLAT", "metals", "#dfe6ea", "oz"),
    ...house("palladium", "Palladium", "PALL", "metals", "#cfd8d3", "oz"),
    ...house("copper", "Copper", "COPPER", "metals", "#c8743a", "lb"),
    ...house("lithium", "Lithium", "LITHIUM", "metals", "#b8c6ff", "ton"),
    ...house("nickel", "Nickel", "NICKEL", "metals", "#aab4b0", "ton"),
    ...house("cobalt", "Cobalt", "COBALT", "metals", "#3f6df5", "ton"),
    ...house("rareearths", "Rare Earths", "RARE", "metals", "#b76cf0", "kg"),
    ...house("natgas", "Natural Gas", "NATGAS", "energy", "#59c5ff", "MMBtu"),
    ...house("coal", "Coal", "COAL", "energy", "#5a5a5a", "ton"),
    ...house("gasoline", "Gasoline", "GAS", "energy", "#ff9a3d", "gal"),
    ...house("wheat", "Wheat", "WHEAT", "agriculture", "#e3c87a", "bu"),
    ...house("corn", "Corn", "CORN", "agriculture", "#f5d547", "bu"),
    ...house("soybeans", "Soybeans", "SOY", "agriculture", "#b7c96a", "bu"),
    ...house("sugar", "Sugar", "SUGAR", "agriculture", "#f3f1ec", "lb"),
    ...house("oj", "Orange Juice", "OJ", "agriculture", "#ff8a1f", "lb"),
    ...house("cotton", "Cotton", "COTTON", "agriculture", "#f7f3ea", "lb"),
    ...house("cattle", "Cattle", "CATTLE", "livestock", "#a86b4c", "cwt"),
    ...house("hogs", "Lean Hogs", "HOGS", "livestock", "#f0a8b4", "cwt"),
    ...house("water", "Water", "WATER", "wildcard", "#4fd1ff", "acre-ft"),
    ...house("carbon", "Carbon Credits", "CARBON", "wildcard", "#5fd39a", "ton"),
    ...house("eggs", "Eggs", "EGGS", "wildcard", "#f6e7c3", "doz"),
    // metals
    ...house("aluminum", "Aluminum", "ALU", "metals", "#b9c4cc", "ton"),
    ...house("zinc", "Zinc", "ZINC", "metals", "#9fb3bd", "ton"),
    ...house("tin", "Tin", "TIN", "metals", "#c9ccd1", "ton"),
    ...house("ironore", "Iron Ore", "IRON", "metals", "#b0533a", "ton"),
    ...house("steel", "Steel", "STEEL", "metals", "#8d99a6", "ton"),
    ...house("rhodium", "Rhodium", "RHOD", "metals", "#e8ecef", "oz"),
    ...house("titanium", "Titanium", "TITAN", "metals", "#a7b0c8", "kg"),
    ...house("tungsten", "Tungsten", "TUNG", "metals", "#7d8794", "kg"),
    // energy
    ...house("heatingoil", "Heating Oil", "HEAT", "energy", "#e0703a", "gal"),
    ...house("propane", "Propane", "PROP", "energy", "#6fb7ff", "gal"),
    ...house("jetfuel", "Jet Fuel", "JET", "energy", "#ffb84d", "gal"),
    ...house("ethanol", "Ethanol", "ETOH", "energy", "#d6e86a", "gal"),
    // agriculture
    ...house("rice", "Rice", "RICE", "agriculture", "#efe8d6", "cwt"),
    ...house("oats", "Oats", "OATS", "agriculture", "#d8c08a", "bu"),
    ...house("canola", "Canola", "CANOLA", "agriculture", "#f2d23c", "ton"),
    ...house("palmoil", "Palm Oil", "PALM", "agriculture", "#e88a2c", "ton"),
    ...house("tea", "Tea", "TEA", "agriculture", "#7fb069", "kg"),
    ...house("vanilla", "Vanilla", "VANILLA", "agriculture", "#f3e2b3", "kg"),
    ...house("lumber", "Lumber", "LUMBER", "agriculture", "#c58c54", "mbf"),
    ...house("rubber", "Rubber", "RUBBER", "agriculture", "#5c5c66", "kg"),
    // livestock, dairy & seafood
    ...house("milk", "Milk", "MILK", "livestock", "#f4f1ea", "cwt"),
    ...house("salmon", "Salmon", "SALMON", "livestock", "#ff8f73", "kg"),
    // wildcards
    ...house("diamonds", "Diamonds", "DIAMOND", "wildcard", "#bfe9ff", "ct"),
];
function house(id, name, symbol, category, color, unit) {
    return [
        {
            id,
            name,
            symbol,
            tier: "house",
            status: "live",
            mint: null, // CONFIG: this board's House token mint once launched on pump.fun
            issuer: null,
            color,
            color2: "#160a0b",
            icon: id,
            category,
            blurb: `${name}. House board, open for launches.`,
            unlockProgress: 1,
            unit,
            material: "flat",
        },
    ];
}
export const byId = (id) => commodities.find((c) => c.id === id);
export const liveCommodities = () => commodities.filter((c) => c.status === "live");
export const boardCommodities = () => commodities.filter((c) => c.status !== "soon");
export const soonCommodities = () => commodities.filter((c) => c.status === "soon");
export const categoryLabel = {
    metals: "Metals",
    energy: "Energy",
    agriculture: "Agriculture",
    livestock: "Livestock, dairy & seafood",
    wildcard: "Wildcards",
};
