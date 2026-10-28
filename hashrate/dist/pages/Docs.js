import { h } from '../lib/dom.js';
import { href } from '../lib/router.js';
import { TARGETS } from '../config/targets.js';
import { FEES, pct } from '../config/fees.js';
import { feesFlowDiagram } from '../components/FeesFlow.js';
export function docsPage() {
    const diagram = feesFlowDiagram();
    diagram.light(4);
    const sections = [
        ['flow', 'How fees flow', [
                para('Every coin on Hashrate is a normal pump.fun coin that trades in SOL. pump.fun pays the coin’s creator wallet a fee on every trade. Hashrate claims those fees and splits them:'),
                list([`${pct(FEES.rigCut)} to $HASH, which runs its own mine for $HASH holders.`, 'Of the rest, the share set at launch rents hashpower on the coin’s chosen mine.', 'Everything else buys the mined coin directly.']),
                para('Payouts only send out what was mined or bought. The rental budget is set aside first, so payouts never eat the mining money.'),
                diagram.el,
            ]],
        ['wallets', 'One wallet per coin', [para('pump.fun pays out all of a creator wallet’s fees in a single claim. If two coins shared a wallet, there’d be no way to tell whose fees were whose. So every coin on Hashrate launches from its own fresh creator wallet.')]],
        ['economics', 'Rental economics', [
                para('Hashpower is rented on NiceHash or MiningRigRentals. These markets price hashpower close to what it mines, so renting usually returns a little less than it costs. Hashrate’s estimates assume a ', strong(`${Math.round(FEES.rentalLoss * 100)}% loss`), '.'),
                para('That’s why direct buys exist: they carry most of the payout, and the rented mining is what makes it a real mine. Pick a higher rent share for more mining, or a lower one for bigger payouts.'),
                para('Rentals from every coin on the same mine are pooled into one order, which clears marketplace minimums. Mined coins are shared back in proportion to what each coin spent over the last three days.'),
            ]],
        ['mines', 'The mines', [...TARGETS.map((t) => para(strong(`${t.label} · ${t.algo}.`), ` ${t.blurb} Holders are paid in ${t.chains.join(' and ')}.${t.autoTracked ? '' : ' Mined amounts are recorded by hand for now.'}`))]],
        ['merged', 'Merged mining', [para('Litecoin and Dogecoin share the Scrypt algorithm, and Dogecoin accepts proof of work from Litecoin miners. One Scrypt rental earns both coins, so LTC + DOGE coins pay holders twice from one rental.')]],
        ['linking', 'Linking a payout address', [
                para('Payouts happen on other chains, so holders tell Hashrate where to send them. You sign a short message with the Solana wallet that holds the coin. Signing is free, sends no transaction and moves no funds. The signature proves the address belongs to the holder.'),
                para('Holders who never link an address aren’t paid on that chain. Their share stays in the pot for the next round. ', h('a', { href: href('/link'), style: 'color:var(--accent)' }, 'Link an address →')),
            ]],
        ['payouts', 'Payout rules', [list([`Payouts run every ${FEES.payoutEveryHours} hours.`, 'Each pot is split across linked holders by bag size, read from the chain at payout time.', 'Shares under the chain’s minimum carry to the next payout instead of being lost.', 'The coin’s creator wallet, the bonding curve and AMM pools are never paid.', 'Every claim, rental, mined amount, buy and payout is logged on the public Ledger.'])]],
        ['risks', 'Risks', [para('Memecoins can go to zero. Mining output depends on coin prices, difficulty and pool luck. Rental markets can change their prices or rules. Nothing on this site is financial advice.')]],
    ];
    return h('div', { class: 'page tight' }, h('div', { class: 'page-title' }, h('span', { class: 'eyebrow' }, 'Docs'), h('h1', { style: 'margin-top:10px' }, 'How Hashrate works')), h('div', { class: 'docs' }, h('nav', { class: 'toc', 'aria-label': 'On this page' }, sections.map(([id, title]) => h('a', { href: '#/docs', onclick: (e) => { e.preventDefault(); document.getElementById(`doc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, title))), h('article', { class: 'prose' }, sections.flatMap(([id, title, kids]) => [h('h2', { id: `doc-${id}` }, title), ...kids]))));
}
function para(...kids) { return h('p', null, ...kids); }
function strong(t) { return h('strong', null, t); }
function list(items) { return h('ul', null, items.map((i) => h('li', null, i))); }
