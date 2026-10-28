import { h } from '../lib/dom.js';
let host = null;
export function toast(msg, bad = false, ms = 3600) {
    if (!host) {
        host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
        document.body.append(host);
    }
    const t = h('div', { class: `toast${bad ? ' bad' : ''}` }, msg);
    host.append(t);
    t.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 200 });
    setTimeout(() => { t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 }).onfinish = () => t.remove(); }, ms);
}
export async function copyText(text, label = 'Copied') {
    try {
        await navigator.clipboard.writeText(text);
        toast(label);
    }
    catch {
        toast('Copy failed. Select the text and copy it by hand.', true);
    }
}
