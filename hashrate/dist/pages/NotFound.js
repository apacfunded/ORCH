import { h, svg } from '../lib/dom.js';
import { href } from '../lib/router.js';
/** An empty rack unit: no LEDs lit. */
function emptyUnit() {
    return svg(`<svg viewBox="0 0 320 90" class="unit-svg" style="--mc: var(--faint)">
    <rect x="1" y="1" width="318" height="88" rx="10" fill="var(--surface)" stroke="var(--line-2)"/>
    <rect x="22" y="22" width="150" height="9" rx="4.5" fill="var(--line-2)"/><rect x="22" y="40" width="110" height="9" rx="4.5" fill="var(--line-2)"/><rect x="22" y="58" width="180" height="9" rx="4.5" fill="var(--line)"/>
    <circle class="led" cx="270" cy="30" r="5"/><circle class="led" cx="290" cy="30" r="5"/><circle class="led" cx="270" cy="52" r="5"/><circle class="led" cx="290" cy="52" r="5"/>
  </svg>`, 'unit-svg');
}
export function notFoundPage() {
    return h('div', { class: 'page', style: 'align-items:flex-start;padding-block:60px' }, emptyUnit(), h('span', { class: 'eyebrow' }, 'Error 404'), h('h1', { style: 'font-size:clamp(48px,8vw,96px)' }, 'Nothing mined here'), h('p', { class: 'muted', style: 'max-width:50ch' }, 'This page doesn’t exist, or the coin isn’t listed on Hashrate. Check the link, or search with ⌘K.'), h('a', { class: 'btn', href: href('/') }, 'Back to the rack'));
}
