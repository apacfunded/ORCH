import { market } from "../data/index.js";
import { h, onRemove, svg } from "../lib/dom.js";
import { fmtUsd } from "../lib/format.js";
import { href } from "../lib/router.js";
import { badge, tierBadge } from "./Badge.js";
import { UI, commodityIcon } from "./Icons.js";
import { sparkline } from "./Sparkline.js";
export function commodityTile(c, coins, opts = {}) {
    const mine = coins.filter((x) => x.commodityId === c.id && c.status === "live");
    const vol = mine.reduce((s, x) => s + x.volume24hUsd, 0);
    const top = [...mine].sort((a, b) => b.marketCapUsd - a.marketCapUsd)[0];
    const spark = sparkline([], { color: c.color, fill: false });
    const isLocked = c.status === "locked";
    const el = h("a", { class: `tile ${isLocked ? "locked" : ""}`, href: href(`/board/${c.id}`), style: `--c:${c.color};--c2:${c.color2}`, "aria-label": `${c.name} board` }, h("div", { class: "emblem" }, svg(commodityIcon(c.icon))), svg(commodityIcon(c.icon), "ico"), h("div", { class: "name" }, c.name, tierBadge(c, { tooltip: false })), h("div", { class: "stats" }, h("div", null, "Coins", h("b", { class: "n-coins" }, String(mine.length))), h("div", null, "Volume", h("b", { class: "n-vol" }, fmtUsd(vol))), h("div", { style: "grid-column:1/-1" }, "Top", h("b", { class: "n-top" }, top ? `$${top.ticker}` : "—"))), spark.el, isLocked
        ? h("div", { class: "frost" }, h("div", { class: "lockrow" }, svg(UI.lock), `${c.name} unlocks at 100%: `, h("b", { class: "n-unlock" }, `${Math.round(c.unlockProgress * 100)}%`)), h("div", { class: "bar" }, h("i", { class: "fill", style: `--p:${(c.unlockProgress * 100).toFixed(1)}%` })), badge("locked"))
        : null);
    el.addEventListener("pointerenter", () => opts.onHoverTint?.(c.color));
    el.addEventListener("pointerleave", () => opts.onHoverTint?.(null));
    const off = market().subscribeCommodityQuote(c.id, (q) => spark.setData(q.spark));
    void market().getCommodityQuote(c.id).then((q) => spark.setData(q.spark));
    let off2 = null;
    if (isLocked) {
        const houseCoin = coins.find((x) => x.commodityId === c.id && x.houseToken);
        if (houseCoin) {
            off2 = market().subscribeCoin(houseCoin.mint, (x) => {
                const p = Math.min(1, x.bondingProgress);
                const n = el.querySelector(".n-unlock");
                if (n)
                    n.textContent = `${Math.round(p * 100)}%`;
                const fill = el.querySelector(".fill");
                if (fill)
                    fill.style.setProperty("--p", `${(p * 100).toFixed(1)}%`);
            });
        }
    }
    onRemove(el, () => { off(); off2?.(); spark.destroy(); });
    return el;
}
/** Play the unlock animation on a locked tile and swap it to the live state. */
export function unlockTile(el) {
    const frost = el.querySelector(".frost");
    if (!frost)
        return;
    const lock = frost.querySelector(".lockrow svg");
    lock?.animate([{ transform: "rotate(0)" }, { transform: "rotate(-25deg) translateY(-2px)" }, { transform: "rotate(10deg)" }], { duration: 500, easing: "ease-out" });
    window.setTimeout(() => {
        el.animate([{ transform: "rotateY(0)" }, { transform: "rotateY(90deg)" }, { transform: "rotateY(0)" }], { duration: 700, easing: "ease-in-out" });
        window.setTimeout(() => { frost.remove(); el.classList.remove("locked"); }, 350);
        const sweep = h("div", { style: "position:absolute;inset:0;background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);transform:translateX(-100%);pointer-events:none" });
        el.appendChild(sweep);
        sweep.animate([{ transform: "translateX(-100%)" }, { transform: "translateX(100%)" }], { duration: 900, easing: "ease-out" }).onfinish = () => sweep.remove();
    }, 450);
}
