// ============================================================
// ICONS — custom-drawn commodity SVGs (one consistent 24px stroke style) and
// a handful of UI glyphs. Everything is inline: no icon packages, no network.
// ============================================================
const wrap = (inner, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;
const COMMODITY = {
    // gold bar
    gold: wrap(`<path d="M6 8h12l3 8H3z"/><path d="M8 8l1-3h6l1 3"/><path d="M3 16h18v2H3z"/><path d="M9 12h6"/>`),
    // silver coin stack
    silver: wrap(`<ellipse cx="12" cy="7" rx="7" ry="2.6"/><path d="M5 7v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V7"/><path d="M5 11v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-4"/><path d="M9 7h6"/>`),
    // oil drop + barrel ring
    oil: wrap(`<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9 14a3 3 0 0 0 3 3"/>`),
    // friendly uranium atom
    uranium: wrap(`<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-60 12 12)"/>`),
    // coffee bean
    coffee: wrap(`<ellipse cx="12" cy="12" rx="6.5" ry="9" transform="rotate(30 12 12)"/><path d="M8.5 5.5c3 2.5 3 10.5 7 13"/>`),
    // cocoa pod
    cocoa: wrap(`<path d="M7 4c6-1 11 4 10 11-1 5-5 6-8 5S3 13 4 9c.5-2.5 1.5-4.4 3-5z"/><path d="M8 6c2 3 3 8 3 12"/><path d="M12 7c1.5 2.5 2 6 1.5 10"/>`),
    platinum: wrap(`<path d="M12 3l8 5v8l-8 5-8-5V8z"/><path d="M12 3v18M4 8l16 8M20 8L4 16"/>`),
    palladium: wrap(`<path d="M12 3l8 5v8l-8 5-8-5V8z"/><circle cx="12" cy="12" r="3"/>`),
    copper: wrap(`<path d="M4 7h16v3H4z"/><path d="M6 10v8h12v-8"/><path d="M9 13h6"/>`),
    lithium: wrap(`<rect x="7" y="5" width="10" height="15" rx="2"/><path d="M10 3h4M9 12h6"/>`),
    nickel: wrap(`<circle cx="12" cy="12" r="8"/><path d="M9 15V9l6 6V9"/>`),
    cobalt: wrap(`<circle cx="12" cy="12" r="8"/><path d="M14 9.5a3 3 0 1 0 0 5"/>`),
    rareearths: wrap(`<path d="M12 3l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 10l6-1z"/>`),
    natgas: wrap(`<path d="M12 3c3 4 5 6 5 10a5 5 0 0 1-10 0c0-2 1-3 2-5 0 2 1 3 2 3 0-3 0-5 1-8z"/>`),
    coal: wrap(`<path d="M7 6l6-2 6 5-2 9-7 2-6-6z"/><path d="M7 6l5 7 7-4M12 13l-2 7"/>`),
    gasoline: wrap(`<path d="M6 4h8v16H6z"/><path d="M14 9h3l2 2v6a1.5 1.5 0 0 1-3 0v-4h-2"/><path d="M8 7h4v4H8z"/>`),
    wheat: wrap(`<path d="M12 21V8"/><path d="M12 8c-3 0-4-2-4-4 2 0 4 1 4 4zM12 12c-3 0-4-2-4-4 2 0 4 1 4 4zM12 16c-3 0-4-2-4-4 2 0 4 1 4 4z"/><path d="M12 8c3 0 4-2 4-4-2 0-4 1-4 4zM12 12c3 0 4-2 4-4-2 0-4 1-4 4zM12 16c3 0 4-2 4-4-2 0-4 1-4 4z"/>`),
    corn: wrap(`<path d="M12 3c3 0 5 4 5 9s-2 9-5 9-5-4-5-9 2-9 5-9z"/><path d="M9 8h6M8 12h8M9 16h6"/>`),
    soybeans: wrap(`<path d="M6 14a4 4 0 1 1 8 0 4 4 0 0 1-8 0zM10 8a4 4 0 1 1 8 0 4 4 0 0 1-8 0z"/>`),
    sugar: wrap(`<path d="M5 9l7-4 7 4v7l-7 4-7-4z"/><path d="M5 9l7 4 7-4M12 13v7"/>`),
    oj: wrap(`<circle cx="12" cy="13" r="8"/><path d="M12 5v8l5-5M4 13h16"/>`),
    cotton: wrap(`<circle cx="9" cy="10" r="4"/><circle cx="15" cy="10" r="4"/><circle cx="12" cy="14" r="4"/><path d="M12 18v3"/>`),
    cattle: wrap(`<path d="M8 6c-2-1-4-1-5 1 1 1 2 1 4 1M16 6c2-1 4-1 5 1-1 1-2 1-4 1"/><path d="M7 8h10v6a5 5 0 0 1-10 0z"/><circle cx="10" cy="11" r=".6" fill="currentColor"/><circle cx="14" cy="11" r=".6" fill="currentColor"/>`),
    hogs: wrap(`<ellipse cx="12" cy="13" rx="8" ry="6"/><ellipse cx="12" cy="14" rx="2.5" ry="1.8"/><path d="M6 8l-1-3 3 2M18 8l1-3-3 2"/>`),
    water: wrap(`<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M8 15c1 1 2 1.5 4 1.5s3-.5 4-1.5"/>`),
    carbon: wrap(`<path d="M12 21c-5 0-8-3-8-8 0-5 4-8 8-8 0 5 3 8 8 8-2 5-5 8-8 8z"/><path d="M12 21c0-4 2-7 5-9"/>`),
    eggs: wrap(`<path d="M12 3c3.5 0 6 5 6 10a6 6 0 0 1-12 0c0-5 2.5-10 6-10z"/>`),
    aluminum: wrap(`<path d="M7 4h10v16H7z"/><path d="M7 8h10M7 16h10"/><path d="M10 11l2 2 2-2"/>`),
    zinc: wrap(`<path d="M7 7h10L7 17h10"/><circle cx="12" cy="12" r="9"/>`),
    tin: wrap(`<rect x="6" y="6" width="12" height="13" rx="2"/><ellipse cx="12" cy="6" rx="6" ry="2"/><path d="M6 11h12"/>`),
    ironore: wrap(`<path d="M5 15l3-7 6-3 5 4 1 6-5 4-7-1z"/><path d="M9 11l3 2 3-3"/>`),
    steel: wrap(`<path d="M4 6h16M4 18h16M12 6v12"/><path d="M8 6v2M16 6v2M8 18v-2M16 18v-2"/>`),
    rhodium: wrap(`<circle cx="12" cy="12" r="8"/><path d="M9 16V8h3.5a2.5 2.5 0 0 1 0 5H9M12.5 13l3 3"/>`),
    titanium: wrap(`<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M8.5 9h7M12 9v7"/>`),
    tungsten: wrap(`<path d="M9 3h6l-1 6h-4z"/><path d="M8 9h8l-1.5 12h-5z"/><path d="M10 14h4"/>`),
    heatingoil: wrap(`<path d="M12 3s5 5.5 5 9.5a5 5 0 0 1-10 0C7 8.5 12 3 12 3z"/><path d="M5 20c1.5-1 2.5-1 4 0s2.5 1 4 0 2.5-1 4 0"/>`),
    propane: wrap(`<rect x="7" y="7" width="10" height="14" rx="5"/><path d="M10 7V4h4v3M7 13h10"/>`),
    jetfuel: wrap(`<path d="M3 13l18-7-5 14-4-5-5 3 1-5z"/><path d="M12 15l4-5"/>`),
    ethanol: wrap(`<path d="M9 3h6M10 3v5l-5 10a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-10V3"/><path d="M7.5 15h9"/>`),
    rice: wrap(`<path d="M4 13h16a8 8 0 0 1-16 0z"/><path d="M8 10c0-1.5 1-2.5 2-2.5M12 9.5c0-2 1-3 2.5-3M15 11c.5-1 1.5-1.5 2.5-1.2"/>`),
    oats: wrap(`<path d="M12 21V6"/><path d="M12 9l-4-3M12 9l4-3M12 13l-4-3M12 13l4-3M12 17l-4-3M12 17l4-3"/>`),
    canola: wrap(`<circle cx="12" cy="8" r="2.2"/><circle cx="8" cy="11" r="2.2"/><circle cx="16" cy="11" r="2.2"/><circle cx="12" cy="13" r="2.2"/><path d="M12 15v6"/>`),
    palmoil: wrap(`<path d="M12 21V11"/><path d="M12 11C9 7 5 7 3 9M12 11c3-4 7-4 9-2M12 11c-1-4-3-6-6-7M12 11c1-4 3-6 6-7"/>`),
    tea: wrap(`<path d="M4 9h12v4a6 6 0 0 1-12 0z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2"/><path d="M8 3c0 2 2 2 2 4M12 3c0 2 2 2 2 4"/>`),
    vanilla: wrap(`<path d="M6 20C8 14 12 8 18 4"/><path d="M9 4c3 1 4 4 3 6-2-.5-4-3-3-6zM15 13c1 3-.5 5-2.5 6-1-2 0-5 2.5-6z"/>`),
    lumber: wrap(`<rect x="3" y="7" width="18" height="5" rx="2.5"/><rect x="3" y="12" width="18" height="5" rx="2.5"/><circle cx="18.5" cy="9.5" r="1.2"/><circle cx="18.5" cy="14.5" r="1.2"/>`),
    rubber: wrap(`<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 4v4.5M12 15.5V20M4 12h4.5M15.5 12H20"/>`),
    milk: wrap(`<path d="M9 3h6v3l2 3v12H7V9l2-3z"/><path d="M7 13h10"/>`),
    salmon: wrap(`<path d="M3 12c3-4 8-5 12-3l4-3v12l-4-3c-4 2-9 1-12-3z"/><circle cx="7.5" cy="11.3" r=".7" fill="currentColor"/>`),
    diamonds: wrap(`<path d="M6 4h12l3 5-9 11L3 9z"/><path d="M3 9h18M9 4l3 5 3-5M12 9v11"/>`),
};
export function commodityIcon(id) {
    return COMMODITY[id] ?? wrap(`<circle cx="12" cy="12" r="8"/>`);
}
/** Quarry mark (Ingot Stack). Bars use the brand crimsons; the tip follows the text colour so it works in both themes. */
export const LOGO = `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M30 72h40l8 16H22z" style="fill:var(--accent-2)"/><path d="M34 50h32l7 16H27z" fill="#b3203a"/><path d="M40 28h22l7 16H33z" style="fill:var(--accent)"/><path d="M51 8l12 14H39z" style="fill:var(--text)"/></svg>`;
export const UI = {
    search: wrap(`<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`),
    copy: wrap(`<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>`),
    check: wrap(`<path d="m5 12 5 5L20 7"/>`),
    wallet: wrap(`<path d="M3 7a2 2 0 0 1 2-2h14v4"/><path d="M3 7v10a2 2 0 0 0 2 2h15v-8H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="15" r="1" fill="currentColor"/>`),
    lock: wrap(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`),
    unlock: wrap(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>`),
    shield: wrap(`<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>`),
    rocket: wrap(`<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M14 4c3-1 6-1 6-1s0 3-1 6c-1.5 4-6 8-9 9l-4-4c1-3 5-7.5 8-10z"/><circle cx="15" cy="9" r="1.5"/>`),
    grad: wrap(`<path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11v4c0 1.5 2.5 3 5 3s5-1.5 5-3v-4M21 9v6"/>`),
    whale: wrap(`<path d="M3 13c3-4 7-5 12-4 3 .6 4 2 6 2-1 3-4 5-8 5-5 0-8-1-10-3z"/><path d="M15 9c0-2-1-4-3-5 1 1 1 3 1 5"/>`),
    x: wrap(`<path d="M4 4l16 16M20 4L4 20"/>`),
    external: wrap(`<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/>`),
    home: wrap(`<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>`),
    grid: wrap(`<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`),
    plus: wrap(`<path d="M12 5v14M5 12h14"/>`),
    info: wrap(`<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>`),
    gift: wrap(`<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M12 9v12M3 14h18M12 9c-2 0-4-1-4-3a2 2 0 0 1 4 0c0-2 2-3 4-3a2 2 0 0 1 0 4z"/>`),
    sun: wrap(`<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>`),
    moon: wrap(`<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>`),
    bolt: wrap(`<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>`),
    chart: wrap(`<path d="M3 20h18M6 16l4-6 4 3 5-8"/>`),
    bell: wrap(`<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>`),
    arrow: wrap(`<path d="M5 12h14M13 6l6 6-6 6"/>`),
    back: wrap(`<path d="M19 12H5M11 18l-6-6 6-6"/>`),
    coin: wrap(`<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.5a2.5 2 0 0 1 5 0c0 2-5 2-5 4a2.5 2 0 0 0 5 0"/>`),
};
