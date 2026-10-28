/** Tiny element helper: h('div', {class:'x', onclick: fn}, 'text', child) */
export function h(tag, attrs = null, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
            if (v === undefined || v === null || v === false)
                continue;
            if (k.startsWith('on') && typeof v === 'function')
                el.addEventListener(k.slice(2).toLowerCase(), v);
            else if (k === 'html')
                el.innerHTML = String(v);
            else if (v === true)
                el.setAttribute(k, '');
            else
                el.setAttribute(k, String(v));
        }
    }
    append(el, children);
    return el;
}
export function append(el, children) {
    for (const c of children) {
        if (c === null || c === undefined || c === false)
            continue;
        if (Array.isArray(c))
            append(el, c);
        else
            el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
}
/** SVG helper for icons and small drawings. */
export function svg(markup, cls = 'ico') {
    const t = document.createElement('template');
    t.innerHTML = markup.trim();
    const s = t.content.firstElementChild;
    s.setAttribute('class', cls);
    s.setAttribute('aria-hidden', 'true');
    return s;
}
export const $ = (sel, root = document) => root.querySelector(sel);
/** Runs cleanup functions when a page is replaced. */
const cleanups = [];
export function onUnmount(fn) { cleanups.push(fn); }
export function runCleanups() { while (cleanups.length) {
    try {
        cleanups.pop()();
    }
    catch { /* ignore */ }
} }
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
