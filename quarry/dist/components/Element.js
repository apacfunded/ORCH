// Element tiles and the periodic table of boards.
import { houseDisclaimer } from "../config/brand.js";
import { CATEGORY_ORDER, categoryShort, elNum, elements } from "../config/elements.js";
import { market } from "../data/index.js";
import { h, onRemove } from "../lib/dom.js";
import { fmtPct, fmtUsd, pctArrow } from "../lib/format.js";
import { href } from "../lib/router.js";
import { sparkline } from "./Sparkline.js";
/** One element tile. mode "link" opens the board; "pick" is a toggle button for the launch flow. */
export function elementTile(e, coins, opts = {}) {
    const { c, sym, n } = e;
    const count = coins.filter((x) => x.commodityId === c.id && !x.houseToken).length;
    const price = h("span", { class: "p" }, "—");
    const chg = h("span", { class: "c" }, "");
    const spark = sparkline([], { color: c.color === "#f3f1ec" || c.color === "#f7f3ea" || c.color === "#f4f1ea" ? "#8c877c" : c.color, fill: false });
    const tag = h("span", { class: `tag ${c.tier === "backed" ? "b" : ""}`, title: c.tier === "backed" ? "Backed: priced from a real tokenized commodity" : `House: ${houseDisclaimer}` }, c.tier === "backed" ? "BACKED" : "HOUSE");
    const inner = [
        h("div", { class: "top" }, h("span", null, elNum(n)), tag),
        h("div", { class: "sym" }, sym),
        h("div", { class: "nm" }, c.name),
        spark.el,
        h("div", { class: "px" }, price, chg),
        opts.mini ? null : h("div", { class: "cnt" }, count === 1 ? "1 coin" : `${count} coins`),
    ];
    const cls = `el ${opts.mini ? "mini" : ""} ${opts.mode === "pick" ? "pick" : ""}`;
    const el = opts.mode === "pick"
        ? h("button", { type: "button", class: cls, style: `--c:${c.color}`, "aria-pressed": opts.selected ? "true" : "false", "aria-label": `${c.name}, ${c.tier}`, dataset: { id: c.id } }, inner)
        : h("a", { class: cls, href: href(`/board/${c.id}`), style: `--c:${c.color}`, "aria-label": `${c.name} board, ${count} coins`, dataset: { id: c.id } }, inner);
    const apply = (q) => {
        price.textContent = fmtUsd(q.priceUsd);
        chg.textContent = `${pctArrow(q.change24h)}${fmtPct(q.change24h)}`;
        chg.className = `c ${q.change24h >= 0 ? "up" : "down"}`;
        spark.setData(q.spark);
    };
    void market().getCommodityQuote(c.id).then(apply).catch(() => { });
    const off = market().subscribeCommodityQuote(c.id, apply);
    onRemove(el, () => { off(); spark.destroy(); });
    return el;
}
/** All 50 elements grouped by category. Returns { el, tiles: Map(id → tile) }. */
export function periodicTable(coins, opts = {}) {
    const tiles = new Map();
    const groups = CATEGORY_ORDER.map((cat) => {
        const list = elements().filter((e) => e.c.category === cat);
        if (!list.length)
            return null;
        const ts = list.map((e) => { const t = elementTile(e, coins, { mode: opts.mode, mini: opts.mini, selected: opts.selected === e.c.id }); tiles.set(e.c.id, t); return t; });
        const first = elNum(list[0].n), last = elNum(list[list.length - 1].n);
        return h("div", { class: "pgroup", dataset: { cat } }, h("div", { class: "ghead" }, h("h3", null, categoryShort[cat]), h("span", { class: "label" }, `${first}–${last} · ${list.length}`)), h("div", { class: "pgrid scroll" }, ts));
    });
    return { el: h("div", { class: "ptable" }, groups), tiles };
}
/** Filter a periodic table in place by a search string. Returns the number shown. */
export function filterTable(root, tiles, q) {
    const s = q.trim().toLowerCase();
    let shown = 0;
    for (const e of elements()) {
        const t = tiles.get(e.c.id);
        if (!t)
            continue;
        const on = !s || e.c.name.toLowerCase().includes(s) || e.c.symbol.toLowerCase().includes(s) || e.sym.toLowerCase() === s;
        t.style.display = on ? "" : "none";
        if (on)
            shown++;
    }
    root.querySelectorAll(".pgroup").forEach((g) => { g.style.display = [...g.querySelectorAll(".el")].some((t) => t.style.display !== "none") ? "" : "none"; });
    return shown;
}
export function tableLegend() {
    return h("div", { class: "table-legend" }, h("span", null, h("span", { class: "badge backed" }, "BACKED"), "priced from a real tokenized commodity"), h("span", null, h("span", { class: "badge" }, "HOUSE"), "launchpad element, no reserves, does not track the real price"));
}
