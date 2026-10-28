import { h } from '../lib/dom.js';
import { short, amount } from '../lib/format.js';
import { ADDRESS_HINT, isValidAddress } from '../config/targets.js';
import { data } from '../data/index.js';
import { connectWallet, walletAddress, onWallet, signText } from './Wallet.js';
import { toast } from './Toasts.js';
import { icon } from './Icons.js';
const CHAINS = ['DOGE', 'LTC', 'ZEC', 'KAS', 'BTC', 'XMR'];
/**
 * Link a payout address: connect → pick chain → paste address → sign → save.
 * Talks to GET /api/link-message and POST /api/link through the data adapter.
 */
export function linkFlow(defaultChain = 'DOGE') {
    const d = data();
    const steps = h('ol', { class: 'stepper', 'aria-label': 'Steps' });
    const body = h('div', { class: 'form' });
    const linked = h('div', { class: 'panel', hidden: true });
    let chain = defaultChain;
    const stepNames = ['Connect wallet', 'Payout address', 'Sign'];
    const setStep = (i) => steps.replaceChildren(...stepNames.map((n, k) => h('li', { 'aria-current': k === i ? 'step' : null, class: k < i ? 'done' : '' }, `${k + 1}. ${n}`)));
    const showLinked = async (addr) => {
        try {
            const info = await d.links(addr);
            linked.hidden = false;
            linked.replaceChildren(h('div', { class: 'panel-head' }, h('h3', null, 'Your payout addresses'), h('span', { class: 'pill' }, short(addr, 5))), h('div', { class: 'panel-body' }, info.links.length
                ? h('dl', { class: 'kv' }, info.links.flatMap((l) => [h('dt', null, l.chain), h('dd', null, short(l.address, 8))]))
                : h('p', { class: 'muted' }, 'No addresses linked yet. Coins you hold pay nothing until you link one.'), info.owed.length ? h('p', { class: 'note', style: 'margin-top:10px' }, 'Carried to the next payout: ' + info.owed.map((o) => amount(o.amount, o.chain)).join(', ')) : null));
        }
        catch (e) {
            toast(e.message, true);
        }
    };
    const renderConnect = () => {
        setStep(0);
        body.replaceChildren(h('p', { class: 'muted' }, 'Payouts are sent on other chains, so tell us where to send yours. You sign a message with the Solana wallet that holds your coins. Signing is free and doesn’t send a transaction.'), h('button', { class: 'btn', type: 'button', onclick: async () => {
                try {
                    await connectWallet();
                    renderAddress();
                }
                catch (e) {
                    toast(e.message, true);
                }
            } }, icon('wallet'), 'Connect wallet'), d.isDemo ? h('button', { class: 'btn ghost', type: 'button', onclick: () => renderAddress('DemoWa11etXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX') }, 'Try it with a demo wallet') : '');
    };
    const renderAddress = (demoWallet) => {
        const wallet = demoWallet ?? walletAddress();
        if (!wallet)
            return renderConnect();
        setStep(1);
        const sel = h('select', { class: 'input', id: 'link-chain' }, CHAINS.map((c) => h('option', { value: c, selected: c === chain ? true : null }, c)));
        const addr = h('input', { class: 'input mono', id: 'link-addr', placeholder: ADDRESS_HINT[chain], autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'link-hint link-err' });
        const hint = h('p', { class: 'hint', id: 'link-hint' }, ADDRESS_HINT[chain]);
        const err = h('p', { class: 'err', id: 'link-err', hidden: true });
        sel.addEventListener('change', () => { chain = sel.value; hint.textContent = ADDRESS_HINT[chain]; addr.placeholder = ADDRESS_HINT[chain]; err.hidden = true; });
        addr.addEventListener('input', () => { err.hidden = true; });
        addr.addEventListener('blur', () => { if (addr.value && !isValidAddress(chain, addr.value)) {
            err.textContent = `That doesn’t look like a ${chain} address. ${ADDRESS_HINT[chain]}.`;
            err.hidden = false;
        } });
        body.replaceChildren(h('p', { class: 'muted' }, 'Connected: ', h('span', { class: 'mono' }, short(wallet, 6))), h('div', { class: 'row2' }, h('div', { class: 'field' }, h('label', { for: 'link-chain' }, 'Chain'), sel), h('div', { class: 'field' }, h('label', { for: 'link-addr' }, `Your ${chain} address`), addr, hint, err)), h('button', { class: 'btn', type: 'button', onclick: async () => {
                const a = addr.value.trim();
                if (!isValidAddress(chain, a)) {
                    err.textContent = `That doesn’t look like a ${chain} address. ${ADDRESS_HINT[chain]}.`;
                    err.hidden = false;
                    addr.focus();
                    return;
                }
                await renderSign(wallet, a, Boolean(demoWallet));
            } }, 'Continue', icon('arrow')));
        addr.focus();
    };
    const renderSign = async (wallet, address, demo) => {
        setStep(2);
        let msg;
        try {
            msg = await d.linkMessage(wallet, chain, address);
        }
        catch (e) {
            toast(e.message, true);
            return;
        }
        const btn = h('button', { class: 'btn', type: 'button' }, demo ? 'Save (demo)' : 'Sign and save');
        btn.addEventListener('click', async () => {
            btn.setAttribute('disabled', '');
            btn.textContent = 'Saving…';
            try {
                const signature = demo ? 'demo' : await signText(msg.message);
                await d.link({ wallet, chain, address, issuedAt: msg.issuedAt, signature });
                toast(`${chain} payouts will go to ${short(address, 6)}`);
                await showLinked(wallet);
                renderAddress(demo ? wallet : undefined);
            }
            catch (e) {
                toast(e.message || 'Signing was cancelled.', true);
                btn.removeAttribute('disabled');
                btn.textContent = demo ? 'Save (demo)' : 'Sign and save';
            }
        });
        body.replaceChildren(h('p', { class: 'muted' }, 'Your wallet will ask you to sign this exact text:'), h('pre', { class: 'panel mono', style: 'padding:14px;margin:0;white-space:pre-wrap;font-size:13px;overflow-wrap:anywhere;background:var(--bg)' }, msg.message), h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, btn, h('button', { class: 'btn ghost', type: 'button', onclick: () => renderAddress(demo ? wallet : undefined) }, 'Back')));
    };
    if (walletAddress()) {
        renderAddress();
        showLinked(walletAddress());
    }
    else
        renderConnect();
    onWallet((a) => { if (a)
        showLinked(a); });
    return h('div', { style: 'display:flex;flex-direction:column;gap:16px' }, steps, body, linked);
}
