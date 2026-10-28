import { h } from '../lib/dom.js';
import { usd, ago, num } from '../lib/format.js';
import { href } from '../lib/router.js';
import { targetById } from '../config/targets.js';
import { avatar, sparkline, mineChip, pctText } from './Bits.js';
import { icon } from './Icons.js';
import { toast } from './Toasts.js';
import { minedText } from './CoinCard.js';
import { data } from '../data/index.js';
function minedUsd(c) {
    const px = data().prices();
    const v = Object.entries(c.mined24h).reduce((s, [ch, a]) => s + a * (px[ch] ?? NaN), 0);
    return Number.isFinite(v) && Object.keys(c.mined24h).length ? usd(v, true) : '—';
}
const QUICK_SOL = 0.5;
/** Axiom-dense token row: identity, age, mcap, vol, holders, top-10 %, dev %, socials, mine chip, mined 24h, quick-buy. */
export function pulseRow(c) {
    const t = targetById(c.target);
    const socials = h('span', { class: 'soc', 'aria-label': 'Links' }, c.socials.x ? h('a', { href: c.socials.x, target: '_blank', rel: 'noopener', 'aria-label': 'X', onclick: (e) => e.stopPropagation() }, icon('x')) : null, c.socials.tg ? h('a', { href: c.socials.tg, target: '_blank', rel: 'noopener', 'aria-label': 'Telegram', onclick: (e) => e.stopPropagation() }, icon('send')) : null, c.socials.web ? h('a', { href: c.socials.web, target: '_blank', rel: 'noopener', 'aria-label': 'Website', onclick: (e) => e.stopPropagation() }, icon('globe')) : null);
    const quick = h('button', { class: 'quick', type: 'button', 'aria-label': `Quick buy ${QUICK_SOL} SOL of ${c.ticker} (demo)`,
        onclick: (e) => { e.preventDefault(); e.stopPropagation(); toast(`Quick buy is a demo. Trade $${c.ticker} on pump.fun.`); } }, icon('bolt'), `${QUICK_SOL}`);
    const row = h('a', { class: 'prow', href: href(`/coin/${c.mint}`), 'data-mint': c.mint }, avatar(c), h('div', { style: 'min-width:0' }, h('div', { class: 'pname' }, h('b', null, c.name), h('span', null, `$${c.ticker}`)), h('div', { class: 'pmeta' }, h('span', { class: 'faint' }, ago(c.createdAt)), h('span', { title: 'Volume 24h' }, `V ${usd(c.volume24h, true)}`), h('span', { title: 'Holders' }, `H ${Number.isFinite(c.holders) ? num(c.holders, 0) : '—'}`), h('span', { title: 'Top 10 wallets' }, `T10 ${pctText(c.top10Pct)}`), h('span', { title: 'Creator holds' }, `DEV ${pctText(c.devPct)}`), socials, mineChip(c.target), h('span', { class: 'mined', title: `Mined + bought 24h: ${minedText(c)}` }, icon('pick'), ' ', minedUsd(c)))), h('div', { class: 'pright' }, h('b', { class: 'num', 'data-mcap': '' }, usd(c.mcapUsd, true)), h('span', { class: c.change24h >= 0 ? 'up' : 'down' }, Number.isFinite(c.change24h) ? `${c.change24h >= 0 ? '▲' : '▼'} ${Math.abs(c.change24h).toFixed(0)}%` : '—'), quick), h('div', { class: 'mini', 'aria-hidden': 'true' }, sparkline(c.spark, 'spark', undefined)));
    row.querySelector('.mini .spark')?.setAttribute('style', 'width:100%;height:100%');
    return row;
}
/** Update the numbers in place so the row can flash instead of re-rendering. */
export function updatePulseRow(row, c) {
    const m = row.querySelector('[data-mcap]');
    if (m)
        m.textContent = usd(c.mcapUsd, true);
}
