import { reducedMotion } from './dom.js';
/** True once JS confirmed motion is OK; CSS reveals are gated on html.motion-ok. */
export const motionOk = () => document.documentElement.classList.contains('motion-ok');
export function initMotion() {
    if (!reducedMotion())
        document.documentElement.classList.add('motion-ok');
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => document.documentElement.classList.toggle('motion-ok', !e.matches));
}
/** Rolling number: animates from the shown value to the new one, with an up/down flash. */
export function rollTo(el, to, fmt, ms = 700) {
    const from = Number(el.dataset.v ?? to);
    el.dataset.v = String(to);
    if (!motionOk() || from === to || !Number.isFinite(from) || !Number.isFinite(to)) {
        el.textContent = fmt(to);
        return;
    }
    const start = performance.now();
    const step = (t) => {
        const k = Math.min(1, (t - start) / ms);
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (k < 1)
            requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth;
    el.classList.add(to > from ? 'flash-up' : 'flash-down');
}
/** Fade + rise for newly added rows. */
export function enter(el) {
    if (!motionOk())
        return;
    el.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' });
}
export function flashRow(el) {
    if (!motionOk())
        return;
    el.classList.remove('row-flash');
    void el.offsetWidth;
    el.classList.add('row-flash');
}
/* ---- reveal on scroll (IntersectionObserver; content is visible without JS) ---- */
let io = null;
export function observeReveals(root = document) {
    if (!motionOk())
        return;
    io ?? (io = new IntersectionObserver((entries) => {
        for (const e of entries)
            if (e.isIntersecting) {
                e.target.classList.add('in');
                io.unobserve(e.target);
            }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }));
    root.querySelectorAll('.reveal:not(.in), .h-mask:not(.in)').forEach((el) => io.observe(el));
    // Safety net: nothing stays hidden for long, whatever the scroll position (thumbnails, print, odd viewports).
    window.setTimeout(() => root.querySelectorAll('.reveal:not(.in), .h-mask:not(.in)').forEach((el) => el.classList.add('in')), 1500);
    if (!scrollBound) {
        scrollBound = true;
        // A jump scroll (End key, anchor) can skip past elements before the observer sees them: reveal anything already above the fold.
        let t = 0;
        addEventListener('scroll', () => { if (t)
            return; t = window.setTimeout(() => { t = 0; document.querySelectorAll('.reveal:not(.in), .h-mask:not(.in)').forEach((el) => { if (el.getBoundingClientRect().top < innerHeight)
            el.classList.add('in'); }); }, 120); }, { passive: true });
    }
}
let scrollBound = false;
/** Split a heading's text into masked lines (pass the lines explicitly so wrapping stays predictable). */
export function maskedLines(el, lines) {
    el.classList.add('h-mask');
    el.replaceChildren(...lines.map((l, i) => { const s = document.createElement('span'); s.className = 'h-line'; s.style.setProperty('--i', String(i)); s.append(l); return s; }));
    return el;
}
/* ---- pointer effects (desktop only) ---- */
export function bindPointerEffects(root = document) {
    if (!motionOk() || matchMedia('(pointer: coarse)').matches)
        return;
    root.querySelectorAll('.btn.magnetic').forEach((b) => {
        if (b.dataset.mag)
            return;
        b.dataset.mag = '1';
        b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); const dx = (e.clientX - r.left - r.width / 2) / r.width, dy = (e.clientY - r.top - r.height / 2) / r.height; b.style.transform = `translate(${dx * 8}px, ${dy * 8}px)`; });
        b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
    root.querySelectorAll('.spot').forEach((c) => {
        if (c.dataset.spot)
            return;
        c.dataset.spot = '1';
        c.addEventListener('pointermove', (e) => { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', `${e.clientX - r.left}px`); c.style.setProperty('--my', `${e.clientY - r.top}px`); });
    });
}
