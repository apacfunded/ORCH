import { h, onUnmount } from '../lib/dom.js';
import { num, usd } from '../lib/format.js';
import { href } from '../lib/router.js';
import { TARGETS, targetBySlug } from '../config/targets.js';
import { data } from '../data/index.js';
import { coinCard, fmtSmall } from '../components/CoinCard.js';
import { activityRail } from '../components/ActivityRail.js';
import { sparkline, emptyState } from '../components/Bits.js';
import { icon, mineGlyph } from '../components/Icons.js';
import { notFoundPage } from './NotFound.js';
export function minesPage() {
    const d = data();
    const panels = () => d.targets().map((s, i) => {
        const t = TARGETS.find((x) => x.id === s.id);
        return h('a', { class: 'card mpanel spot reveal', href: href(`/mine/${t.slug}`), style: `--mc: var(${t.accent}); --i:${i}` }, h('div', { style: 'display:flex;flex-direction:column;gap:10px;min-width:0' }, h('div', { style: 'display:flex;align-items:center;gap:12px' }, mineGlyph(t.id), h('div', null, h('h3', null, t.label), h('span', { class: 'label', style: 'color:var(--mc)' }, t.algo))), h('p', { class: 'muted', style: 'font-size:14px' }, t.blurb), h('dl', { class: 'kv', style: 'max-width:320px' }, h('dt', null, 'Coins mining'), h('dd', null, String(s.coins)), h('dt', null, 'Hashrate now'), h('dd', null, Number.isFinite(s.hashrate) ? `${num(s.hashrate, 2)} ${t.unit}` : '—'), h('dt', null, 'Mined + bought 24h'), h('dd', { class: 'gold' }, t.chains.map((ch) => `${fmtSmall(s.mined24h[ch] ?? NaN)} ${ch}`).join(' + ')), h('dt', null, 'Blocks hit'), h('dd', null, String(s.blocksHit))), t.autoTracked ? h('span', { class: 'pill live', style: 'align-self:flex-start' }, 'tracked automatically') : h('span', { class: 'pill warn', style: 'align-self:flex-start' }, 'recorded by hand for now')), h('div', { style: 'display:flex;flex-direction:column;gap:6px;justify-content:center' }, h('span', { class: 'label' }, 'Hashrate, last 24 samples'), sparkline(s.hashSeries, 'spark', `var(${t.accent})`)));
    });
    const grid = h('div', { class: 'mpanels' }, panels());
    let n = 0;
    const off = d.subscribe((a) => { if (!a && ++n % 6 === 0)
        grid.replaceChildren(...panels().map((p) => { p.classList.add('in'); return p; })); });
    onUnmount(off);
    return h('div', { class: 'page' }, h('div', { class: 'page-title' }, h('span', { class: 'eyebrow' }, 'Mines'), h('h1', { style: 'margin-top:10px' }, 'Five rigs, one rack'), h('p', null, 'Every coin mines one target. Rentals for the same target are pooled into one order, and what’s mined is shared back by what each coin spent.')), grid);
}
export function minePage(slug) {
    const t = targetBySlug(slug);
    if (!t)
        return notFoundPage();
    const d = data();
    let sort = 'mcap';
    const grid = h('div', { class: 'grid-coins' });
    const statsBox = h('div', { class: 'strip' });
    const paint = () => {
        const s = d.targets().find((x) => x.id === t.id);
        const px = d.prices();
        const earned = (c) => t.chains.reduce((v, ch) => v + (c.mined24h[ch] ?? 0) * (px[ch] ?? 0), 0);
        const cs = d.coins().filter((c) => c.target === t.id);
        cs.sort((a, b) => sort === 'new' ? b.createdAt - a.createdAt : sort === 'earned' ? earned(b) - earned(a) : (b.mcapUsd || 0) - (a.mcapUsd || 0));
        grid.replaceChildren(...(cs.length ? cs.map(coinCard) : [emptyState(`No coins mine ${t.label} yet.`, h('a', { class: 'btn sm', href: href('/launch') }, `Launch the first ${t.label} coin`))]));
        statsBox.replaceChildren(h('div', null, h('span', { class: 'label' }, 'Hashrate now'), h('strong', null, Number.isFinite(s.hashrate) ? `${num(s.hashrate, 2)} ${t.unit}` : '—')), h('div', null, h('span', { class: 'label' }, 'Rented 24h'), h('strong', null, usd(s.rentedUsd24h, true))), h('div', null, h('span', { class: 'label' }, 'Mined + bought 24h'), h('strong', { class: 'gold', style: 'font-size:20px' }, t.chains.map((ch) => `${fmtSmall(s.mined24h[ch] ?? NaN)} ${ch}`).join(' + '))), h('div', null, h('span', { class: 'label' }, 'Blocks hit'), h('strong', null, String(s.blocksHit))));
    };
    paint();
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Sort coins' }, ['mcap', 'earned', 'new'].map((k) => h('button', { type: 'button', 'aria-pressed': String(k === sort), onclick: (e) => {
            sort = k;
            seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
            paint();
        } }, k === 'mcap' ? 'Market cap' : k === 'earned' ? 'Top earners' : 'Newest')));
    let n = 0;
    const off = d.subscribe((a) => { if (!a && ++n % 3 === 0)
        paint(); if (a?.kind === 'launch')
        paint(); });
    onUnmount(off);
    return h('div', { class: 'page', style: `--mc: var(${t.accent})` }, h('div', { class: 'mine-hero' }, h('a', { href: href('/mines'), class: 'label', style: 'display:inline-flex;gap:6px;align-items:center' }, icon('back'), 'All mines'), h('div', { class: 'sec-head', style: 'margin-top:14px' }, h('div', { style: 'display:flex;gap:16px;align-items:center' }, mineGlyph(t.id, 'glyph'), h('div', null, h('span', { class: 'label', style: 'color:var(--mc)' }, `${t.algo} · pays ${t.chains.join(' + ')}`), h('h1', { style: 'font-size:clamp(48px,7vw,96px);margin-top:4px' }, t.label), h('p', { class: 'muted', style: 'margin-top:10px;max-width:60ch' }, t.blurb))), h('a', { class: 'btn magnetic', href: href('/launch') }, `Launch a ${t.label} coin`, icon('arrow')))), statsBox, t.autoTracked ? null : h('p', { class: 'stub' }, `${t.label} mined amounts are recorded by hand for now, so figures can lag a few hours.`), h('div', { class: 'with-rail' }, h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h2', null, `Coins mining ${t.label}`), seg), grid), activityRail((a) => !!a.mint && d.coin(a.mint)?.target === t.id, `${t.label} activity`)));
}
