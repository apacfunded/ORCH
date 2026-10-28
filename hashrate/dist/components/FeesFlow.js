import { h, onUnmount } from '../lib/dom.js';
import { FEES, pct } from '../config/fees.js';
import { motionOk } from '../lib/motion.js';
/**
 * "How fees flow": a diagram whose edges draw node by node as five steps light up.
 * Desktop with motion: the diagram sticks while the steps scroll past and light it up. Otherwise: static diagram with numbered steps.
 */
const STEPS = [
    ['Trades pay fees', 'Every buy and sell on the coin earns creator fees on pump.fun, into a wallet that belongs to that coin alone.'],
    ['Hashrate takes its cut', `${pct(FEES.rigCut)} of every coin’s fees goes to $HASH, which runs a mine of its own for $HASH holders.`],
    ['Fees rent hashpower', 'The rent share set at launch buys real hashpower on the coin’s mine. Every coin on the same mine is pooled into one order.'],
    ['The rest buys the coin', 'The remainder buys the mined coin directly. Rented hashpower usually mines a little less than it costs, so this part carries most of the payout.'],
    ['Holders get paid', `Mined and bought coins land in the pot. Every ${FEES.payoutEveryHours} hours it’s paid to holders who linked an address, by bag size.`],
];
export function feesFlowDiagram() {
    const node = (id, x, y, w, label, sub, cls = '') => `<g class="node ${cls}" data-n="${id}"><rect x="${x}" y="${y}" width="${w}" height="54" rx="8"/><text x="${x + w / 2}" y="${y + 23}" text-anchor="middle">${label}</text><text class="sub" x="${x + w / 2}" y="${y + 41}" text-anchor="middle">${sub}</text></g>`;
    const edge = (id, d, cls = '') => `<path class="edge ${cls}" data-e="${id}" d="${d}"/>`;
    const svgText = `<svg viewBox="0 0 640 310" role="img" aria-label="Fees flow from trades to the creator wallet, then to $HASH, rentals and direct buys, then into the pot and to holders">
    ${edge('e1', 'M150 47 L250 47')}${edge('e2', 'M390 47 L490 47')}${edge('e3', 'M320 74 L320 120')}${edge('e4', 'M390 60 L490 120')}
    ${edge('e5', 'M320 174 L320 220', 'gold')}${edge('e6', 'M560 174 L400 226', 'gold')}${edge('e7', 'M390 247 L490 247', 'gold')}
    ${node('n1', 10, 20, 140, 'Trades', 'on pump.fun')}${node('n2', 250, 20, 140, 'Creator wallet', 'one per coin')}${node('n3', 490, 20, 140, '$HASH', pct(FEES.rigCut))}
    ${node('n4', 250, 120, 140, 'Rent hashpower', 'pooled order', 'accent')}${node('n5', 490, 120, 140, 'Buy directly', 'the mined coin', 'accent')}
    ${node('n6', 250, 220, 140, 'Pot', 'per coin, per chain', 'gold')}${node('n7', 490, 220, 140, 'Holders', `every ${FEES.payoutEveryHours}h, by bag`, 'gold')}
  </svg>`;
    const el = h('div', { class: 'flow-art panel', style: 'padding:12px' });
    el.innerHTML = svgText;
    const lit = {
        0: { n: ['n1', 'n2'], e: ['e1'] }, 1: { n: ['n3'], e: ['e2'] }, 2: { n: ['n4'], e: ['e3'] }, 3: { n: ['n5'], e: ['e4'] }, 4: { n: ['n6', 'n7'], e: ['e5', 'e6', 'e7'] },
    };
    const light = (step) => {
        el.querySelectorAll('.node, .edge').forEach((x) => x.classList.remove('lit'));
        for (let i = 0; i <= step; i++) {
            for (const n of lit[i].n)
                el.querySelector(`[data-n="${n}"]`)?.classList.add('lit');
            for (const e of lit[i].e)
                el.querySelector(`[data-e="${e}"]`)?.classList.add('lit');
        }
    };
    return { el, light };
}
export function feesFlowSection() {
    const art = feesFlowDiagram();
    const steps = STEPS.map(([t, p], i) => h('div', { class: 'flow-step', 'data-step': i }, h('span', { class: 'label' }, `Step ${i + 1}`), h('h3', { style: 'margin-top:6px' }, t), h('p', null, p)));
    const sec = h('div', { class: 'flow-sec' }, h('div', { class: 'flow-steps' }, steps), art.el);
    const setStep = (i) => { steps.forEach((s, k) => s.classList.toggle('on', k === i)); art.light(i); };
    setStep(4); // complete at rest: everything lit until motion takes over
    const desktop = matchMedia('(min-width: 961px)').matches;
    if (motionOk() && desktop) {
        sec.classList.add('pinned');
        let raf = 0;
        const update = () => {
            raf = 0;
            const mid = innerHeight * 0.55;
            let best = 0, bestD = Infinity;
            steps.forEach((el, i) => { const r = el.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - mid); if (d < bestD) {
                bestD = d;
                best = i;
            } });
            const last = steps[steps.length - 1].getBoundingClientRect();
            if (last.bottom < mid)
                best = 4;
            setStep(best);
        };
        const onScroll = () => { if (!raf)
            raf = requestAnimationFrame(update); };
        addEventListener('scroll', onScroll, { passive: true });
        update();
        onUnmount(() => { removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); });
    }
    return sec;
}
