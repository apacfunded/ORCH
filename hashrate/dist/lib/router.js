// Hash routing: #/coin/<mint>, #/mine/<slug>, … so deep links work on GitHub Pages subpaths.
const PATTERNS = [
    ['home', /^\/?$/, []],
    ['mines', /^\/mines\/?$/, []],
    ['mine', /^\/mine\/([a-z0-9-]+)\/?$/, ['slug']],
    ['coin', /^\/coin\/([1-9A-HJ-NP-Za-km-z]{20,48})\/?$/, ['mint']],
    ['launch', /^\/launch\/?$/, []],
    ['ledger', /^\/ledger\/?$/, []],
    ['link', /^\/link\/?$/, []],
    ['docs', /^\/docs\/?$/, []],
];
export function parse(hash) {
    const path = hash.replace(/^#/, '') || '/';
    for (const [name, re, keys] of PATTERNS) {
        const m = path.match(re);
        if (m)
            return { name, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return { name: '404', params: {} };
}
export function startRouter(handler) {
    const go = () => handler(parse(location.hash));
    addEventListener('hashchange', go);
    go();
}
export const href = (path) => `#${path}`;
export const navigate = (path) => { location.hash = path; };
