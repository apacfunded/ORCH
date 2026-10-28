// What a coin's fees can mine. Must match TARGETS in the Rig backend.
export const TARGETS = [
    { id: 'LTC_DOGE', slug: 'ltc-doge', label: 'LTC + DOGE', algo: 'Scrypt', chains: ['LTC', 'DOGE'], unit: 'GH/s', accent: '--m-ltc-doge',
        blurb: 'Merged mining: one Scrypt rental earns Litecoin and Dogecoin at the same time.', tag: '2 payouts, 1 rental', autoTracked: true },
    { id: 'ZEC', slug: 'zec', label: 'ZEC', algo: 'Equihash', chains: ['ZEC'], unit: 'kSol/s', accent: '--m-zec',
        blurb: 'Private money, mined for holders. Pays to transparent, shielded or unified addresses.', tag: 'privacy coin', autoTracked: true },
    { id: 'KAS', slug: 'kas', label: 'KAS', algo: 'kHeavyHash', chains: ['KAS'], unit: 'TH/s', accent: '--m-kas',
        blurb: 'Kaspa makes ten blocks a second, so mined coins arrive steadily.', tag: 'fast blocks', autoTracked: false },
    { id: 'BTC', slug: 'btc', label: 'BTC', algo: 'SHA-256', chains: ['BTC'], unit: 'PH/s', accent: '--m-btc',
        blurb: 'The original chain. Rent in bursts and share whatever the pool pays.', tag: 'the classic', autoTracked: true },
    { id: 'XMR', slug: 'xmr', label: 'XMR', algo: 'RandomX', chains: ['XMR'], unit: 'kH/s', accent: '--m-xmr',
        blurb: 'Monero is private by default and mined on CPUs.', tag: 'CPU mined', autoTracked: false },
];
export const targetById = (id) => TARGETS.find((t) => t.id === id);
export const targetBySlug = (s) => TARGETS.find((t) => t.slug === s);
/** Format checks for payout addresses (same rules as the backend). */
export const ADDRESS_RULES = {
    BTC: [/^(1|3)[1-9A-HJ-NP-Za-km-z]{25,34}$/, /^bc1[02-9ac-hj-np-z]{11,87}$/],
    LTC: [/^[LM3][1-9A-HJ-NP-Za-km-z]{26,33}$/, /^ltc1[02-9ac-hj-np-z]{11,87}$/],
    DOGE: [/^[DA9][1-9A-HJ-NP-Za-km-z]{25,34}$/],
    ZEC: [/^t[13][1-9A-HJ-NP-Za-km-z]{33}$/, /^zs1[02-9ac-hj-np-z]{75}$/, /^u1[02-9ac-hj-np-z]{100,}$/],
    KAS: [/^kaspa:[02-9ac-hj-np-z]{61,63}$/],
    XMR: [/^[48][1-9A-HJ-NP-Za-km-z]{94}$/, /^4[1-9A-HJ-NP-Za-km-z]{105}$/],
};
export const ADDRESS_HINT = {
    BTC: 'Starts with 1, 3 or bc1', LTC: 'Starts with L, M or ltc1', DOGE: 'Starts with D',
    ZEC: 'Starts with t1, zs1 or u1', KAS: 'Starts with kaspa:', XMR: 'Starts with 4 or 8',
};
export function isValidAddress(chain, a) {
    return (ADDRESS_RULES[chain] ?? []).some((r) => r.test(a.trim()));
}
