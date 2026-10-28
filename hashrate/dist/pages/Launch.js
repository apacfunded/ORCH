import { h, svg } from '../lib/dom.js';
import { usd } from '../lib/format.js';
import { motionOk } from '../lib/motion.js';
import { href } from '../lib/router.js';
import { TARGETS, targetById } from '../config/targets.js';
import { FEES, pct } from '../config/fees.js';
import { data } from '../data/index.js';
import { coinCard } from '../components/CoinCard.js';
import { feeSplitBar } from '../components/RigPanel.js';
import { toast, copyText } from '../components/Toasts.js';
import { icon, mineGlyph } from '../components/Icons.js';
/**
 * Launch wizard: details → mine → fee split → review.
 * launchCoin() below is a demo. The real flow, step by step:
 *  1. The backend makes a fresh creator wallet for the coin (each coin needs its own; pump.fun claims a wallet's fees all at once).
 *  2. Upload image + metadata to pump.fun IPFS (https://pump.fun/api/ipfs) → metadata URI.
 *  3. Request a create transaction from PumpPortal trade-local: { publicKey: creatorWallet, action: "create",
 *     tokenMetadata: { name, symbol, uri }, mint: <new mint keypair pubkey>, denominatedInSol: "true", amount: devBuy, slippage, priorityFee, pool: "pump" }.
 *  4. Sign with the mint keypair + creator wallet on the backend, send, confirm.
 *  5. Register with the backend (add-coin: mint, ticker, name, target, rent share) so fees start routing to the rig.
 */
export function launchPage() {
    const d = data();
    const draft = { name: '', ticker: '', description: '', target: 'LTC_DOGE', rentShare: FEES.defaultRentShare, x: '', tg: '', site: '', devBuy: 0 };
    let step = 0;
    let volume = 50000;
    const names = ['Details', 'Mine', 'Fee split', 'Review'];
    const stepper = h('ol', { class: 'stepper', 'aria-label': 'Launch steps' });
    const body = h('div', { class: 'form' });
    const preview = h('div', { class: 'preview-card' });
    const estimate = h('div', { class: 'estimate' });
    const split = feeSplitBar(draft.rentShare);
    const paintStepper = () => stepper.replaceChildren(...names.map((n, i) => h('li', { 'aria-current': i === step ? 'step' : null, class: i < step ? 'done' : '' }, i < step ? icon('check') : `${i + 1}`, n)));
    const paintPreview = () => {
        const fake = {
            mint: 'DemoPreview', ticker: draft.ticker || 'TICKER', name: draft.name || 'Your coin', target: draft.target, rentShare: draft.rentShare, creatorWallet: '', createdAt: Date.now(),
            priceUsd: 4.2e-6, mcapUsd: 4200, change24h: 0, volume24h: 0, holders: 1, bonding: 6, graduated: false, spark: [1, 1.02, 1.01, 1.04, 1.06],
            hashrate: 0, mined24h: {}, pots: {}, paidOut: {}, nextPayoutAt: Date.now(), hue: [...(draft.ticker || 'X')].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7),
            top10Pct: NaN, devPct: 0, socials: { x: draft.x || undefined, tg: draft.tg || undefined, web: draft.site || undefined }, feesEarnedUsd: 0, paidUsd24h: 0, paidUsdTotal: 0,
        };
        const card = coinCard(fake);
        card.removeAttribute('href');
        card.setAttribute('aria-hidden', 'true');
        preview.replaceChildren(h('span', { class: 'label', style: 'display:block;margin-bottom:8px' }, 'Live preview'), card);
    };
    const paintEstimate = () => {
        const t = targetById(draft.target);
        const fees = volume * (FEES.creatorFeeRate ?? 0);
        const cut = fees * (FEES.rigCut ?? 0);
        const net = fees - cut;
        const rent = net * draft.rentShare;
        const mined = rent * (1 - FEES.rentalLoss);
        const buy = net - rent;
        const active = document.activeElement?.id === 'est-vol';
        estimate.replaceChildren(h('div', { class: 'field' }, h('label', { for: 'est-vol' }, 'If the coin trades this much a day (USD)'), h('input', { class: 'input mono', id: 'est-vol', inputmode: 'numeric', value: String(volume), oninput: (e) => { volume = Math.max(0, Number(e.target.value.replace(/[^0-9.]/g, '')) || 0); paintEstimate(); } })), row('Creator fees / day', FEES.creatorFeeRate === null ? 'TBD' : usd(fees)), row(`To $HASH (${pct(FEES.rigCut)})`, usd(cut)), row('Rents hashpower', `${usd(rent)} → ≈ ${usd(mined)} mined`), row('Buys directly', usd(buy)), row('To holders / day', `≈ ${usd(mined + buy)} in ${t.chains.join(' + ')}`, true), h('p', { class: 'note' }, `Estimate only. Assumes a ${pct(FEES.creatorFeeRate)} creator fee and that rented hashpower mines ${Math.round((1 - FEES.rentalLoss) * 100)}% of its cost. Real results depend on prices and pool luck.`));
        if (active) {
            const v = estimate.querySelector('#est-vol');
            v?.focus();
            v?.setSelectionRange(v.value.length, v.value.length);
        }
    };
    const field = (id, label, opts = {}) => {
        const err = h('p', { class: 'err', id: `${id}-err`, hidden: true });
        const attrs = { class: 'input', id: `f-${id}`, value: String(draft[id]), placeholder: opts.placeholder ?? '', maxlength: opts.max, 'aria-describedby': `${id}-err` };
        const input = opts.area ? h('textarea', { ...attrs, value: undefined }, String(draft[id])) : h('input', attrs);
        input.addEventListener('input', () => {
            let v = input.value;
            if (id === 'ticker') {
                v = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
                input.value = v;
            }
            draft[id] = v;
            err.hidden = true;
            paintPreview();
        });
        return { el: h('div', { class: 'field' }, h('label', { for: `f-${id}` }, label), input, opts.hint ? h('p', { class: 'hint' }, opts.hint) : null, err), err, input };
    };
    const render = () => {
        paintStepper();
        if (step === 0) {
            const n = field('name', 'Coin name', { placeholder: 'Doge Digger', max: 32 });
            const t = field('ticker', 'Ticker', { placeholder: 'DIGGER', max: 10, hint: '2–10 letters or numbers.' });
            const ds = field('description', 'Description', { area: true, max: 280, placeholder: 'What your coin is about. Optional.' });
            const imgIn = h('input', { class: 'input', id: 'f-img', type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp' });
            imgIn.addEventListener('change', () => {
                const f = imgIn.files?.[0];
                if (!f)
                    return;
                if (f.size > 3000000) {
                    toast('Image must be under 3 MB.', true);
                    imgIn.value = '';
                    return;
                }
                const rd = new FileReader();
                rd.onload = () => { draft.imageBase64 = String(rd.result).split(',')[1]; draft.imageType = f.type; };
                rd.readAsDataURL(f);
            });
            const img = h('div', { class: 'field' }, h('label', { for: 'f-img' }, 'Image'), imgIn, h('p', { class: 'hint' }, 'Square, at least 500 × 500. Uploaded to IPFS when you launch.'));
            body.replaceChildren(h('div', { class: 'row2' }, n.el, t.el), ds.el, img, h('div', { class: 'row2' }, field('x', 'X link', { placeholder: 'https://x.com/…' }).el, field('tg', 'Telegram link', { placeholder: 'https://t.me/…' }).el), nav(() => {
                let ok = true;
                if (draft.name.trim().length < 2) {
                    n.err.textContent = 'Give your coin a name (2+ characters).';
                    n.err.hidden = false;
                    ok = false;
                }
                if (!/^[A-Z0-9]{2,10}$/.test(draft.ticker)) {
                    t.err.textContent = 'Use 2–10 letters or numbers for the ticker.';
                    t.err.hidden = false;
                    ok = false;
                }
                if (!ok)
                    body.querySelector('.err:not([hidden])')?.previousElementSibling?.focus?.();
                return ok;
            }));
        }
        else if (step === 1) {
            body.replaceChildren(h('fieldset', { class: 'field', style: 'border:0;padding:0;margin:0' }, h('legend', { class: 'lbl', style: 'margin-bottom:8px' }, 'What should your fees mine?'), h('div', { class: 'pick-grid' }, TARGETS.map((t) => h('label', { class: 'pick', style: `--mc: var(${t.accent})` }, h('input', { type: 'radio', name: 'target', value: t.id, checked: draft.target === t.id ? true : null, onchange: () => { draft.target = t.id; paintPreview(); paintEstimate(); } }), mineGlyph(t.id), h('span', { class: 'label', style: 'color:var(--mc)' }, t.algo), h('b', null, t.label), h('small', null, t.blurb), h('small', { class: 'mono' }, `Pays ${t.chains.join(' + ')}${t.autoTracked ? '' : ' · recorded by hand for now'}`))))), nav(() => true));
        }
        else if (step === 2) {
            const out = h('output', { for: 'f-split', class: 'mono', style: 'font-size:14px' });
            const paintSplit = () => { out.textContent = `${Math.round(draft.rentShare * 100)}% rents hashpower · ${100 - Math.round(draft.rentShare * 100)}% buys directly`; split.set(draft.rentShare); };
            const slider = h('input', { type: 'range', id: 'f-split', min: '0', max: '100', step: '5', value: String(Math.round(draft.rentShare * 100)), 'aria-describedby': 'split-help' });
            slider.addEventListener('input', () => { draft.rentShare = Number(slider.value) / 100; paintSplit(); paintEstimate(); paintPreview(); });
            paintSplit();
            body.replaceChildren(h('div', { class: 'field' }, h('label', { for: 'f-split' }, 'Split your creator fees'), slider, split.el, out, h('p', { class: 'hint', id: 'split-help' }, 'More rent = more real mining and more show on the rack. More direct buys = bigger payouts, since rented hashpower usually mines a little less than it costs.')), h('p', { class: 'note' }, `Fixed for every coin: ${pct(FEES.rigCut)} to $HASH${FEES.opsCut !== null ? `, ${pct(FEES.opsCut)} to running costs` : ''}. Site launch fee: ${FEES.launchFeeSol === null ? 'TBD' : FEES.launchFeeSol + ' SOL'}.`), nav(() => true));
        }
        else {
            const t = targetById(draft.target);
            body.replaceChildren(h('dl', { class: 'kv panel panel-body' }, h('dt', null, 'Name'), h('dd', null, draft.name), h('dt', null, 'Ticker'), h('dd', null, `$${draft.ticker}`), h('dt', null, 'Mines'), h('dd', null, `${t.label} (${t.algo})`), h('dt', null, 'Holders paid in'), h('dd', null, t.chains.join(' + ')), h('dt', null, 'Fee split'), h('dd', null, `${Math.round(draft.rentShare * 100)}% rent · ${100 - Math.round(draft.rentShare * 100)}% buy`), h('dt', null, 'Launches on'), h('dd', null, 'pump.fun, from a fresh creator wallet')), d.isDemo ? '' : h('div', { class: 'field' }, h('label', { for: 'f-devbuy' }, 'Dev buy (SOL, optional)'), h('input', { class: 'input mono', id: 'f-devbuy', inputmode: 'decimal', value: String(draft.devBuy), oninput: (e) => { draft.devBuy = Math.max(0, Number(e.target.value) || 0); } }), h('p', { class: 'hint' }, 'Bought for the creator wallet in the create transaction. You fund it along with the create fee in the next step.')), h('p', { class: 'note' }, 'Each coin launches from its own new creator wallet, because pump.fun claims all of a wallet’s creator fees in one go. Separate wallets keep each coin’s fees and payouts apart.'), d.isDemo ? h('p', { class: 'stub' }, 'Demo: launching adds a simulated coin to this site. Nothing is created on pump.fun.') : '', h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => { step--; render(); } }, 'Back'), h('button', { class: 'btn magnetic', type: 'button', onclick: launchCoin }, icon('bolt'), d.isDemo ? 'Launch (demo)' : 'Launch on pump.fun')));
        }
        body.querySelector('input, textarea, select')?.focus();
    };
    const nav = (valid) => h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, step > 0 ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { step--; render(); } }, 'Back') : null, h('button', { class: 'btn', type: 'button', onclick: () => { if (valid()) {
            step++;
            render();
        } } }, 'Continue', icon('arrow')));
    const launchLive = async () => {
        if (!d.launch || !d.launchStatus) {
            toast('Launching isn’t connected to a backend yet.', true);
            return;
        }
        let ticket;
        try {
            ticket = await d.launch({ name: draft.name, ticker: draft.ticker, description: draft.description, target: draft.target, rentShare: draft.rentShare, devBuySol: draft.devBuy,
                imageBase64: draft.imageBase64, imageType: draft.imageType, socials: { x: draft.x || undefined, tg: draft.tg || undefined, web: draft.site || undefined } });
        }
        catch (e) {
            toast(e.message, true);
            return;
        }
        const status = h('p', { class: 'muted' }, 'Waiting for the SOL to arrive…');
        const addr = h('code', { class: 'mono', style: 'overflow-wrap:anywhere;font-size:14px' }, ticket.wallet);
        wrap.replaceChildren(h('div', { class: 'panel panel-body', style: 'display:flex;flex-direction:column;gap:14px;max-width:640px' }, h('span', { class: 'eyebrow' }, 'Step 5 · Fund the coin’s wallet'), h('h2', null, `Send ${ticket.needSol} SOL`), h('p', { class: 'muted' }, `This is $${draft.ticker}’s own creator wallet, made just now. It covers the pump.fun create fee, your dev buy and network fees. Once the SOL lands, Hashrate creates the coin and starts routing its fees to the mine.`), h('div', { class: 'panel', style: 'padding:12px;background:var(--bg);display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, addr, h('button', { class: 'btn ghost sm', type: 'button', onclick: () => copyText(ticket.wallet, 'Address copied') }, icon('copy'), 'Copy')), h('p', { class: 'note' }, 'Send from any Solana wallet. Only send SOL. Launches that aren’t funded within 7 days expire.'), status));
        const poll = window.setInterval(async () => {
            try {
                const st = await d.launchStatus(ticket.id);
                if (st.status === 'launching')
                    status.textContent = 'Funded. Creating the coin on pump.fun…';
                else if (st.status === 'live' && st.mint) {
                    clearInterval(poll);
                    const t = targetById(draft.target);
                    const unit = rackUnit(t.accent);
                    wrap.replaceChildren(h('div', { class: 'panel success' }, unit, h('span', { class: 'eyebrow' }, 'Live on pump.fun'), h('h2', null, `$${st.ticker} is mining`), h('p', { class: 'muted', style: 'max-width:46ch' }, `${draft.name} now mines ${t.label}. Its first rental goes out once fees reach the minimum order.`), h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center' }, h('a', { class: 'btn', href: `https://pump.fun/coin/${st.mint}`, target: '_blank', rel: 'noopener' }, 'Open on pump.fun', icon('ext')), h('a', { class: 'btn ghost', href: href(`/coin/${st.mint}`) }, 'Coin page'))));
                    powerOn(unit);
                }
                else if (st.status === 'failed') {
                    clearInterval(poll);
                    status.textContent = `Launch failed: ${st.error ?? 'unknown error'}. The SOL stays in that wallet; contact support with the address.`;
                    status.className = 'err';
                }
            }
            catch { /* keep polling */ }
        }, 5000);
    };
    const launchCoin = () => {
        if (!d.isDemo) {
            void launchLive();
            return;
        }
        if (!d.addDemoCoin) {
            toast('Launching isn’t connected yet.', true);
            return;
        }
        const coin = d.addDemoCoin({ name: draft.name, ticker: draft.ticker, target: draft.target, rentShare: draft.rentShare });
        const t = targetById(coin.target);
        const cv = h('canvas', { 'aria-hidden': 'true' });
        const unit = rackUnit(t.accent);
        wrap.replaceChildren(h('div', { class: 'panel success' }, cv, unit, h('span', { class: 'eyebrow' }, 'Demo launch'), h('h2', null, `$${coin.ticker} is mining`), h('p', { class: 'muted', style: 'max-width:46ch' }, `${coin.name} now mines ${t.label}. Its first rental goes out once fees reach the minimum order.`), h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center' }, h('a', { class: 'btn', href: href(`/coin/${coin.mint}`) }, 'Open coin page'), h('button', { class: 'btn ghost', type: 'button', onclick: () => dispatchEvent(new HashChangeEvent('hashchange')) }, 'Launch another'))));
        powerOn(unit);
        burst(cv, t.accent);
    };
    const wrap = h('div', { class: 'wizard' }, h('section', { class: 'panel panel-body' }, stepper, body), h('aside', { class: 'side' }, h('div', { class: 'panel panel-body' }, preview), h('div', { class: 'panel panel-body' }, h('h3', { style: 'margin-bottom:12px' }, 'Daily estimate'), estimate)));
    paintPreview();
    paintEstimate();
    render();
    return h('div', { class: 'page tight' }, h('div', { class: 'page-title' }, h('span', { class: 'eyebrow' }, 'Launch'), h('h1', { style: 'margin-top:10px' }, 'Launch a coin that mines'), h('p', null, 'Your coin trades on pump.fun like any other. Hashrate points its creator fees at a mine and pays the output to holders.')), wrap);
}
const row = (k, v, total = false) => h('div', { class: `est-row ${total ? 'total' : ''}` }, h('span', null, k), h('b', null, v));
/** A rack unit that powers on: LEDs light in sequence, then the hash streak. */
function rackUnit(accentVar) {
    return svg(`<svg viewBox="0 0 320 90" style="--mc: var(${accentVar})">
    <rect x="1" y="1" width="318" height="88" rx="10" fill="var(--surface)" stroke="var(--line-2)"/>
    <rect class="streak" x="22" y="22" width="150" height="9" rx="4.5"/><rect x="22" y="40" width="110" height="9" rx="4.5" fill="var(--line-2)"/><rect x="22" y="58" width="180" height="9" rx="4.5" fill="var(--line)"/>
    <circle class="led" cx="270" cy="30" r="5"/><circle class="led" cx="290" cy="30" r="5"/><circle class="led" cx="270" cy="52" r="5"/><circle class="led" cx="290" cy="52" r="5"/>
  </svg>`, 'unit-svg');
}
function powerOn(unit) {
    const leds = [...unit.querySelectorAll('.led')];
    const delay = motionOk() ? 180 : 0;
    leds.forEach((l, i) => setTimeout(() => l.classList.add('on'), delay * (i + 1)));
    setTimeout(() => unit.classList.add('on'), delay * (leds.length + 1));
}
/** Particle burst in the mine's color. */
function burst(cv, accentVar) {
    if (!motionOk())
        return;
    const ctx = cv.getContext('2d');
    if (!ctx)
        return;
    const W = cv.clientWidth || 600, H = cv.clientHeight || 300;
    cv.width = W;
    cv.height = H;
    const col = getComputedStyle(document.documentElement).getPropertyValue(accentVar).trim() || '#5ad1ff';
    const ps = Array.from({ length: 140 }, () => ({ x: W / 2, y: H / 2, vx: (Math.random() - 0.5) * 9, vy: (Math.random() - 0.8) * 9, life: 1 }));
    const step = () => {
        ctx.clearRect(0, 0, W, H);
        let alive = false;
        for (const p of ps) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.18;
            p.life -= 0.012;
            if (p.life > 0) {
                alive = true;
                ctx.globalAlpha = p.life;
                ctx.fillStyle = col;
                ctx.fillRect(p.x, p.y, 3, 3);
            }
        }
        if (alive)
            requestAnimationFrame(step);
    };
    step();
}
