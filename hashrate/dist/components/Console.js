import { h, onUnmount } from '../lib/dom.js';
import { num, usd, ago } from '../lib/format.js';
import { rollTo, enter } from '../lib/motion.js';
import { href } from '../lib/router.js';
import { TARGETS, targetById } from '../config/targets.js';
import { data } from '../data/index.js';
import { fmtSmall } from './CoinCard.js';
import { mineGlyph, icon } from './Icons.js';
/** Hero panel: live hashrate per mine, the last few events, and the totals. Plain HTML, no scroll tricks. */
export function consolePanel() {
    const d = data();
    const refs = new Map();
    const rows = TARGETS.map((t) => {
        const bar = h('i', { style: 'width:0%' }), rate = h('span', { class: 'con-rate num' }, '—'), mined = h('span', { class: 'con-mined num' }, '—');
        refs.set(t.id, { bar, rate, mined });
        return h('a', { class: 'con-row', href: href(`/mine/${t.slug}`), style: `--mc: var(${t.accent})` }, h('span', { class: 'con-id' }, mineGlyph(t.id, 'ico'), h('b', null, t.label), h('small', null, t.algo)), h('span', { class: 'con-bar' }, bar), rate, mined);
    });
    const feed = h('ul', { class: 'con-feed', 'aria-live': 'polite' });
    const tots = { fees: h('b', { class: 'num' }), paid: h('b', { class: 'num gold' }), blocks: h('b', { class: 'num' }) };
    const live = h('span', { class: 'pill live' }, h('span', { class: 'dot' }), 'live');
    const paint = () => {
        const stats = d.targets();
        const max = Math.max(1, ...stats.map((s) => (Number.isFinite(s.rentedUsd24h) ? s.rentedUsd24h : 0)));
        for (const s of stats) {
            const t = targetById(s.id), r = refs.get(s.id);
            r.bar.style.width = `${Number.isFinite(s.rentedUsd24h) ? Math.max(4, (s.rentedUsd24h / max) * 100) : 4}%`;
            rollTo(r.rate, s.hashrate, (n) => (Number.isFinite(n) ? `${num(n, n >= 100 ? 0 : 2)} ${t.unit}` : '—'));
            r.mined.textContent = t.chains.map((ch) => `${fmtSmall(s.mined24h[ch] ?? NaN)} ${ch}`).join(' + ');
        }
        const tt = d.totals();
        rollTo(tots.fees, tt.feesRoutedUsd, (n) => (Number.isFinite(n) ? usd(n, true) : '—'));
        rollTo(tots.paid, tt.paidUsd, (n) => (Number.isFinite(n) ? usd(n, true) : '—'));
        rollTo(tots.blocks, tt.blocksHit, (n) => num(Math.round(n), 0));
    };
    const feedRow = (a) => h('li', null, h('span', { class: `kind ${a.kind}` }, icon(a.kind === 'block' ? 'cube' : a.kind === 'payout' || a.kind === 'mined' ? 'coins' : a.kind === 'rent' ? 'pick' : a.kind === 'launch' ? 'plus' : a.kind === 'buy' ? 'up' : 'down')), h('span', { class: 'con-text' }, a.mint ? h('a', { href: href(`/coin/${a.mint}`) }, a.text) : a.text), h('time', { class: 'faint' }, ago(a.ts)));
    feed.append(...d.activity(6).map(feedRow));
    paint();
    const off = d.subscribe((a) => {
        if (!a) {
            paint();
            return;
        }
        const r = feedRow(a);
        feed.prepend(r);
        enter(r);
        while (feed.children.length > 6)
            feed.lastChild.remove();
    });
    onUnmount(off);
    return h('div', { class: 'console panel', 'aria-label': 'Live mining console' }, h('div', { class: 'panel-head' }, h('span', { class: 'label' }, 'Rack 01 · rented hashpower'), live), h('div', { class: 'con-rows' }, h('div', { class: 'con-row con-head' }, h('span', null, 'Mine'), h('span', null, 'Share of rentals'), h('span', { style: 'text-align:right' }, 'Hashrate'), h('span', { style: 'text-align:right' }, 'Mined + bought 24h')), rows), h('div', { class: 'con-split' }, h('div', { class: 'con-totals' }, h('div', null, h('span', { class: 'label' }, 'Fees routed'), tots.fees), h('div', null, h('span', { class: 'label' }, 'Paid to holders'), tots.paid), h('div', null, h('span', { class: 'label' }, 'Blocks hit'), tots.blocks)), feed));
}
