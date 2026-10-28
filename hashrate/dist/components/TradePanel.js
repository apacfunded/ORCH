import { h } from '../lib/dom.js';
import { num } from '../lib/format.js';
import { data } from '../data/index.js';
import { toast } from './Toasts.js';
import { icon } from './Icons.js';
/**
 * SOL trade panel. Stub: sends nothing. To go live, request a transaction from PumpPortal trade-local
 * ({ publicKey, action: "buy"|"sell", mint, amount, denominatedInSol, slippage, priorityFee, pool: "auto" }),
 * have the wallet sign and send it, then refresh balances.
 */
export function tradePanel(c) {
    let side = 'buy';
    const amt = h('input', { class: 'input mono', id: 'trade-amt', inputmode: 'decimal', value: '0.5', 'aria-describedby': 'trade-est' });
    const est = h('p', { class: 'note', id: 'trade-est' });
    const buyBtn = h('button', { class: 'buy', 'aria-pressed': 'true', type: 'button' }, 'Buy');
    const sellBtn = h('button', { class: 'sell', 'aria-pressed': 'false', type: 'button' }, 'Sell');
    const unit = h('span', { class: 'mono muted' }, 'SOL');
    const go = h('button', { class: 'btn block', type: 'submit' }, `Buy $${c.ticker}`);
    const calc = () => {
        const v = Number(amt.value);
        const sol = data().prices().SOL ?? NaN;
        if (!(v > 0)) {
            est.textContent = 'Enter an amount above 0.';
            return;
        }
        if (!Number.isFinite(sol) || !Number.isFinite(c.priceUsd)) {
            est.textContent = 'Live prices aren’t connected yet.';
            return;
        }
        est.textContent = side === 'buy'
            ? `≈ ${num((v * sol) / c.priceUsd, 0)} $${c.ticker} at the current price, before slippage.`
            : `≈ ${num((v * c.priceUsd) / sol, 4)} SOL at the current price, before slippage.`;
    };
    const setSide = (s) => {
        side = s;
        buyBtn.setAttribute('aria-pressed', String(s === 'buy'));
        sellBtn.setAttribute('aria-pressed', String(s === 'sell'));
        unit.textContent = s === 'buy' ? 'SOL' : `$${c.ticker}`;
        amt.value = s === 'buy' ? '0.5' : '100000';
        go.textContent = `${s === 'buy' ? 'Buy' : 'Sell'} $${c.ticker}`;
        calc();
    };
    buyBtn.addEventListener('click', () => setSide('buy'));
    sellBtn.addEventListener('click', () => setSide('sell'));
    amt.addEventListener('input', calc);
    calc();
    const quicks = h('div', { class: 'quicks', role: 'group', 'aria-label': 'Quick amounts' }, ['0.1', '0.5', '1', '5'].map((v) => h('button', { class: 'quick', type: 'button', onclick: () => { if (side === 'buy') {
            amt.value = v;
            calc();
        } } }, icon('bolt'), `${v} SOL`)));
    return h('form', { class: 'panel', id: 'trade', onsubmit: (e) => { e.preventDefault(); toast('Trading from this site isn’t live yet. Use the pump.fun link to trade.'); } }, h('div', { class: 'panel-head' }, h('h3', null, 'Trade'), h('span', { class: 'pill' }, 'Settles in SOL')), h('div', { class: 'panel-body', style: 'display:flex;flex-direction:column;gap:12px' }, h('div', { class: 'trade-tabs', role: 'group', 'aria-label': 'Buy or sell' }, buyBtn, sellBtn), h('div', { class: 'field' }, h('label', { for: 'trade-amt' }, 'Amount'), h('div', { style: 'display:flex;gap:8px;align-items:center' }, amt, unit)), quicks, est, go, h('p', { class: 'stub' }, 'Demo panel: this button doesn’t send a transaction.'), h('a', { class: 'btn ghost block', href: `https://pump.fun/coin/${c.mint}`, target: '_blank', rel: 'noopener' }, 'Trade on pump.fun', icon('ext'))));
}
