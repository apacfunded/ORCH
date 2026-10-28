import { h, onUnmount } from '../lib/dom.js';
import { countdown, num, short, usd } from '../lib/format.js';
import { href } from '../lib/router.js';
import { targetById } from '../config/targets.js';
import { FEES, pct } from '../config/fees.js';
import { data } from '../data/index.js';
import { fmtSmall } from './CoinCard.js';
import { copyText } from './Toasts.js';
import { icon, mineGlyph } from './Icons.js';
/** Fee split bar: $HASH cut, rent share, buy share. Returns the element and an updater. */
export function feeSplitBar(rentShare) {
    const cut = FEES.rigCut ?? 0;
    const bar = h('div', { class: 'split-bar', 'aria-hidden': 'true' });
    const legend = h('div', { class: 'legend' });
    const set = (rs) => {
        const rent = (1 - cut) * rs, buy = (1 - cut) * (1 - rs);
        bar.replaceChildren(h('i', { style: `width:${cut * 100}%` }), h('u', { style: `width:${rent * 100}%` }), h('s', { style: `width:${buy * 100}%` }));
        legend.replaceChildren(h('span', { style: '--c: var(--faint)' }, `$HASH ${pct(FEES.rigCut)}`), h('span', { style: '--c: var(--accent)' }, `Rent ${Math.round(rent * 100)}%`), h('span', { style: '--c: var(--gold)' }, `Buy direct ${Math.round(buy * 100)}%`));
    };
    set(rentShare);
    return { el: h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, bar, legend), set };
}
/** The coin's mine: payout countdown as the hero number, hashrate, earned, pot, split, link CTA. */
export function rigPanel(c) {
    const t = targetById(c.target);
    const cd = h('div', { class: 'countdown', 'aria-live': 'off' }, countdown(c.nextPayoutAt - Date.now()));
    const rate = h('dd', null, Number.isFinite(c.hashrate) ? `${num(c.hashrate, 2)} ${t.unit}` : '—');
    const potsEl = h('dd', { class: 'gold' });
    const drawPots = () => { potsEl.textContent = t.chains.map((ch) => `${fmtSmall(c.pots[ch] ?? NaN)} ${ch}`).join(' + '); };
    drawPots();
    const timer = window.setInterval(() => {
        cd.textContent = countdown(c.nextPayoutAt - Date.now());
        rate.textContent = Number.isFinite(c.hashrate) ? `${num(c.hashrate, 2)} ${t.unit}` : '—';
        drawPots();
    }, 1000);
    onUnmount(() => clearInterval(timer));
    const px = data().prices();
    const earnedUsd = t.chains.reduce((s, ch) => s + (c.mined24h[ch] ?? NaN) * (px[ch] ?? NaN), 0);
    return h('section', { class: 'panel rig-panel', style: `--mc: var(${t.accent})`, 'aria-labelledby': 'rig-h' }, h('div', { class: 'panel-head' }, h('h3', { id: 'rig-h' }, 'Rig'), h('a', { class: 'chip', style: `--mc: var(${t.accent})`, href: href(`/mine/${t.slug}`) }, mineGlyph(t.id, 'ico'), `${t.label} · ${t.algo}`)), h('div', { class: 'panel-body', style: 'display:flex;flex-direction:column;gap:16px' }, h('div', null, h('div', { class: 'label' }, 'Next payout'), cd, h('p', { class: 'note', style: 'margin-top:6px' }, `Every ${FEES.payoutEveryHours}h to holders who linked a ${t.chains.join(' / ')} address.`)), h('dl', { class: 'kv' }, h('dt', null, 'Hashrate rented now'), rate, h('dt', null, 'Mined + bought, 24h'), h('dd', { class: 'gold' }, t.chains.map((ch) => `${fmtSmall(c.mined24h[ch] ?? NaN)} ${ch}`).join(' + ')), h('dt', null, '≈ value, 24h'), h('dd', null, Number.isFinite(earnedUsd) ? usd(earnedUsd) : '—'), h('dt', null, 'Waiting in the pot'), potsEl, h('dt', null, 'Paid out, all time'), h('dd', { class: 'gold' }, t.chains.map((ch) => `${fmtSmall(c.paidOut[ch] ?? NaN)} ${ch}`).join(' + ')), h('dt', null, 'Fees routed, all time'), h('dd', null, Number.isFinite(c.feesEarnedUsd) ? usd(c.feesEarnedUsd) : '—')), h('div', null, h('div', { class: 'label', style: 'margin-bottom:8px' }, 'Where creator fees go'), feeSplitBar(c.rentShare).el), c.creatorWallet ? h('dl', { class: 'kv' }, h('dt', null, 'Creator wallet'), h('dd', null, h('button', { class: 'btn ghost sm', onclick: () => copyText(c.creatorWallet, 'Creator wallet copied'), title: c.creatorWallet }, short(c.creatorWallet, 5), icon('copy')))) : null, t.autoTracked ? null : h('p', { class: 'stub' }, `${t.label} mined amounts are recorded by hand for now, so they can lag a few hours.`), h('a', { class: 'btn block', href: href('/link') }, icon('link'), `Link a ${t.chains.join(' / ')} payout address`)));
}
