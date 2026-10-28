import { h } from '../lib/dom.js';
import { usd } from '../lib/format.js';
import { href, navigate } from '../lib/router.js';
import { TARGETS } from '../config/targets.js';
import { data } from '../data/index.js';
import { avatar } from './Bits.js';
import { icon } from './Icons.js';
/** Cmd/Ctrl+K search over coins, mine targets and pages. */
export function openPalette() {
    if (document.querySelector('.overlay.palette'))
        return;
    const prevFocus = document.activeElement;
    const input = h('input', { class: 'palette-input', type: 'search', placeholder: 'Search coins, tickers, mines or pages', 'aria-label': 'Search', autocomplete: 'off', id: 'palette-q' });
    const list = h('ul', { class: 'palette-list', role: 'listbox', id: 'palette-list' });
    let sel = 0;
    let items = [];
    const pages = [
        { label: 'Launch a coin', sub: 'Page', path: '/launch' }, { label: 'All mines', sub: 'Page', path: '/mines' },
        { label: 'Ledger', sub: 'Page', path: '/ledger' }, { label: 'Link payout address', sub: 'Page', path: '/link' }, { label: 'Docs', sub: 'Page', path: '/docs' },
    ];
    const render = () => {
        const q = input.value.trim().toLowerCase().replace(/^\$/, '');
        const coins = data().coins().filter((c) => !q || c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q) || c.mint.toLowerCase().startsWith(q)).slice(0, 8)
            .map((c) => ({ label: `${c.name} · $${c.ticker}`, sub: usd(c.mcapUsd, true), path: `/coin/${c.mint}`, node: avatar(c) }));
        const mines = TARGETS.filter((t) => !q || t.label.toLowerCase().includes(q) || t.algo.toLowerCase().includes(q)).map((t) => ({ label: `Mine: ${t.label}`, sub: t.algo, path: `/mine/${t.slug}` }));
        const pg = pages.filter((p) => !q || p.label.toLowerCase().includes(q));
        items = [...coins, ...mines, ...pg];
        sel = Math.min(sel, Math.max(0, items.length - 1));
        list.replaceChildren(...(items.length ? items.map((it, i) => h('li', null, h('a', { href: href(it.path), role: 'option', 'aria-selected': String(i === sel), id: `pal-${i}`, onclick: close }, it.node ?? h('span', { class: 'kind rent' }, icon('arrow')), h('span', { style: 'flex:1' }, it.label), h('span', { class: 'muted mono' }, it.sub)))) :
            [h('li', { class: 'muted', style: 'padding:14px' }, 'Nothing matches. Try a ticker like DIGGER or a mine like ZEC.')]));
        input.setAttribute('aria-activedescendant', `pal-${sel}`);
    };
    const close = () => { overlay.remove(); prevFocus?.focus(); };
    const overlay = h('div', { class: 'overlay palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Search',
        onclick: (e) => { if (e.target === overlay)
            close(); } }, h('div', { class: 'dialog' }, input, list));
    input.addEventListener('input', () => { sel = 0; render(); });
    overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
        else if (e.key === 'ArrowDown') {
            e.preventDefault();
            sel = Math.min(items.length - 1, sel + 1);
            render();
        }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            sel = Math.max(0, sel - 1);
            render();
        }
        else if (e.key === 'Enter' && items[sel]) {
            e.preventDefault();
            navigate(items[sel].path);
            close();
        }
        else if (e.key === 'Tab') {
            e.preventDefault();
            input.focus();
        } // focus stays in the palette
    });
    document.body.append(overlay);
    render();
    input.focus();
}
export function bindPaletteShortcut() {
    addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            openPalette();
        }
        else if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
            e.preventDefault();
            openPalette();
        }
    });
}
