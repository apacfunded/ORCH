// Assay certificate card for a coin (grids, fresh assays, launch preview).
import { elNum, elementOf } from "../config/elements.js";
import { byId } from "../config/commodities.js";
import { market } from "../data/index.js";
import { h, onRemove } from "../lib/dom.js";
import { fmtPct, fmtQuote, fmtSmall, fmtUsd, pctArrow, timeAgo } from "../lib/format.js";
import { flash } from "../lib/motion.js";
import { href } from "../lib/router.js";
export function miniEl(commodityId) {
    const e = elementOf(commodityId);
    const c = e?.c ?? byId(commodityId);
    return h("span", { class: "mini-el", style: `--c:${c?.color ?? "var(--ink)"}`, title: c?.name ?? "" }, h("small", null, e ? elNum(e.n) : "--"), e?.sym ?? "?");
}
export function assayNo(coin) {
    // Stable serial from the mint so the same coin always shows the same number.
    let x = 0;
    for (const ch of coin.mint)
        x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    return String(x % 100000).padStart(5, "0");
}
export function certCard(coin, opts = {}) {
    const com = byId(coin.commodityId);
    const e = elementOf(coin.commodityId);
    const sym = com?.symbol ?? "—";
    const usd = h("dd", null, `$${fmtSmall(coin.priceUsd)}`);
    const inCom = h("dd", null, coin.priceQuote ? fmtQuote(coin.priceQuote, sym) : "—");
    const mcap = h("dd", null, fmtUsd(coin.marketCapUsd));
    const chg = h("dd", { class: coin.change24hPct >= 0 ? "up" : "down" }, `${pctArrow(coin.change24hPct)} ${fmtPct(coin.change24hPct)}`);
    const fill = h("i", { style: `--p:${(Math.min(1, coin.bondingProgress) * 100).toFixed(1)}%` });
    const pct = h("span", null, coin.status === "graduated" ? "GRAD" : `${Math.round(coin.bondingProgress * 100)}%`);
    const age = h("span", null, timeAgo(coin.createdAt));
    const tagName = opts.preview ? "div" : "a";
    const el = h(tagName, { class: `cert ${opts.fresh ? "new" : ""}`, href: opts.preview ? undefined : href(`/coin/${coin.mint}`), style: `--c:${com?.color ?? "var(--ink)"}`, "aria-label": opts.preview ? undefined : `${coin.name} $${coin.ticker}` }, h("div", { class: "chead" }, h("span", null, `Assay Nº ${opts.preview ? "-----" : assayNo(coin)}`), h("span", null, e ? `${elNum(e.n)} · ${com.name}` : "No element")), h("div", { class: "cbody" }, h("img", { src: coin.image, alt: "", loading: "lazy" }), h("div", { style: "min-width:0" }, h("div", { class: "tk" }, `$${coin.ticker}`), h("div", { class: "nm" }, coin.name)), miniEl(coin.commodityId)), h("dl", null, h("div", null, h("dt", null, "Price USD"), usd), h("div", null, h("dt", null, `In ${sym}`), inCom), h("div", null, h("dt", null, "Mkt cap"), mcap), h("div", null, h("dt", null, "24H"), chg)), h("div", { class: "cfoot" }, h("span", null, "CURVE"), h("div", { class: "gauge" }, fill), pct, h("span", { class: "muted" }, "·"), age, h("span", { class: "stampmini", title: "Creator fees locked on-chain at launch: 70% creator, 20% buyback & burn, 10% holders" }, "70/20/10")));
    if (opts.live !== false && !opts.preview) {
        let last = coin.priceUsd;
        const off = market().subscribeCoin(coin.mint, (c) => {
            const dir = c.priceUsd > last ? "up" : c.priceUsd < last ? "down" : null;
            if (dir && last && Math.abs(c.priceUsd / last - 1) > 0.008)
                flash(el, dir);
            last = c.priceUsd;
            usd.textContent = `$${fmtSmall(c.priceUsd)}`;
            inCom.textContent = c.priceQuote ? fmtQuote(c.priceQuote, sym) : "—";
            mcap.textContent = fmtUsd(c.marketCapUsd);
            chg.textContent = `${pctArrow(c.change24hPct)} ${fmtPct(c.change24hPct)}`;
            chg.className = c.change24hPct >= 0 ? "up" : "down";
            fill.style.setProperty("--p", `${(Math.min(1, c.bondingProgress) * 100).toFixed(1)}%`);
            pct.textContent = c.status === "graduated" ? "GRAD" : `${Math.round(c.bondingProgress * 100)}%`;
            age.textContent = timeAgo(c.createdAt);
        });
        onRemove(el, off);
    }
    return el;
}
export function emptyNote(title, sub, cta) {
    return h("div", { class: "empty" }, h("div", { class: "serif" }, title), sub ? h("p", null, sub) : null, cta ?? null);
}
