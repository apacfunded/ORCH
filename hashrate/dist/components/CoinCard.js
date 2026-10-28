import { h } from '../lib/dom.js';
import { usd, ago } from '../lib/format.js';
import { href } from '../lib/router.js';
import { targetById } from '../config/targets.js';
import { avatar, sparkline, mineChip, change } from './Bits.js';
export function fmtSmall(n) {
    if (!Number.isFinite(n))
        return '—';
    return n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : n >= 1 ? 2 : 4 });
}
export function minedText(c) {
    const t = targetById(c.target);
    const has = t.chains.some((ch) => Number.isFinite(c.mined24h[ch]));
    return has ? t.chains.map((ch) => `${fmtSmall(c.mined24h[ch] ?? NaN)} ${ch}`).join(' + ') : '—';
}
export function coinCard(c) {
    return h('a', { class: 'card coin-card spot', href: href(`/coin/${c.mint}`), 'aria-label': `${c.name}, $${c.ticker}` }, h('div', { class: 'cc-top' }, avatar(c), h('div', { class: 'cc-name' }, h('b', null, c.name), h('span', null, `$${c.ticker} · ${ago(c.createdAt)}`)), mineChip(c.target)), h('div', { class: 'cc-row' }, h('div', null, h('div', { class: 'label' }, 'Market cap'), h('div', { class: 'cc-mcap' }, usd(c.mcapUsd, true)), change(c.change24h)), sparkline(c.spark)), c.graduated ? h('span', { class: 'pill live' }, h('span', { class: 'dot' }), 'Graduated')
        : h('div', null, h('div', { class: 'bond', title: `${(c.bonding || 0).toFixed(0)}% of the bonding curve` }, h('i', { style: `width:${Math.min(100, c.bonding || 0)}%` })), h('div', { class: 'cc-foot', style: 'margin-top:6px' }, h('span', null, 'Bonding curve'), h('span', null, `${(c.bonding || 0).toFixed(0)}%`))), h('div', { class: 'cc-foot' }, h('span', null, 'Mined + bought 24h'), h('span', { class: 'gold' }, minedText(c))));
}
