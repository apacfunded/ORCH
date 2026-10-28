import { h, onUnmount } from '../lib/dom.js';
import { amount, short } from '../lib/format.js';
import { href } from '../lib/router.js';
import { data } from '../data/index.js';
import { emptyState } from '../components/Bits.js';
const KIND_LABEL = { claim: 'Fees claimed', split: 'Fees split', rent: 'Hashpower rented', mined: 'Mined', buy: 'Bought directly', payout: 'Paid holders' };
export function ledgerPage() {
    const d = data();
    let kind = 'all';
    const tbody = h('tbody');
    const fmtTime = (ts) => new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const cell = (label, cls, ...kids) => h('td', { class: cls, 'data-l': label }, ...kids);
    const ledgerRow = (e) => h('tr', { class: e.kind === 'payout' ? 'payout' : '' }, cell('Time', 'mono muted', fmtTime(e.ts)), cell('What', '', h('span', { class: `pill ${e.kind === 'payout' ? 'gold' : e.kind === 'mined' ? 'gold' : ''}` }, KIND_LABEL[e.kind] ?? e.kind)), cell('Coin', '', e.mint ? h('a', { href: href(`/coin/${e.mint}`), class: 'mono' }, e.ticker ? `$${e.ticker}` : short(e.mint, 4)) : h('span', { class: 'muted' }, '—')), cell('Chain', 'mono', e.chain ?? ''), cell('Amount', `r mono ${e.kind === 'payout' || e.kind === 'mined' ? 'gold' : ''}`, amount(e.amount, e.unit)), cell('Status', '', h('span', { class: `pill ${e.status === 'done' ? 'live' : 'warn'}` }, e.status)), cell('Note', 'muted', e.note ?? ''), cell('Ref', 'mono faint', e.ref ? short(e.ref, 5) : ''));
    const paint = () => {
        const rows = d.ledger(300).filter((e) => kind === 'all' || e.kind === kind);
        tbody.replaceChildren(...(rows.length ? rows.slice(0, 150).map(ledgerRow) : [h('tr', null, h('td', { colspan: '8' }, emptyState('Nothing logged yet for this filter.')))]));
    };
    paint();
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter the ledger' }, ['all', 'rent', 'mined', 'buy', 'payout'].map((k) => h('button', { type: 'button', 'aria-pressed': String(k === kind), onclick: (ev) => {
            kind = k;
            seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget)));
            paint();
        } }, k === 'all' ? 'All' : KIND_LABEL[k])));
    let n = 0;
    const off = d.subscribe((a) => { if (a && ++n % 2 === 0)
        paint(); });
    onUnmount(off);
    return h('div', { class: 'page tight' }, h('div', { class: 'sec-head' }, h('div', { class: 'page-title' }, h('span', { class: 'eyebrow' }, 'Ledger'), h('h1', { style: 'margin-top:10px' }, 'Every SOL, every satoshi'), h('p', null, 'The public log of fees claimed, hashpower rented, coins mined, direct buys and payouts. “Pending” rows are recorded by hand or waiting to be sent.')), seg), h('div', { class: 'panel tablewrap' }, h('table', { class: 't cards' }, h('thead', null, h('tr', null, ['Time', 'What', 'Coin', 'Chain', 'Amount', 'Status', 'Note', 'Ref'].map((x, i) => h('th', { class: i === 4 ? 'r' : '' }, x)))), tbody)));
}
