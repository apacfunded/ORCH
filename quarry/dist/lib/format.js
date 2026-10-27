export function fmtUsd(n, opts = { compact: true }) {
    if (!isFinite(n))
        return "—";
    if (opts.compact) {
        const abs = Math.abs(n);
        if (abs >= 1e9)
            return `$${(n / 1e9).toFixed(2)}B`;
        if (abs >= 1e6)
            return `$${(n / 1e6).toFixed(2)}M`;
        if (abs >= 1e3)
            return `$${(n / 1e3).toFixed(1)}K`;
        if (abs >= 1)
            return `$${n.toFixed(2)}`;
    }
    return `$${fmtSmall(n)}`;
}
/** Small prices: keep significant digits, collapse leading zeros as 0.0₅412 style. */
export function fmtSmall(n) {
    if (n === 0)
        return "0";
    if (n >= 1)
        return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
    const s = n.toFixed(12);
    const m = s.match(/^0\.(0*)(\d+)/);
    if (!m)
        return n.toPrecision(4);
    const zeros = m[1].length;
    const digits = m[2].slice(0, 4).replace(/0+$/, "") || "0";
    if (zeros >= 4)
        return `0.0${subscript(zeros)}${digits}`;
    return `0.${"0".repeat(zeros)}${digits}`;
}
function subscript(n) {
    const map = "₀₁₂₃₄₅₆₇₈₉";
    return String(n).split("").map((d) => map[Number(d)]).join("");
}
export function fmtNum(n, digits = 0) {
    if (!isFinite(n))
        return "—";
    const abs = Math.abs(n);
    if (abs >= 1e9)
        return `${(n / 1e9).toFixed(2)}B`;
    if (abs >= 1e6)
        return `${(n / 1e6).toFixed(2)}M`;
    if (abs >= 1e3)
        return `${(n / 1e3).toFixed(1)}K`;
    return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}
export function fmtQuote(n, symbol) {
    return `${fmtSmall(n)} ${symbol}`;
}
export function fmtPct(n) {
    if (!isFinite(n))
        return "—";
    const sign = n > 0 ? "+" : n < 0 ? "−" : "";
    return `${sign}${Math.abs(n).toFixed(1)}%`;
}
export function pctArrow(n) {
    return n > 0 ? "▲" : n < 0 ? "▼" : "•";
}
export function shortAddr(a, n = 4) {
    if (!a)
        return "";
    return a.length <= n * 2 + 1 ? a : `${a.slice(0, n)}…${a.slice(-n)}`;
}
export function timeAgo(ts) {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60)
        return `${Math.floor(s)}s ago`;
    if (s < 3600)
        return `${Math.floor(s / 60)}m ago`;
    if (s < 86400)
        return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}
export function fmtTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour12: false });
}
