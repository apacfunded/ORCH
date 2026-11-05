import { boardCommodities } from "../config/commodities.js";
import { market } from "../data/index.js";
import { h, onRemove, svg } from "../lib/dom.js";
import { fmtPct, fmtUsd, pctArrow } from "../lib/format.js";
import { href } from "../lib/router.js";
import { tierBadge } from "./Badge.js";
import { UI, commodityIcon } from "./Icons.js";
export function tickerTape() {
    const items = [];
    const offs = [];
    const make = () => boardCommodities().map((c) => {
        const price = h("span", { class: "num p" }, "—");
        const chg = h("span", { class: "num chg" }, "");
        const item = h("a", { class: "item", href: href(`/board/${c.id}`), style: `--c:${c.color}` }, svg(commodityIcon(c.icon), "ico"), h("span", { class: "sym" }, c.symbol), price, chg, tierBadge(c, { tooltip: false }), c.status === "locked" ? svg(UI.lock, "lock") : null);
        const apply = (q) => {
            price.textContent = c.tier === "house" ? `${fmtUsd(q.priceUsd)}*` : fmtUsd(q.priceUsd);
            chg.textContent = `${pctArrow(q.change24h)} ${fmtPct(q.change24h)}`;
            chg.className = `num chg ${q.change24h >= 0 ? "up" : "down"}`;
        };
        void market().getCommodityQuote(c.id).then(apply);
        offs.push(market().subscribeCommodityQuote(c.id, apply));
        return item;
    });
    const note = () => h("span", { class: "item", style: "color:var(--text-3)" }, "* House token price. Not the real commodity price.");
    items.push(...make(), note(), ...make(), note()); // duplicated for a seamless loop
    const track = h("div", { class: "track", style: `animation-duration:${Math.max(60, boardCommodities().length * 6)}s` }, items);
    const el = h("div", { class: "tape", "aria-label": "Commodity boards ticker" }, track);
    onRemove(el, () => offs.forEach((o) => o()));
    return el;
}
