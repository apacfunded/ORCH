import { byId } from "../config/commodities.js";
import { market } from "../data/index.js";
import { h, onRemove, svg } from "../lib/dom.js";
import { timeAgo } from "../lib/format.js";
import { href } from "../lib/router.js";
import { UI } from "./Icons.js";
const ICON = { launch: UI.rocket, graduate: UI.grad, whale: UI.whale, unlock: UI.unlock };
export function activityRail() {
    const list = h("div", { class: "rail", "aria-live": "polite" });
    const el = h("div", { class: "card pad" }, h("div", { class: "section-head", style: "margin-bottom:10px" }, h("div", null, h("div", { class: "eyebrow" }, "Live activity"), h("div", { class: "sub" }, "Launches, graduations, whales")), h("span", { class: "live-dot" }, h("i"), "LIVE")), list);
    const times = new Map();
    const tick = window.setInterval(() => {
        for (const [row, ts] of times) {
            const t = row.querySelector("time");
            if (t)
                t.textContent = timeAgo(ts);
        }
    }, 5000);
    const off = market().subscribeActivity((ev) => {
        const com = byId(ev.commodityId);
        const row = h(ev.coinMint ? "a" : "div", { class: "ev fresh", href: ev.coinMint ? href(`/coin/${ev.coinMint}`) : undefined, style: `--c:${com?.color ?? "#e0344a"}` }, svg(ICON[ev.kind], "ico"), h("span", null, ev.text), h("time", null, timeAgo(ev.ts)));
        list.prepend(row);
        times.set(row, ev.ts);
        window.setTimeout(() => row.classList.remove("fresh"), 1200);
        while (list.children.length > 12) {
            const last = list.lastElementChild;
            times.delete(last);
            last.remove();
        }
    });
    onRemove(el, () => { off(); window.clearInterval(tick); });
    return el;
}
