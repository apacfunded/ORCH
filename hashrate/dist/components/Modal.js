import { h } from '../lib/dom.js';
import { icon } from './Icons.js';
/** Accessible modal: focus trapped inside, restored on close, Escape and backdrop close it. */
export function openModal(title, body, opts = {}) {
    const prev = document.activeElement;
    const closeBtn = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close' }, icon('close'));
    const dialog = h('div', { class: `dialog ${opts.small ? 'sm' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-h' }, h('header', null, h('h2', { id: 'modal-h' }, title), closeBtn), h('div', { class: 'body' }, body));
    const overlay = h('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay)
            close(); } }, dialog);
    const focusables = () => [...dialog.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')];
    const onKey = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
            return;
        }
        if (e.key !== 'Tab')
            return;
        const f = focusables();
        if (!f.length)
            return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        }
        else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };
    const close = () => { overlay.remove(); removeEventListener('keydown', onKey); prev?.focus(); };
    closeBtn.addEventListener('click', close);
    addEventListener('keydown', onKey);
    document.body.append(overlay);
    (focusables()[1] ?? closeBtn).focus();
    return { close };
}
