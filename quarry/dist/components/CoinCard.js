import { byId } from "../config/commodities.js";
import { market } from "../data/index.js";
import { h, onRemove, svg } from "../lib/dom.js";
import { fmtNum, fmtPct, fmtUsd, pctArrow } from "../lib/format.js";
import { flash, reducedMotion } from "../lib/motion.js";
import { href } from "../lib/router.js";
import { badge, tierBadge } from "./Badge.js";
import { UI, commodityIcon } from "./Icons.js";
import { odometer } from "./Odometer.js";
import { sparkline } from "./Sparkline.js";
import { copyText } from "./Toasts.js";
export function coinCard(coin, opts = {}) {
    const com = byId(coin.commodityId);
    const accent = com?.color ?? "#e6b84a";
    const accent2 = com?.color2 ?? accent;
    const isNew = Date.now() - coin.createdAt < 60000;
    const mcap = odometer(fmtUsd(coin.marketCapUsd));
    const pct = h("span", { class: `pct ${coin.change24hPct >= 0 ? "up" : "down"}` }, `${pctArrow(coin.change24hPct)} ${fmtPct(coin.change24hPct)}`);
    const vol = h("span", null, `Vol ${fmtUsd(coin.volume24hUsd)}`);
    const holders = h("span", null, `${fmtNum(coin.holders)} holders`);
    const spark = sparkline(coin.spark, { color: "auto", glow: true });
    const bondBar = h("div", { class: "bar", style: `--c:${accent};--c2:${accent2}` }, h("i", { style: `--p:${(coin.bondingProgress * 100).toFixed(1)}%` }));
    const bondPct = h("span", null, `${Math.round(coin.bondingProgress * 100)}%`);
    const bond = coin.status === "graduated"
        ? h("div", { class: "spacer" })
        : h("div", null, h("div", { class: "bond" }, h("span", null, "curve"), bondBar, bondPct), h("div", { class: "spacer" }));
    const statusEl = h("span", null, coin.status === "graduated" ? badge("graduated") : isNew ? badge("new") : null);
    const copyBtn = h("button", {
        class: "iconbtn", title: "Copy contract address", "aria-label": "Copy contract address",
        onclick: (e) => { e.preventDefault(); e.stopPropagation(); void copyText(coin.mint, copyBtn); },
    });
    copyBtn.innerHTML = UI.copy;
    const el = h("a", { class: "coin", href: href(`/coin/${coin.mint}`), style: `--c:${accent};--c2:${accent2}`, "aria-label": `${coin.name} $${coin.ticker}` }, h("div", { class: "top" }, h("img", { src: coin.image, alt: "", loading: "lazy" }), h("div", { class: "ids" }, h("div", { class: "tk" }, `$${coin.ticker}`, statusEl), h("div", { class: "nm" }, coin.name)), h("div", { class: "acts" }, coin.rewards ? h("span", { class: "iconbtn", title: "Holder rewards paid in the quote commodity" }, svg(UI.gift)) : null, copyBtn)), h("div", { class: "mcap" }, mcap.el, pct), h("div", { class: "pair" }, h("span", null, "Paired with"), svg(commodityIcon(com?.icon ?? ""), "ico"), h("span", { class: "sym" }, com?.symbol ?? "?"), com ? tierBadge(com) : null), h("div", { class: "vol" }, vol, holders), bond, spark.el, h("div", { class: "emblem" }, h("i", { class: "ring" }), h("i", { class: "ring r2" }), h("i", { class: "ring r3" }), svg(commodityIcon(com?.icon ?? ""))));
    // 3D tilt toward the cursor
    if (!reducedMotion()) {
        el.addEventListener("pointermove", (e) => {
            const r = el.getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width - 0.5;
            const y = (e.clientY - r.top) / r.height - 0.5;
            el.style.transform = `translateY(-3px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg)`;
        });
        el.addEventListener("pointerleave", () => { el.style.transform = ""; opts.onHoverTint?.(null); });
        el.addEventListener("pointerenter", () => opts.onHoverTint?.(accent));
    }
    // live updates
    if (opts.live !== false) {
        let lastPrice = coin.priceUsd;
        let lastSpark = coin.spark.length;
        const off = market().subscribeCoin(coin.mint, (c) => {
            const dir = c.priceUsd > lastPrice ? "up" : c.priceUsd < lastPrice ? "down" : null;
            if (dir && Math.abs(c.priceUsd / lastPrice - 1) > 0.008)
                flash(el, dir);
            lastPrice = c.priceUsd;
            mcap.set(fmtUsd(c.marketCapUsd), dir);
            pct.className = `pct ${c.change24hPct >= 0 ? "up" : "down"}`;
            pct.textContent = `${pctArrow(c.change24hPct)} ${fmtPct(c.change24hPct)}`;
            vol.textContent = `Vol ${fmtUsd(c.volume24hUsd)}`;
            if (c.spark.length && c.spark[c.spark.length - 1] !== coin.spark[coin.spark.length - 1]) {
                spark.push(c.spark[c.spark.length - 1]);
                coin.spark = c.spark;
                lastSpark = c.spark.length;
            }
            void lastSpark;
            if (c.status !== coin.status) {
                coin.status = c.status;
                if (c.status === "graduated") {
                    statusEl.replaceChildren(badge("graduated"));
                    bond.replaceWith(h("div", { class: "spacer" }));
                    el.animate([{ boxShadow: "0 0 0 0 rgba(224,52,74,.9)" }, { boxShadow: "0 0 0 18px rgba(224,52,74,0)" }], { duration: 900, easing: "ease-out" });
                }
            }
            else if (c.status !== "graduated") {
                bondBar.firstChild.style.setProperty("--p", `${(c.bondingProgress * 100).toFixed(1)}%`);
                bondPct.textContent = `${Math.round(c.bondingProgress * 100)}%`;
            }
        });
        onRemove(el, () => { off(); spark.destroy(); });
    }
    return el;
}
export function coinSkeleton() {
    return h("div", { class: "coin", "aria-hidden": "true" }, h("div", { class: "top" }, h("div", { class: "skel", style: "width:44px;height:44px;border-radius:50%" }), h("div", { class: "ids" }, h("div", { class: "skel", style: "height:14px;width:60%" }), h("div", { class: "skel", style: "height:10px;width:40%;margin-top:6px" }))), h("div", { class: "skel", style: "height:26px;width:50%;margin-top:14px" }), h("div", { class: "skel", style: "height:12px;width:70%;margin-top:12px" }), h("div", { class: "skel", style: "height:34px;width:60%;margin-top:22px;border-radius:4px" }));
}
