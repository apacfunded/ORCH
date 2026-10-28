import { h, onUnmount } from '../lib/dom.js';
import { usd, price, num, ago, short, amount } from '../lib/format.js';
import { href } from '../lib/router.js';
import { targetById } from '../config/targets.js';
import { data } from '../data/index.js';
import { avatar, mineChip, change, pctText, emptyState } from '../components/Bits.js';
import { candleChart } from '../components/Chart.js';
import { rigPanel } from '../components/RigPanel.js';
import { tradePanel } from '../components/TradePanel.js';
import { copyText } from '../components/Toasts.js';
import { icon } from '../components/Icons.js';
import { notFoundPage } from './NotFound.js';
const RES = [['1s', 1], ['15s', 15], ['1m', 60], ['5m', 300], ['15m', 900], ['1h', 3600], ['4h', 14400], ['1D', 86400]];
export function coinPage(mint) {
    const d = data();
    const c = d.coin(mint);
    if (!c)
        return notFoundPage();
    const t = targetById(c.target);
    // ---- header + stats ----
    const sPrice = h('b', null), sMcap = h('b', null), sChg = h('b', null), sVol = h('b', null), sHold = h('b', null), sTop = h('b', null);
    const paintStats = () => {
        sPrice.textContent = price(c.priceUsd);
        sMcap.textContent = usd(c.mcapUsd, true);
        sChg.replaceChildren(change(c.change24h));
        sVol.textContent = usd(c.volume24h, true);
        sHold.textContent = Number.isFinite(c.holders) ? num(c.holders, 0) : '—';
        sTop.textContent = `${pctText(c.top10Pct)} · dev ${pctText(c.devPct)}`;
    };
    paintStats();
    // ---- chart ----
    let res = 60, mode = 'price', unit = 'USD';
    const chart = candleChart();
    const scale = () => { const base = mode === 'mcap' ? 1e9 : 1; if (unit === 'USD')
        return base; const p = d.prices()[unit]; return p ? base / p : base; };
    const load = () => chart.setData(d.candles(c.mint, res), scale());
    const segBtn = (label, on, fn, group) => h('button', { type: 'button', 'aria-pressed': String(on), onclick: (e) => {
            group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
            fn();
        } }, label);
    const resSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Candle size' });
    resSeg.append(...RES.map(([l, s]) => segBtn(l, s === res, () => { res = s; load(); }, resSeg)));
    const modeSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Price or market cap' });
    modeSeg.append(segBtn('Price', true, () => { mode = 'price'; load(); }, modeSeg), segBtn('Market cap', false, () => { mode = 'mcap'; load(); }, modeSeg));
    const unitNote = h('p', { class: 'note', hidden: true });
    const unitSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Show in USD or the mined coin' });
    unitSeg.append(segBtn('USD', true, () => { unit = 'USD'; load(); unitNote.hidden = true; }, unitSeg), ...t.chains.map((ch) => segBtn(`in ${ch}`, false, () => { unit = ch; load(); unitNote.hidden = false; unitNote.textContent = `Shown in ${ch} on this site only (USD ÷ ${ch} price). Trades settle in SOL on pump.fun.`; }, unitSeg)));
    const noData = h('p', { class: 'note', hidden: true }, 'Charts need a market data source. Connect Codex in the live adapter to show candles.');
    // ---- tabs ----
    const tabNames = ['Trades', 'Holders', 'Payouts', 'Info'];
    let tab = 'Trades';
    const tabBody = h('div', { class: 'tablewrap', role: 'tabpanel', id: 'coin-tabpanel' });
    const tabBar = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Coin details' });
    const paintTab = () => {
        if (tab === 'Trades') {
            const tr = d.trades(c.mint);
            tabBody.replaceChildren(tr.length ? h('table', { class: 't' }, h('thead', null, h('tr', null, ['Time', 'Side', 'Wallet', 'SOL', 'USD', `$${c.ticker}`].map((x, i) => h('th', { class: i >= 3 ? 'r' : '' }, x)))), h('tbody', null, tr.slice(0, 40).map((x) => h('tr', null, h('td', { class: 'mono muted' }, ago(x.ts)), h('td', { class: x.side === 'buy' ? 'up' : 'down' }, x.side === 'buy' ? 'Buy' : 'Sell'), h('td', { class: 'mono' }, short(x.wallet, 4)), h('td', { class: 'r mono' }, num(x.sol, 2)), h('td', { class: 'r mono' }, usd(x.usd)), h('td', { class: 'r mono' }, num(x.tokens, 0))))))
                : emptyState('No trades to show yet.'));
        }
        else if (tab === 'Holders') {
            const hs = d.holders(c.mint);
            tabBody.replaceChildren(hs.length ? h('table', { class: 't' }, h('thead', null, h('tr', null, ['#', 'Wallet', 'Share', 'Payout address'].map((x, i) => h('th', { class: i === 2 ? 'r' : '' }, x)))), h('tbody', null, hs.map((x, i) => h('tr', null, h('td', { class: 'mono muted' }, String(i + 1)), h('td', { class: 'mono' }, short(x.wallet, 5)), h('td', { class: 'r mono' }, `${x.pct.toFixed(2)}%`), h('td', null, x.linked.length ? h('span', { class: 'pill live' }, `linked ${x.linked.join(' + ')}`) : h('span', { class: 'pill' }, 'not linked · paid nothing'))))))
                : emptyState('Holder data appears once the market data source is connected.'));
        }
        else if (tab === 'Payouts') {
            const rows = d.ledger(300).filter((e) => e.mint === c.mint && (e.kind === 'payout' || e.kind === 'mined' || e.kind === 'rent'));
            tabBody.replaceChildren(rows.length ? h('table', { class: 't' }, h('thead', null, h('tr', null, ['Time', 'What', 'Amount', 'Status', 'Note'].map((x, i) => h('th', { class: i === 2 ? 'r' : '' }, x)))), h('tbody', null, rows.slice(0, 50).map((e) => h('tr', { class: e.kind === 'payout' ? 'payout' : '' }, h('td', { class: 'mono muted' }, ago(e.ts)), h('td', null, e.kind === 'payout' ? 'Paid holders' : e.kind === 'mined' ? 'Mined' : 'Rented hashpower'), h('td', { class: `r mono ${e.kind !== 'rent' ? 'gold' : ''}` }, amount(e.amount, e.unit)), h('td', null, h('span', { class: `pill ${e.status === 'done' ? 'live' : 'warn'}` }, e.status)), h('td', { class: 'muted' }, e.note ?? '')))))
                : emptyState('No payouts yet. The first one goes out at the next payout time.'));
        }
        else {
            tabBody.replaceChildren(h('dl', { class: 'kv panel-body' }, h('dt', null, 'Mint'), h('dd', null, h('button', { class: 'btn ghost sm', onclick: () => copyText(c.mint, 'Mint copied') }, short(c.mint, 6), icon('copy'))), h('dt', null, 'Mines'), h('dd', null, `${t.label} (${t.algo})`), h('dt', null, 'Pays holders in'), h('dd', null, t.chains.join(' + ')), h('dt', null, 'Rent share'), h('dd', null, `${Math.round(c.rentShare * 100)}% of fees after the $HASH cut`), h('dt', null, 'Launched'), h('dd', null, new Date(c.createdAt).toLocaleString()), h('dt', null, 'Trades on'), h('dd', null, c.graduated ? 'PumpSwap (graduated)' : 'pump.fun bonding curve'), h('dt', null, 'Links'), h('dd', null, [c.socials.x && h('a', { href: c.socials.x, target: '_blank', rel: 'noopener' }, 'X '), c.socials.tg && h('a', { href: c.socials.tg, target: '_blank', rel: 'noopener' }, 'Telegram '), c.socials.web && h('a', { href: c.socials.web, target: '_blank', rel: 'noopener' }, 'Website')].filter(Boolean), !c.socials.x && !c.socials.tg && !c.socials.web ? '—' : '')));
        }
    };
    tabBar.append(...tabNames.map((n) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(n === tab), 'aria-controls': 'coin-tabpanel', onclick: (e) => {
            tab = n;
            tabBar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget)));
            paintTab();
        } }, n)));
    paintTab();
    const bondFill = h('i', { style: `width:${Math.min(100, c.bonding || 0)}%` });
    const bondTxt = h('span', null);
    const paintBond = () => { bondFill.style.width = `${Math.min(100, c.bonding || 0)}%`; bondTxt.textContent = c.graduated ? 'Graduated to PumpSwap' : Number.isFinite(c.bonding) ? `${c.bonding.toFixed(1)}% · graduates at about $69k market cap` : '—'; };
    paintBond();
    let n = 0;
    const off = d.subscribe((a) => {
        if (a) {
            if (a.mint === c.mint && tab === 'Trades' && (a.kind === 'buy' || a.kind === 'sell'))
                paintTab();
            return;
        }
        paintStats();
        paintBond();
        const cs = d.candles(c.mint, Math.max(60, res));
        if (res >= 60 && cs.length)
            chart.update(cs[cs.length - 1], scale());
        if (++n % 10 === 0 && tab !== 'Trades')
            paintTab();
    });
    onUnmount(off);
    const page = h('div', { class: 'page tight', style: `--mc: var(${t.accent})` }, h('div', { style: 'display:flex;flex-direction:column;gap:18px' }, h('a', { href: href(`/mine/${t.slug}`), class: 'label', style: 'display:inline-flex;gap:6px;align-items:center' }, icon('back'), `${t.label} mine`), h('div', { class: 'coin-head' }, avatar(c, 'lg'), h('div', { style: 'display:flex;flex-direction:column;gap:8px;min-width:0' }, h('h1', null, c.name), h('div', { class: 'meta' }, h('span', { class: 'mono muted' }, `$${c.ticker}`), mineChip(c.target, { href: href(`/mine/${t.slug}`) }), h('button', { class: 'btn ghost sm', onclick: () => copyText(c.mint, 'Mint copied'), 'aria-label': 'Copy mint address' }, short(c.mint, 4), icon('copy')), h('a', { class: 'btn ghost sm', href: `https://pump.fun/coin/${c.mint}`, target: '_blank', rel: 'noopener' }, 'pump.fun', icon('ext'))))), h('div', { class: 'coin-stats' }, h('div', null, h('span', { class: 'label' }, 'Price'), sPrice), h('div', null, h('span', { class: 'label' }, 'Market cap'), sMcap), h('div', null, h('span', { class: 'label' }, '24h'), sChg), h('div', null, h('span', { class: 'label' }, 'Volume 24h'), sVol), h('div', null, h('span', { class: 'label' }, 'Holders'), sHold), h('div', null, h('span', { class: 'label' }, 'Top 10'), sTop))), h('div', { class: 'coin-grid' }, h('div', { class: 'page tight', style: 'padding-top:0;gap:16px' }, h('section', { class: 'panel', 'aria-label': 'Chart' }, h('div', { class: 'panel-head chart-tools' }, resSeg, h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, modeSeg, unitSeg)), h('div', { class: 'panel-body', style: 'padding:8px' }, chart.el, unitNote, noData)), h('section', { class: 'panel' }, h('div', { class: 'panel-body', style: 'display:flex;flex-direction:column;gap:8px' }, h('div', { class: 'cc-foot' }, h('span', { class: 'label' }, 'Bonding curve'), bondTxt), h('div', { class: 'bond' }, bondFill))), h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, tabBar), tabBody)), h('div', { class: 'side' }, rigPanel(c), h('div', { class: 'side-trade' }, tradePanel(c)))), h('div', { class: 'mobile-bar' }, h('a', { class: 'btn', href: `https://pump.fun/coin/${c.mint}`, target: '_blank', rel: 'noopener' }, 'Buy on pump.fun'), h('a', { class: 'btn ghost', href: href('/link') }, icon('link'), 'Link payout')));
    requestAnimationFrame(() => { load(); if (!d.candles(c.mint, 60).length)
        noData.hidden = false; });
    return page;
}
