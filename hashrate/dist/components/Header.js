import { h } from '../lib/dom.js';
import { short } from '../lib/format.js';
import { href } from '../lib/router.js';
import { BRAND } from '../config/brand.js';
import { data } from '../data/index.js';
import { icon, rigMark } from './Icons.js';
import { openPalette } from './CommandPalette.js';
import { connectWallet, disconnectWallet, onWallet, walletAddress } from './Wallet.js';
import { toast } from './Toasts.js';
const NAV = [['Mines', '/mines'], ['Launch', '/launch'], ['Ledger', '/ledger'], ['Docs', '/docs']];
function isDark() {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches;
}
export function header() {
    const navLinks = NAV.map(([label, path]) => h('a', { href: href(path), 'data-path': path }, label));
    const mobile = h('nav', { class: 'mobile-nav wrap', 'aria-label': 'Menu', 'data-open': 'false', id: 'mobile-nav' }, NAV.map(([label, path]) => h('a', { href: href(path), onclick: () => closeMenu() }, label)), h('a', { href: href('/link'), onclick: () => closeMenu() }, 'Link payout address'));
    const menuBtn = h('button', { class: 'iconbtn menu-btn', 'aria-label': 'Open menu', 'aria-expanded': 'false', 'aria-controls': 'mobile-nav', type: 'button' }, icon('menu'));
    const closeMenu = () => { mobile.setAttribute('data-open', 'false'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.replaceChildren(icon('menu')); };
    menuBtn.addEventListener('click', () => {
        const open = mobile.getAttribute('data-open') !== 'true';
        if (!open)
            return closeMenu();
        mobile.setAttribute('data-open', 'true');
        menuBtn.setAttribute('aria-expanded', 'true');
        menuBtn.replaceChildren(icon('close'));
    });
    const themeBtn = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Switch theme' }, isDark() ? icon('sun') : icon('moon'));
    themeBtn.addEventListener('click', () => {
        const next = isDark() ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try {
            localStorage.setItem('rig-theme', next);
        }
        catch { /* storage blocked */ }
        themeBtn.replaceChildren(next === 'dark' ? icon('sun') : icon('moon'));
        dispatchEvent(new CustomEvent('rig:theme'));
    });
    const walletTxt = h('span', { class: 'connect-txt' }, 'Connect');
    const walletBtn = h('button', { class: 'btn sm ghost', type: 'button', 'aria-label': 'Connect wallet' }, icon('wallet'), walletTxt);
    const paint = (a) => { walletTxt.textContent = a ? short(a, 4) : 'Connect'; walletBtn.setAttribute('aria-label', a ? `Wallet ${a}. Click to disconnect.` : 'Connect wallet'); };
    walletBtn.addEventListener('click', async () => {
        try {
            if (walletAddress())
                await disconnectWallet();
            else
                await connectWallet();
        }
        catch (e) {
            toast(e.message, true);
        }
    });
    onWallet(paint);
    const el = h('header', { class: 'hdr' }, h('div', { class: 'wrap hdr-row' }, h('a', { class: 'brand', href: href('/'), 'aria-label': `${BRAND.name} home` }, rigMark(), BRAND.name), h('nav', { class: 'nav', 'aria-label': 'Main' }, navLinks), h('span', { class: 'spacer' }), h('button', { class: 'search-btn', type: 'button', onclick: openPalette, 'aria-label': 'Search (Ctrl K)' }, icon('search'), h('span', { class: 'txt' }, 'Search coins'), h('kbd', null, '⌘K')), data().isDemo ? h('span', { class: 'pill warn demo-pill', title: 'All coins, prices and payouts on this site are simulated until launch.' }, 'DEMO DATA') : null, themeBtn, walletBtn, menuBtn), mobile);
    const mark = () => {
        const path = '/' + (location.hash.replace(/^#\/?/, '').split('/')[0] || '');
        navLinks.forEach((a) => {
            const p = a.getAttribute('data-path');
            const on = path === p || (p === '/mines' && path === '/mine');
            if (on)
                a.setAttribute('aria-current', 'page');
            else
                a.removeAttribute('aria-current');
        });
        closeMenu();
    };
    addEventListener('hashchange', mark);
    mark();
    return el;
}
export function footer() {
    return h('footer', { class: 'ftr' }, h('div', { class: 'wrap' }, h('div', { class: 'ftr-row' }, h('div', { class: 'brand', style: 'font-size:18px' }, rigMark(), BRAND.name), h('nav', { 'aria-label': 'Footer' }, NAV.map(([l, p]) => h('a', { href: href(p) }, l)), h('a', { href: href('/link') }, 'Link payout'), BRAND.x ? h('a', { href: BRAND.x, target: '_blank', rel: 'noopener' }, 'X') : null, BRAND.telegram ? h('a', { href: BRAND.telegram, target: '_blank', rel: 'noopener' }, 'Telegram') : null)), h('p', { class: 'risk' }, BRAND.riskLine, data().isDemo ? ' This site is showing demo data: every coin, price and payout is simulated.' : '')));
}
