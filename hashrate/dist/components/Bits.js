import { h, svg } from '../lib/dom.js';
import { targetById } from '../config/targets.js';
import { mineGlyph } from './Icons.js';
/** Colored chip naming what a coin mines. */
export function mineChip(id, opts = {}) {
    const t = targetById(id);
    if (!t)
        return h('span', { class: 'pill' }, id);
    const el = h(opts.href ? 'a' : 'span', { class: 'chip', style: `--mc: var(${t.accent})`, href: opts.href, title: `${t.algo} · pays ${t.chains.join(' + ')}` }, mineGlyph(t.id, 'ico'), t.label);
    return el;
}
export function avatar(c, size = '') {
    return h('span', { class: `av ${size}`, style: `--h:${c.hue}`, 'aria-hidden': 'true' }, c.ticker.slice(0, 1));
}
/** Inline sparkline; color follows the overall move, or a fixed CSS color. */
export function sparkline(values, cls = 'spark', color) {
    const w = 110, ht = 34;
    if (values.length < 2 || values.some((v) => !Number.isFinite(v)))
        return h('span', { class: cls });
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(ht - 3 - ((v - min) / span) * (ht - 6)).toFixed(1)}`);
    const up = values[values.length - 1] >= values[0];
    const col = color ?? (up ? 'var(--up)' : 'var(--down)');
    const last = pts[pts.length - 1].split(',');
    return svg(`<svg viewBox="0 0 ${w} ${ht}" preserveAspectRatio="none">
    <polygon points="0,${ht} ${pts.join(' ')} ${w},${ht}" fill="${col}" opacity=".1"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="2.2" fill="${col}"/></svg>`, cls);
}
export function change(n) {
    if (!Number.isFinite(n))
        return h('span', { class: 'muted' }, '—');
    const up = n >= 0;
    return h('span', { class: up ? 'up' : 'down' }, `${up ? '▲' : '▼'} ${Math.abs(n).toFixed(1)}%`);
}
export function pctText(n) { return Number.isFinite(n) ? `${n.toFixed(1)}%` : '—'; }
/** Section heading with an eyebrow, used everywhere for one consistent rhythm. */
export function sectionHead(eyebrow, title, sub, action) {
    return h('div', { class: 'sec-head reveal' }, h('div', null, h('span', { class: 'eyebrow' }, eyebrow), h('h2', { style: 'margin-top:8px' }, title), sub ? h('p', { style: 'margin-top:8px' }, sub) : null), action ?? null);
}
export function emptyState(text, action) {
    return h('div', { class: 'empty' }, h('p', null, text), action ?? null);
}
export function skeletonRows(n = 6) {
    return h('div', { style: 'display:flex;flex-direction:column;gap:10px;padding:14px' }, Array.from({ length: n }, () => h('div', { class: 'skeleton', style: 'height:38px' })));
}
