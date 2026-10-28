import { h } from '../lib/dom.js';
import { num } from '../lib/format.js';
import { TARGETS } from '../config/targets.js';
import { data } from '../data/index.js';
/** Ticker: hashrate per mine, blocks hit, recent payouts (gold). The moving track is aria-hidden; the rail carries the accessible list. */
export function tickerTape() {
    const d = data();
    const track = h('div', { class: 'ticker-track', 'aria-hidden': 'true' });
    const build = () => {
        const stats = d.targets();
        const items = [];
        for (const s of stats) {
            const t = TARGETS.find((x) => x.id === s.id);
            items.push(h('span', { class: 'ticker-item' }, h('span', { style: `color:var(${t.accent})` }, '■'), t.label, h('b', null, Number.isFinite(s.hashrate) ? `${num(s.hashrate, s.hashrate >= 100 ? 0 : 2)} ${t.unit}` : '—'), `${s.blocksHit} blocks`));
        }
        for (const a of d.activity(40).filter((x) => x.kind === 'payout' || x.kind === 'block').slice(0, 6)) {
            items.push(h('span', { class: 'ticker-item' }, h('span', { class: 'gold' }, '●'), h('b', { class: a.kind === 'payout' ? 'gold' : '' }, a.text)));
        }
        const px = d.prices();
        for (const k of ['DOGE', 'LTC', 'ZEC', 'KAS', 'BTC', 'XMR'])
            if (px[k])
                items.push(h('span', { class: 'ticker-item' }, k, h('b', null, `$${num(px[k], px[k] < 1 ? 4 : 2)}`)));
        track.replaceChildren(...items, ...items.map((n) => n.cloneNode(true)));
    };
    build();
    window.setInterval(build, 20000);
    return h('div', { class: 'ticker' }, track);
}
