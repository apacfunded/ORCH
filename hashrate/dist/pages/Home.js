import { h, onUnmount } from '../lib/dom.js';
import { usd, num, ago } from '../lib/format.js';
import { rollTo, enter, flashRow, maskedLines } from '../lib/motion.js';
import { href } from '../lib/router.js';
import { BRAND } from '../config/brand.js';
import { targetById } from '../config/targets.js';
import { FEES, pct } from '../config/fees.js';
import { data } from '../data/index.js';
import { consolePanel } from '../components/Console.js';
import { activityRail } from '../components/ActivityRail.js';
import { avatar, mineChip, sparkline, sectionHead, emptyState } from '../components/Bits.js';
import { fmtSmall } from '../components/CoinCard.js';
import { pulseRow, updatePulseRow } from '../components/PulseRow.js';
import { feesFlowSection } from '../components/FeesFlow.js';
import { icon, mineGlyph } from '../components/Icons.js';
export function homePage() {
    const d = data();
    const px = d.prices();
    const earnedUsd = (c) => Object.entries(c.mined24h).reduce((s, [ch, a]) => s + a * (px[ch] ?? 0), 0);
    // ---- hero ----
    const title = maskedLines(h('h1', { id: 'hero-h' }), ['Every coin', 'runs its', 'own mine.']);
    const hero = h('section', { class: 'hero', 'aria-labelledby': 'hero-h' }, h('div', { class: 'hero-copy' }, h('span', { class: 'eyebrow' }, `pump.fun launchpad · $${BRAND.ticker}`), title, h('p', { class: 'lede' }, 'Launch on pump.fun. Fees rent real hashpower. Holders get paid in what’s mined.'), h('div', { class: 'ctas' }, h('a', { class: 'btn magnetic', href: href('/launch') }, 'Launch a coin', icon('arrow')), h('a', { class: 'btn ghost magnetic', href: href('/mines') }, 'Explore mines'))), consolePanel());
    requestAnimationFrame(() => title.classList.add('in'));
    // ---- totals ----
    const tFees = h('strong', null), tPaid = h('strong', { class: 'gold' }), tBlocks = h('strong', null), tCoins = h('strong', null);
    const paintTotals = () => {
        const t = d.totals();
        rollTo(tFees, t.feesRoutedUsd, (n) => (Number.isFinite(n) ? usd(n, true) : '—'));
        rollTo(tPaid, t.paidUsd, (n) => (Number.isFinite(n) ? usd(n, true) : '—'));
        rollTo(tBlocks, t.blocksHit, (n) => num(Math.round(n), 0));
        rollTo(tCoins, t.coinsMining, (n) => num(Math.round(n), 0));
    };
    paintTotals();
    // ---- deepest rig ----
    const deep = h('section', { class: 'panel deep reveal', 'aria-label': 'Deepest rig' });
    const paintDeep = () => {
        const best = [...d.coins()].filter((c) => Number.isFinite(c.paidUsd24h)).sort((a, b) => b.paidUsd24h - a.paidUsd24h)[0];
        if (!best) {
            deep.replaceChildren(emptyState('No payouts yet. The first coin to pay its holders shows up here.'));
            return;
        }
        const t = targetById(best.target);
        deep.replaceChildren(h('div', { class: 'deep-main' }, h('span', { class: 'eyebrow' }, 'Deepest rig · paid the most in 24h'), h('div', { style: 'display:flex;align-items:center;gap:14px;flex-wrap:wrap' }, avatar(best, 'lg'), h('div', null, h('h2', null, best.name), h('div', { class: 'mono muted', style: 'margin-top:6px' }, `$${best.ticker} · ${ago(best.createdAt)}`))), h('div', { class: 'deep-stats' }, h('div', null, h('span', { class: 'label' }, 'Market cap'), h('b', null, usd(best.mcapUsd, true))), h('div', null, h('span', { class: 'label' }, 'Hashrate now'), h('b', null, Number.isFinite(best.hashrate) ? `${num(best.hashrate, 2)} ${t.unit}` : '—')), h('div', null, h('span', { class: 'label' }, 'Mined + bought 24h'), h('b', { class: 'gold' }, t.chains.map((ch) => `${fmtSmall(best.mined24h[ch] ?? NaN)} ${ch}`).join(' + ')))), h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center' }, h('a', { class: 'btn magnetic', href: href(`/coin/${best.mint}`) }, 'Open rig', icon('arrow')), mineChip(best.target, { href: href(`/mine/${t.slug}`) }))), h('div', { class: 'deep-side' }, h('div', null, h('span', { class: 'label' }, 'Paid to holders, 24h'), h('div', { class: 'big' }, usd(best.paidUsd24h, true))), sparkline(best.spark, 'spark-lg', 'var(--gold)'), h('p', { class: 'note' }, `Paid in ${t.chains.join(' + ')} to holders who linked an address, by bag size.`)));
    };
    paintDeep();
    // ---- pulse ----
    const cols = { fresh: h('div', { class: 'pulse-list' }), soon: h('div', { class: 'pulse-list' }), grad: h('div', { class: 'pulse-list' }) };
    const counts = { fresh: h('span', { class: 'count' }), soon: h('span', { class: 'count' }), grad: h('span', { class: 'count' }) };
    const bucket = (c) => (c.graduated ? 'grad' : c.bonding >= 60 ? 'soon' : 'fresh');
    const paintPulse = () => {
        const all = d.coins();
        const lists = {
            fresh: all.filter((c) => bucket(c) === 'fresh').sort((a, b) => b.createdAt - a.createdAt).slice(0, 14),
            soon: all.filter((c) => bucket(c) === 'soon').sort((a, b) => b.bonding - a.bonding).slice(0, 14),
            grad: all.filter((c) => bucket(c) === 'grad').sort((a, b) => b.mcapUsd - a.mcapUsd).slice(0, 14),
        };
        for (const k of Object.keys(lists)) {
            const want = lists[k];
            const have = new Map([...cols[k].querySelectorAll('.prow')].map((r) => [r.dataset.mint, r]));
            const next = want.map((c) => { const r = have.get(c.mint); if (r) {
                updatePulseRow(r, c);
                return r;
            } return pulseRow(c); });
            cols[k].replaceChildren(...(next.length ? next : [emptyState(k === 'fresh' ? 'No new coins right now.' : k === 'soon' ? 'Nothing close to graduating yet.' : 'No graduated coins yet.')]));
            counts[k].textContent = String(want.length);
        }
    };
    paintPulse();
    const pulseCol = (key, title, sub) => h('section', { class: 'pulse-col', 'data-col': key, 'data-active': key === 'fresh' ? 'true' : 'false', 'aria-label': title }, h('header', null, h('h3', null, title, counts[key]), h('span', { class: 'label' }, sub)), cols[key]);
    const pulseTabs = h('div', { class: 'seg pulse-tabs', role: 'tablist', 'aria-label': 'Pulse columns' });
    const tabs = [['fresh', 'New'], ['soon', 'Final stretch'], ['grad', 'Graduated']];
    const pulseGrid = h('div', { class: 'pulse' }, pulseCol('fresh', 'New', 'just launched'), pulseCol('soon', 'Final stretch', 'bonding 60%+'), pulseCol('grad', 'Graduated', 'on PumpSwap'));
    pulseTabs.append(...tabs.map(([k, l], i) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === 0), onclick: (e) => {
            pulseTabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget)));
            pulseGrid.querySelectorAll('.pulse-col').forEach((c) => c.setAttribute('data-active', String(c.dataset.col === k)));
        } }, l)));
    // ---- mine cards ----
    const mineCards = () => d.targets().map((s) => {
        const t = targetById(s.id);
        return h('a', { class: 'card mcard spot reveal', href: href(`/mine/${t.slug}`), style: `--mc: var(${t.accent})` }, mineGlyph(t.id), h('span', { class: 'algo' }, t.algo), h('h3', null, t.label), h('p', null, t.blurb), h('dl', null, h('dt', null, 'Coins'), h('dd', null, String(s.coins)), h('dt', null, 'Hashrate'), h('dd', null, Number.isFinite(s.hashrate) ? `${num(s.hashrate, s.hashrate >= 100 ? 0 : 2)} ${t.unit}` : '—'), h('dt', null, 'Blocks'), h('dd', null, String(s.blocksHit))));
    });
    const minesGrid = h('div', { class: 'mines-grid' }, mineCards().map((c, i) => { c.style.setProperty('--i', String(i)); return c; }));
    // ---- leaderboards ----
    const boardRow = (c, val, sub) => h('li', null, avatar(c), h('div', { style: 'min-width:0' }, h('b', null, h('a', { href: href(`/coin/${c.mint}`) }, c.name)), h('small', null, sub)), h('span', { class: 'val gold' }, val));
    const bEarn = h('ol'), bPaid = h('ol'), bBlocks = h('ol');
    const paintBoards = () => {
        const all = d.coins();
        bEarn.replaceChildren(...[...all].sort((a, b) => earnedUsd(b) - earnedUsd(a)).slice(0, 6).map((c) => boardRow(c, usd(earnedUsd(c), true), `$${c.ticker} · ${targetById(c.target).label}`)));
        bPaid.replaceChildren(...[...all].filter((c) => Number.isFinite(c.paidUsdTotal)).sort((a, b) => b.paidUsdTotal - a.paidUsdTotal).slice(0, 6).map((c) => boardRow(c, usd(c.paidUsdTotal, true), `$${c.ticker} · all time`)));
        const blocks = d.blocks(6);
        bBlocks.replaceChildren(...(blocks.length ? blocks.map((b) => {
            const t = targetById(b.target);
            const c = b.mint ? d.coin(b.mint) : undefined;
            return h('li', null, h('span', { class: 'kind block' }, icon('cube')), h('div', { style: 'min-width:0' }, h('b', null, `${t.label} block`), h('small', null, c ? `with $${c.ticker} · ${ago(b.ts)}` : ago(b.ts))), h('span', { class: 'val', style: `color:var(${t.accent})` }, t.algo));
        })
            : [h('li', { class: 'muted', style: 'display:block;padding:14px' }, 'No blocks hit yet.')]));
    };
    paintBoards();
    const board = (title, sub, ol, i) => h('section', { class: 'panel board reveal', style: `--i:${i}` }, h('div', { class: 'panel-head' }, h('h3', null, title), h('span', { class: 'label' }, sub)), ol);
    // ---- live updates ----
    let n = 0;
    const off = d.subscribe((a) => {
        if (a) {
            if (a.kind === 'launch') {
                paintPulse();
                const r = cols.fresh.querySelector('.prow');
                if (r)
                    enter(r);
            }
            else if (a.mint && (a.kind === 'buy' || a.kind === 'sell')) {
                const r = pulseGrid.querySelector(`.prow[data-mint="${a.mint}"]`);
                if (r)
                    flashRow(r);
            }
            return;
        }
        paintTotals();
        if (++n % 4 === 0)
            paintPulse();
        if (n % 10 === 0) {
            paintDeep();
            paintBoards();
            minesGrid.replaceChildren(...mineCards().map((c) => { c.classList.add('in'); return c; }));
        }
    });
    onUnmount(off);
    return h('div', { class: 'page', style: 'padding-top:0' }, hero, h('div', { class: 'strip reveal', 'aria-label': 'Totals' }, h('div', null, h('span', { class: 'label' }, 'Fees routed'), tFees), h('div', null, h('span', { class: 'label' }, 'Paid to holders'), tPaid), h('div', null, h('span', { class: 'label' }, 'Blocks hit'), tBlocks), h('div', null, h('span', { class: 'label' }, 'Coins mining'), tCoins)), deep, h('div', { class: 'with-rail' }, h('div', { class: 'page', style: 'padding-top:0' }, h('section', { class: 'sec', 'aria-labelledby': 'pulse-h' }, sectionHead('Pulse', 'Every rig, live', 'New launches, coins about to graduate, and the ones already on PumpSwap. Quick-buy chips are demo stubs.', pulseTabs), pulseGrid), h('section', { class: 'sec', 'aria-labelledby': 'mines-h' }, sectionHead('Mines', 'Pick what your fees mine', 'Each coin mines one target, chosen at launch.', h('a', { class: 'btn ghost sm', href: href('/mines') }, 'All mines', icon('arrow'))), minesGrid)), activityRail()), h('section', { class: 'sec', 'aria-labelledby': 'flow-h' }, sectionHead('How fees flow', 'From a trade to a payout', 'Five steps, every one of them on the public ledger.'), feesFlowSection()), h('section', { class: 'sec', 'aria-labelledby': 'boards-h' }, sectionHead('Leaderboards', 'Who earned what'), h('div', { class: 'boards' }, board('Top earners', 'mined + bought, 24h', bEarn, 0), board('Most paid out', 'all time', bPaid, 1), board('Latest blocks', 'across all mines', bBlocks, 2))), h('section', { class: 'sec', 'aria-labelledby': 'faq-h' }, sectionHead('Straight answers', 'Before you launch'), h('div', { class: 'reveal' }, faq('Is renting hashpower profitable?', 'Not by itself. Rental markets price hashpower close to what it mines, so it usually runs at a small loss. That’s why part of every coin’s fees buys the mined coin directly, and the split is set at launch.'), faq('How do I get paid in DOGE or ZEC?', 'Link a payout address for that chain by signing a message with the Solana wallet that holds the coin. It’s free and sends no transaction. Holders who never link don’t receive that chain’s payout.'), faq('Why do LTC and DOGE come together?', 'Both use the Scrypt algorithm and support merged mining, so one rental earns both coins at once.'), faq('What does $HASH get?', `${pct(FEES.rigCut)} of every coin’s fees goes to $HASH, which runs its own mine for $HASH holders.`), faq('Is any of this live yet?', d.isDemo ? 'Not yet. Everything on this page is demo data until launch, and no button sends a transaction.' : 'Yes. Figures on this page come from the Rig backend and the public ledger.'))));
}
const faq = (q, a) => h('details', { class: 'faq' }, h('summary', null, q), h('p', null, a));
