import { h, runCleanups } from './lib/dom.js';
import { startRouter } from './lib/router.js';
import { initMotion, observeReveals, bindPointerEffects } from './lib/motion.js';
import { BRAND } from './config/brand.js';
import { data } from './data/index.js';
import { header, footer } from './components/Header.js';
import { tickerTape } from './components/TickerTape.js';
import { mountGrain, trackChromeHeight } from './components/Background.js';
import { bindPaletteShortcut } from './components/CommandPalette.js';
import { skeletonRows } from './components/Bits.js';
import { homePage } from './pages/Home.js';
import { minesPage, minePage } from './pages/Mines.js';
import { coinPage } from './pages/Coin.js';
import { launchPage } from './pages/Launch.js';
import { ledgerPage } from './pages/Ledger.js';
import { linkPage } from './pages/Link.js';
import { docsPage } from './pages/Docs.js';
import { notFoundPage } from './pages/NotFound.js';
const TITLES = { mines: 'Mines', launch: 'Launch', ledger: 'Ledger', link: 'Link payout address', docs: 'Docs', '404': 'Not found' };
async function boot() {
    initMotion();
    const app = document.getElementById('app');
    const main = h('main', { class: 'wrap', id: 'main', tabindex: '-1' });
    // Skeleton only if the data source takes longer than 300ms (the live adapter).
    const d = data();
    const sk = setTimeout(() => { if (!main.hasChildNodes())
        main.append(h('div', { class: 'page' }, h('div', { class: 'skeleton', style: 'height:48px;width:40%' }), skeletonRows(5))); }, 300);
    app.replaceChildren(h('a', { href: '#main', class: 'sr-only' }, 'Skip to content'), header(), tickerTape(), main, footer());
    mountGrain();
    trackChromeHeight();
    bindPaletteShortcut();
    await d.ready().catch(() => { });
    clearTimeout(sk);
    startRouter((r) => {
        runCleanups();
        let page;
        switch (r.name) {
            case 'home':
                page = homePage();
                break;
            case 'mines':
                page = minesPage();
                break;
            case 'mine':
                page = minePage(r.params.slug);
                break;
            case 'coin':
                page = coinPage(r.params.mint);
                break;
            case 'launch':
                page = launchPage();
                break;
            case 'ledger':
                page = ledgerPage();
                break;
            case 'link':
                page = linkPage();
                break;
            case 'docs':
                page = docsPage();
                break;
            default: page = notFoundPage();
        }
        main.replaceChildren(page);
        const c = r.name === 'coin' ? d.coin(r.params.mint) : undefined;
        document.title = c ? `$${c.ticker} · ${BRAND.name}` : TITLES[r.name] ? `${TITLES[r.name]} · ${BRAND.name}` : BRAND.name;
        scrollTo({ top: 0 });
        observeReveals(main);
        bindPointerEffects(main);
        // Anything already in view on arrival reveals at once; late-added rows handle themselves.
        requestAnimationFrame(() => observeReveals(main));
    });
}
boot();
