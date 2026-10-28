export function usd(n, compact = false) {
    if (!Number.isFinite(n))
        return '—';
    if (compact && Math.abs(n) >= 1000)
        return '$' + Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
    if (Math.abs(n) < 0.01 && n !== 0)
        return '$' + n.toPrecision(2);
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** Tiny memecoin prices: $0.0₅4213 style. */
export function price(n) {
    if (!Number.isFinite(n))
        return '—';
    if (n >= 0.01)
        return '$' + n.toFixed(4);
    const s = n.toFixed(12);
    const m = s.match(/^0\.(0+)(\d{4})/);
    if (!m)
        return '$' + n.toPrecision(4);
    const subs = '₀₁₂₃₄₅₆₇₈₉';
    const z = String(m[1].length).split('').map((d) => subs[+d]).join('');
    return `$0.0${z}${m[2]}`;
}
export function amount(n, unit) {
    const digits = n >= 1000 ? 0 : n >= 1 ? 2 : n >= 0.01 ? 4 : 6;
    return `${n.toLocaleString('en-US', { maximumFractionDigits: digits })} ${unit}`;
}
export function num(n, digits = 1) {
    return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}
export function pctChange(n) {
    const up = n >= 0;
    return { text: `${up ? '▲' : '▼'} ${Math.abs(n).toFixed(1)}%`, up };
}
export function ago(ts) {
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 60)
        return `${s}s ago`;
    if (s < 3600)
        return `${Math.floor(s / 60)}m ago`;
    if (s < 86400)
        return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}
export function countdown(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return `${h}h ${String(m).padStart(2, '0')}m ${String(r).padStart(2, '0')}s`;
}
export const short = (a, n = 4) => (a.length > n * 2 + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a);
