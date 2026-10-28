import { h, onUnmount } from '../lib/dom.js';
function themeColor(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
export function candleChart() {
    const box = h('div', { class: 'chart-box', role: 'img', 'aria-label': 'Price chart' });
    const LWC = window.LightweightCharts;
    let lastScaled = [];
    if (LWC) {
        const chart = LWC.createChart(box, {
            autoSize: true,
            layout: { background: { color: 'transparent' }, textColor: themeColor('--muted'), fontFamily: 'JetBrains Mono, monospace' },
            grid: { vertLines: { color: themeColor('--line') }, horzLines: { color: themeColor('--line') } },
            rightPriceScale: { borderColor: themeColor('--line') }, timeScale: { borderColor: themeColor('--line'), timeVisible: true, secondsVisible: true },
            crosshair: { mode: 1 },
        });
        const series = chart.addCandlestickSeries({
            upColor: themeColor('--up'), downColor: themeColor('--down'), wickUpColor: themeColor('--up'), wickDownColor: themeColor('--down'), borderVisible: false,
            priceFormat: { type: 'custom', minMove: 1e-12, formatter: (p) => fmtAxis(p) },
        });
        const retheme = () => {
            chart.applyOptions({ layout: { textColor: themeColor('--muted') }, grid: { vertLines: { color: themeColor('--line') }, horzLines: { color: themeColor('--line') } }, rightPriceScale: { borderColor: themeColor('--line') }, timeScale: { borderColor: themeColor('--line') } });
            series.applyOptions({ upColor: themeColor('--up'), downColor: themeColor('--down'), wickUpColor: themeColor('--up'), wickDownColor: themeColor('--down') });
        };
        addEventListener('rig:theme', retheme);
        onUnmount(() => { removeEventListener('rig:theme', retheme); chart.remove(); });
        return {
            el: box,
            setData(cs, scale) { series.setData(cs.map((c) => sc(c, scale))); chart.timeScale().fitContent(); },
            update(c, scale) { series.update(sc(c, scale)); },
        };
    }
    // Fallback canvas chart.
    const cv = h('canvas', { class: 'fallback' });
    box.append(cv);
    const draw = () => {
        const ctx = cv.getContext('2d');
        if (!ctx)
            return;
        const W = cv.clientWidth, H = cv.clientHeight, dpr = devicePixelRatio || 1;
        cv.width = W * dpr;
        cv.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const cs = lastScaled.slice(-120);
        if (!cs.length)
            return;
        const lo = Math.min(...cs.map((c) => c.low)), hi = Math.max(...cs.map((c) => c.high)), span = hi - lo || 1;
        const y = (v) => H - 24 - ((v - lo) / span) * (H - 40);
        const w = (W - 70) / cs.length;
        cs.forEach((c, i) => {
            const x = i * w + w / 2;
            ctx.strokeStyle = ctx.fillStyle = c.close >= c.open ? themeColor('--up') : themeColor('--down');
            ctx.beginPath();
            ctx.moveTo(x, y(c.high));
            ctx.lineTo(x, y(c.low));
            ctx.stroke();
            ctx.fillRect(x - w * 0.35, Math.min(y(c.open), y(c.close)), w * 0.7, Math.max(1, Math.abs(y(c.open) - y(c.close))));
        });
        ctx.fillStyle = themeColor('--muted');
        ctx.font = '11px JetBrains Mono, monospace';
        ctx.fillText(fmtAxis(hi), W - 66, 14);
        ctx.fillText(fmtAxis(lo), W - 66, H - 8);
    };
    const ro = new ResizeObserver(draw);
    ro.observe(box);
    onUnmount(() => ro.disconnect());
    return {
        el: box,
        setData(cs, scale) { lastScaled = cs.map((c) => sc(c, scale)); draw(); },
        update(c, scale) { const s = sc(c, scale); const l = lastScaled[lastScaled.length - 1]; if (l && l.time === s.time)
            lastScaled[lastScaled.length - 1] = s;
        else
            lastScaled.push(s); draw(); },
    };
}
function sc(c, k) { return { time: c.time, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k }; }
function fmtAxis(p) {
    if (p >= 1000)
        return p.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 });
    if (p >= 1)
        return p.toFixed(2);
    return p.toPrecision(3);
}
