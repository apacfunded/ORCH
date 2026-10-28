import { h } from '../lib/dom.js';
import { linkFlow } from '../components/LinkFlow.js';
export function linkPage() {
    return h('div', { class: 'page tight narrow' }, h('div', { class: 'page-title' }, h('span', { class: 'eyebrow' }, 'Payouts'), h('h1', { style: 'margin-top:10px' }, 'Link a payout address'), h('p', null, 'Hashrate pays holders in the coin their mine produces: DOGE, LTC, ZEC, KAS, BTC or XMR. Add an address for each chain you want to be paid on. You can change it any time.')), h('section', { class: 'panel panel-body' }, linkFlow()), h('p', { class: 'note' }, 'Payouts go to linked holders by bag size. If your share is under the chain’s minimum, it carries to the next payout. Holders who never link an address aren’t paid on that chain. The coin’s creator wallet and the bonding curve are never paid.'));
}
