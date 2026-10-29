import { svg } from '../lib/dom.js';
// One 1.5px-stroke line set, inlined. No emoji anywhere.
const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICONS = {
    search: P('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    menu: P('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    close: P('<path d="M6 6l12 12M18 6 6 18"/>'),
    sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: P('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>'),
    wallet: P('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12h2M3 9h14a2 2 0 0 0 2-2V5"/>'),
    link: P('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    arrow: P('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    back: P('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
    ext: P('<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'),
    copy: P('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>'),
    bolt: P('<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>'),
    pick: P('<path d="M14 4c3 0 6 3 6 6M4 20 14 10M12 8l4 4"/><path d="M9 3c-3 0-6 3-6 6"/>'),
    up: P('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    down: P('<path d="M12 5v14M6 13l6 6 6-6"/>'),
    coins: P('<circle cx="9" cy="9" r="6"/><path d="M14.5 6.5A6 6 0 1 1 6.5 14.5"/>'),
    cube: P('<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="M12 12 4 7.5M12 12l8-4.5M12 12v9"/>'),
    plus: P('<path d="M12 5v14M5 12h14"/>'),
    x: P('<path d="M4 4l16 16M20 4 4 20"/>'),
    send: P('<path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/>'),
    globe: P('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
    check: P('<path d="m5 12 5 5L20 7"/>'),
    info: P('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>'),
};
export function icon(name, cls = 'ico') { return svg(ICONS[name], cls); }
/** The Hashrate mark: the cartoon hashtag logo. */
export function rigMark(cls = 'mark') {
    const img = document.createElement('img');
    img.src = './assets/logo.webp';
    img.alt = '';
    img.width = 28;
    img.height = 28;
    img.className = cls;
    img.decoding = 'async';
    return img;
}
/** Custom glyph per mine. Each draws from its algorithm: merged rings, shielded hex, a fast lattice, a block, and a ringed core. */
const GLYPHS = {
    LTC_DOGE: '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/><path d="M12 7.5v9"/>',
    ZEC: '<path d="M12 3 20 7v6c0 4-3.5 7-8 8-4.5-1-8-4-8-8V7l8-4Z"/><path d="M9 9h6l-6 6h6"/>',
    KAS: '<path d="m12 3 7.8 4.5v9L12 21l-7.8-4.5v-9Z"/><path d="M12 7v10M8 9l8 6M16 9l-8 6"/>',
    BTC: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="M12 12 4 7.5M12 12l8-4.5M12 12v9"/><path d="M9 10v4M15 10v4"/>',
    XMR: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
};
export function mineGlyph(id, cls = 'glyph') { return svg(P(GLYPHS[id]), cls); }
