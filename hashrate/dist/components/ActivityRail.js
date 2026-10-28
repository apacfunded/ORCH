import { h, onUnmount } from '../lib/dom.js';
import { ago } from '../lib/format.js';
import { enter } from '../lib/motion.js';
import { href } from '../lib/router.js';
import { data } from '../data/index.js';
import { icon } from './Icons.js';
const GLYPH = { buy: 'up', sell: 'down', rent: 'pick', launch: 'plus', mined: 'coins', payout: 'coins', block: 'cube' };
function railRow(a) {
    const text = a.mint ? h('a', { href: href(`/coin/${a.mint}`) }, a.text) : h('span', null, a.text);
    return h('li', null, h('span', { class: `kind ${a.kind}`, title: a.kind }, icon(GLYPH[a.kind] ?? 'info')), h('div', null, text, h('time', { datetime: new Date(a.ts).toISOString(), 'data-ts': a.ts }, ago(a.ts))));
}
export function activityRail(filter, title = 'Live activity') {
    const d = data();
    const list = h('ul', { class: 'rail-list', 'aria-live': 'polite' });
    list.append(...d.activity(40).filter((a) => !filter || filter(a)).slice(0, 30).map(railRow));
    const off = d.subscribe((a) => {
        if (!a || (filter && !filter(a)))
            return;
        const row = railRow(a);
        list.prepend(row);
        enter(row);
        while (list.children.length > 40)
            list.lastChild.remove();
    });
    const clock = window.setInterval(() => list.querySelectorAll('time[data-ts]').forEach((t) => { t.textContent = ago(Number(t.dataset.ts)); }), 5000);
    onUnmount(() => { off(); clearInterval(clock); });
    return h('aside', { class: 'panel rail', 'aria-label': title }, h('div', { class: 'panel-head' }, h('h3', null, title), h('span', { class: 'pill live' }, h('span', { class: 'dot' }), 'live')), list);
}
