// ============================================================
// CHART PANEL — TradingView Lightweight Charts (loaded from a CDN in index.html)
// with a built-in canvas fallback if the library is blocked. Live last candle,
// pulsing price line, timeframe / Price-MCap / USD-commodity toggles with a
// crossfade, pair inset, graduation marker.
// ============================================================
import { byId } from "../config/commodities.js";
import { pairNote } from "../config/brand.js";
import { market } from "../data/index.js";
import { RESOLUTION_SECONDS } from "../data/MarketData.js";
import { h, onRemove, svg } from "../lib/dom.js";
import { fmtNum, fmtPct, fmtSmall, fmtUsd, pctArrow } from "../lib/format.js";
import { reducedMotion } from "../lib/motion.js";
import { commodityIcon } from "./Icons.js";
import { sparkline } from "./Sparkline.js";
const LWC = () => globalThis.LightweightCharts ?? null;
const TIMEFRAMES = ["1s", "1m", "5m", "15m", "1h", "4h", "1D"];
export function chartPanel(coin) {
    const com = byId(coin.commodityId);
    const accent = com?.color ?? "#e6b84a";
    const quoteSym = com?.symbol ?? "QUOTE";
    let res = "1m";
    let mode = "price";
    let denom = "usd";
    let offBars = null;
    let bars = [];
    let lastClose = 0;
    let atRight = true;
    let lastBarT = 0;
    // ---- controls ----
    const tfBtns = TIMEFRAMES.map((tf) => h("button", { class: tf === res ? "active" : "", disabled: tf === "1s" && coin.status === "graduated", title: tf === "1s" ? "1-second candles (bonding curve only)" : tf, onclick: () => setRes(tf) }, tf));
    const modeBtns = ["price", "mcap"].map((m) => h("button", { class: m === mode ? "active" : "", onclick: () => setMode(m) }, m === "price" ? "Price" : "Market cap"));
    const denomBtns = ["usd", "quote"].map((d) => h("button", { class: d === denom ? "active" : "", title: d === "quote" ? `Priced in ${quoteSym}: USD price ÷ ${quoteSym} price. ${pairNote}` : "Price in USD", onclick: () => setDenom(d) }, d === "usd" ? "USD" : quoteSym));
    const legend = h("div", { class: "legend" });
    const insetSpark = sparkline([], { color: accent, fill: false });
    const insetPrice = h("b", null, "—");
    const insetChg = h("span", null, "");
    const inset = h("div", { class: "inset", "aria-label": `${quoteSym} price` }, h("div", { style: "display:flex;align-items:center;gap:6px" }, svg(commodityIcon(com?.icon ?? ""), "ico"), `${quoteSym} · board price`), insetPrice, insetChg, insetSpark.el);
    const gradMark = h("div", { class: "gradmark", style: "display:none" }, "GRADUATED");
    const chartHost = h("div", { style: "position:absolute;inset:0" });
    const wrap = h("div", { class: "chartwrap" }, legend, inset, gradMark, chartHost);
    const el = h("div", { class: "card chartpanel" }, h("div", { class: "chartbar" }, h("div", { class: "seg", role: "group", "aria-label": "Timeframe" }, tfBtns), h("div", { class: "right" }, h("div", { class: "seg", role: "group", "aria-label": "Price or market cap" }, modeBtns), h("div", { class: "seg", role: "group", "aria-label": "Denomination" }, denomBtns))), wrap);
    // ---- rendering backend ----
    const lwc = LWC();
    let chart = null;
    let candles = null;
    let volume = null;
    let fallback = null;
    const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const toLwc = (b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c });
    const toVol = (b) => ({ time: b.t, value: b.v, color: b.c >= b.o ? "rgba(88,214,141,.35)" : "rgba(255,138,92,.35)" });
    const scale = () => (mode === "mcap" ? coin.supply : 1);
    const scaled = (b) => ({ ...b, o: b.o * scale(), h: b.h * scale(), l: b.l * scale(), c: b.c * scale() });
    const fmtVal = (v) => (mode === "mcap" ? (denom === "usd" ? fmtUsd(v) : `${fmtNum(v, 2)} ${quoteSym}`) : denom === "usd" ? `$${fmtSmall(v)}` : `${fmtSmall(v)} ${quoteSym}`);
    const buildChart = () => {
        if (lwc) {
            chart = lwc.createChart(chartHost, {
                layout: { background: { type: lwc.ColorType.Solid, color: "transparent" }, textColor: css("--text-3") || "#8f866f", fontFamily: "IBM Plex Mono, monospace", fontSize: 11 },
                grid: { vertLines: { color: "rgba(246,233,234,.04)" }, horzLines: { color: "rgba(246,233,234,.05)" } },
                crosshair: { mode: lwc.CrosshairMode.Normal },
                rightPriceScale: { borderColor: "rgba(246,233,234,.1)" },
                timeScale: { borderColor: "rgba(246,233,234,.1)", timeVisible: true, secondsVisible: res === "1s", rightOffset: 4 },
                localization: { priceFormatter: (p) => fmtVal(p) },
                handleScroll: true,
                handleScale: true,
            });
            candles = chart.addCandlestickSeries({
                upColor: "#58d68d", downColor: "#ff8a5c", wickUpColor: "#58d68d", wickDownColor: "#ff8a5c", borderVisible: false,
                priceLineVisible: true, priceLineStyle: lwc.LineStyle.Dashed, priceLineColor: accent, lastValueVisible: true,
                priceFormat: { type: "custom", formatter: (p) => fmtVal(p), minMove: 1e-12 },
            });
            volume = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
            volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
            chart.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (r)
                atRight = r.to >= bars.length - 1.5; });
            chart.subscribeCrosshairMove((p) => {
                const d = candles ? p.seriesData.get(candles) : undefined;
                if (d && d.open !== undefined)
                    renderLegend({ t: 0, o: d.open, h: d.high, l: d.low, c: d.close, v: 0 }, true);
                else if (bars.length)
                    renderLegend(scaled(bars[bars.length - 1]), false);
            });
            const ro = new ResizeObserver(() => chart?.resize(chartHost.clientWidth, chartHost.clientHeight));
            ro.observe(chartHost);
        }
        else {
            fallback = new FallbackChart(chartHost, accent, fmtVal);
        }
    };
    const renderLegend = (b, hover) => {
        const pct = b.o ? ((b.c / b.o - 1) * 100) : 0;
        legend.replaceChildren(h("b", null, `${coin.ticker} · ${res}${hover ? "" : " · live"}${denom === "quote" ? ` · in ${quoteSym} (converted)` : ""}`), h("span", null, "O ", h("b", null, fmtVal(b.o))), h("span", null, "H ", h("b", null, fmtVal(b.h))), h("span", null, "L ", h("b", null, fmtVal(b.l))), h("span", null, "C ", h("b", null, fmtVal(b.c))), h("span", { class: pct >= 0 ? "up" : "down" }, `${pctArrow(pct)} ${fmtPct(pct)}`));
        if (b.v)
            legend.appendChild(h("span", null, "Vol ", h("b", null, fmtNum(b.v, 1))));
    };
    const placeGradMark = () => {
        if (!coin.graduatedAt || !chart) {
            gradMark.style.display = "none";
            return;
        }
        const sec = RESOLUTION_SECONDS[res];
        const t = Math.floor(coin.graduatedAt / 1000 / sec) * sec;
        const x = chart.timeScale().timeToCoordinate(t);
        if (x === null || x < 0 || x > chartHost.clientWidth - 70) {
            gradMark.style.display = "none";
            return;
        }
        gradMark.style.display = "flex";
        gradMark.style.left = `${x}px`;
    };
    const load = async (fade) => {
        offBars?.();
        offBars = null;
        if (fade && !reducedMotion()) {
            wrap.classList.add("fading");
            await new Promise((r) => setTimeout(r, 180));
        }
        const sec = RESOLUTION_SECONDS[res];
        const to = Math.floor(Date.now() / 1000);
        const from = to - sec * (res === "1s" ? 240 : 400);
        bars = await market().getBars(coin.pairAddress, res, from, to, denom);
        lastClose = bars.length ? bars[bars.length - 1].c * scale() : 0;
        lastBarT = bars.length ? bars[bars.length - 1].t : 0;
        if (candles && volume && chart) {
            candles.setData(bars.map((b) => toLwc(scaled(b))));
            volume.setData(bars.map(toVol));
            chart.timeScale().applyOptions({ secondsVisible: res === "1s" });
            chart.timeScale().scrollToRealTime();
            if (coin.graduatedAt) {
                candles.setMarkers([{ time: Math.floor(coin.graduatedAt / 1000 / sec) * sec, position: "belowBar", color: accent, shape: "arrowUp", text: "Graduated" }]);
            }
            requestAnimationFrame(placeGradMark);
        }
        else if (fallback) {
            fallback.setData(bars.map(scaled));
        }
        if (bars.length)
            renderLegend(scaled(bars[bars.length - 1]), false);
        wrap.classList.remove("fading");
        offBars = market().subscribeBars(coin.pairAddress, res, denom, (raw) => {
            const b = scaled(raw);
            const isNew = raw.t !== lastBarT;
            if (isNew) {
                bars.push(raw);
                if (bars.length > 2000)
                    bars.shift();
                lastBarT = raw.t;
            }
            else {
                bars[bars.length - 1] = raw;
            }
            if (candles && volume) {
                candles.update(toLwc(b));
                volume.update(toVol(raw));
                if (isNew && atRight)
                    chart?.timeScale().scrollToRealTime();
                if (isNew && !reducedMotion())
                    glowNewCandle();
                const dir = b.c > lastClose ? "up" : b.c < lastClose ? "down" : null;
                if (dir)
                    pulsePriceLine(dir);
            }
            else if (fallback) {
                fallback.update(b, isNew);
            }
            lastClose = b.c;
            renderLegend(b, false);
        });
    };
    let pulseTimer = 0;
    const pulsePriceLine = (dir) => {
        candles?.applyOptions({ priceLineColor: dir === "up" ? "#58d68d" : "#ff8a5c" });
        window.clearTimeout(pulseTimer);
        pulseTimer = window.setTimeout(() => candles?.applyOptions({ priceLineColor: accent }), 350);
    };
    const glowNewCandle = () => {
        const g = h("div", { style: `position:absolute;right:62px;top:0;bottom:0;width:10px;background:linear-gradient(90deg,transparent,${accent}44,transparent);pointer-events:none` });
        wrap.appendChild(g);
        g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600 }).onfinish = () => g.remove();
    };
    const setRes = (tf) => { if (tf === res)
        return; res = tf; tfBtns.forEach((b) => b.classList.toggle("active", b.textContent === tf)); void load(true); };
    const setMode = (m) => { if (m === mode)
        return; mode = m; modeBtns.forEach((b, i) => b.classList.toggle("active", (i === 0) === (m === "price"))); void load(true); };
    const setDenom = (d) => { if (d === denom)
        return; denom = d; denomBtns.forEach((b, i) => b.classList.toggle("active", (i === 0) === (d === "usd"))); void load(true); };
    // ---- pair inset ----
    const applyQuote = (q) => {
        insetPrice.textContent = fmtUsd(q.priceUsd);
        insetChg.textContent = `${pctArrow(q.change24h)} ${fmtPct(q.change24h)} 24h${com?.tier === "house" ? " · house" : ""}`;
        insetChg.className = q.change24h >= 0 ? "up" : "down";
        insetSpark.setData(q.spark);
    };
    void market().getCommodityQuote(coin.commodityId).then(applyQuote);
    const offQuote = market().subscribeCommodityQuote(coin.commodityId, applyQuote);
    buildChart();
    void load(false);
    const onResize = () => placeGradMark();
    window.addEventListener("resize", onResize);
    onRemove(el, () => { offBars?.(); offQuote(); insetSpark.destroy(); chart?.remove(); fallback?.destroy(); window.removeEventListener("resize", onResize); });
    return el;
}
// ============================================================
// FALLBACK — plain canvas candles + volume, used only if the CDN script failed.
// ============================================================
class FallbackChart {
    constructor(host, accent, fmt) {
        this.host = host;
        this.accent = accent;
        this.fmt = fmt;
        this.bars = [];
        this.raf = 0;
        this.canvas = h("canvas", { class: "fallbackchart" });
        this.note = h("div", { style: "position:absolute;left:10px;bottom:8px;font:10px IBM Plex Mono,monospace;color:var(--text-3)" }, "basic chart · chart library did not load");
        host.append(this.canvas, this.note);
        this.ro = new ResizeObserver(() => this.draw());
        this.ro.observe(host);
    }
    setData(b) { this.bars = b.slice(-140); this.draw(); }
    update(b, isNew) {
        if (isNew) {
            this.bars.push(b);
            if (this.bars.length > 140)
                this.bars.shift();
        }
        else
            this.bars[this.bars.length - 1] = b;
        if (!this.raf)
            this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
    }
    draw() {
        const dpr = Math.min(2, devicePixelRatio || 1);
        const w = this.host.clientWidth, hgt = this.host.clientHeight;
        this.canvas.width = w * dpr;
        this.canvas.height = hgt * dpr;
        const c = this.canvas.getContext("2d");
        if (!c)
            return;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, w, hgt);
        if (!this.bars.length)
            return;
        const right = 96, top = 34, bottom = 30;
        const plotW = w - right, plotH = hgt - top - bottom;
        const volH = plotH * 0.18;
        const min = Math.min(...this.bars.map((b) => b.l)), max = Math.max(...this.bars.map((b) => b.h));
        const vmax = Math.max(...this.bars.map((b) => b.v)) || 1;
        const span = max - min || max * 0.01 || 1;
        const bw = plotW / this.bars.length;
        const y = (v) => top + (1 - (v - min) / span) * (plotH - volH - 8);
        c.strokeStyle = "rgba(246,233,234,.06)";
        c.lineWidth = 1;
        c.font = "10px IBM Plex Mono, monospace";
        c.fillStyle = "#8f866f";
        c.textAlign = "left";
        for (let i = 0; i <= 5; i++) {
            const v = min + (span * i) / 5;
            const yy = y(v);
            c.beginPath();
            c.moveTo(0, yy);
            c.lineTo(plotW, yy);
            c.stroke();
            c.fillText(this.fmt(v), plotW + 6, yy + 3);
        }
        this.bars.forEach((b, i) => {
            const x = i * bw + bw / 2;
            const up = b.c >= b.o;
            c.strokeStyle = c.fillStyle = up ? "#58d68d" : "#ff8a5c";
            c.beginPath();
            c.moveTo(x, y(b.h));
            c.lineTo(x, y(b.l));
            c.stroke();
            const t = Math.min(y(b.o), y(b.c));
            const hh = Math.max(1, Math.abs(y(b.o) - y(b.c)));
            c.fillRect(x - bw * 0.3, t, bw * 0.6, hh);
            c.globalAlpha = 0.35;
            c.fillRect(x - bw * 0.3, hgt - bottom - (b.v / vmax) * volH, bw * 0.6, (b.v / vmax) * volH);
            c.globalAlpha = 1;
        });
        const last = this.bars[this.bars.length - 1];
        c.setLineDash([4, 4]);
        c.strokeStyle = this.accent;
        c.beginPath();
        c.moveTo(0, y(last.c));
        c.lineTo(plotW, y(last.c));
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = this.accent;
        c.fillRect(plotW, y(last.c) - 8, right, 16);
        c.fillStyle = "#1a1304";
        c.fillText(this.fmt(last.c), plotW + 4, y(last.c) + 4);
    }
    destroy() { this.ro.disconnect(); if (this.raf)
        cancelAnimationFrame(this.raf); }
}
