// /#/coins — every coin launched through Quarry, with the main coin pinned on top.
import { coinLedger, ledgerSkeleton } from "../components/Ledger.js";
import { mainCoinCard } from "../components/MainCoin.js";
import { CATEGORY_ORDER, categoryShort, elements } from "../config/elements.js";
import { market } from "../data/index.js";
import { h } from "../lib/dom.js";
import { fmtUsd } from "../lib/format.js";
import { href, query } from "../lib/router.js";
export async function coinsPage() {
    const all = (await market().listCoins({ limit: 400 }).catch(() => [])).filter((c) => !c.houseToken);
    const vol = all.reduce((s, c) => s + (c.volume24hUsd || 0), 0);
    const mcap = all.reduce((s, c) => s + (c.marketCapUsd || 0), 0);
    const grads = all.filter((c) => c.status === "graduated").length;
    const used = new Set(all.map((c) => c.commodityId));
    const sel = h("select", { class: "search", "aria-label": "Filter by element", style: "min-width:220px" }, h("option", { value: "" }, "All elements"), CATEGORY_ORDER.map((cat) => h("optgroup", { label: categoryShort[cat] }, elements().filter((e) => e.c.category === cat).map((e) => h("option", { value: e.c.id }, `${e.sym} · ${e.c.name}${used.has(e.c.id) ? "" : " (0)"}`)))));
    const host = h("div", null, ledgerSkeleton());
    const render = () => {
        const id = sel.value;
        const list = id ? all.filter((c) => c.commodityId === id) : all;
        host.replaceChildren(coinLedger(list, id ? { board: elements().find((e) => e.c.id === id).c } : {}));
    };
    sel.addEventListener("change", render);
    const preset = query().get("element");
    if (preset)
        sel.value = preset;
    render();
    return h("div", { class: "page" }, h("div", { class: "launch-head" }, h("div", null, h("span", { class: "label" }, "Index · coins"), h("h1", { style: "margin-top:8px" }, "Coins"), h("p", null, "Every coin launched through Quarry, verified on-chain, with its live price in its element.")), h("a", { class: "btn primary", href: href("/launch") }, "Launch a coin")), h("div", { class: "stats", style: "margin-top:0;border-top:0" }, h("div", null, h("span", { class: "label" }, "Coins listed"), h("b", null, String(all.length))), h("div", null, h("span", { class: "label" }, "Combined market cap"), h("b", null, fmtUsd(mcap))), h("div", null, h("span", { class: "label" }, "24H volume"), h("b", null, fmtUsd(vol))), h("div", null, h("span", { class: "label" }, "Graduated"), h("b", null, String(grads)))), h("section", { style: "margin-top:28px" }, mainCoinCard()), h("section", { class: "section", style: "margin-top:44px" }, h("div", { class: "sechead" }, h("span", { class: "no" }, "§ A"), h("h2", null, "Every sample"), h("div", { class: "side" }, sel)), host));
}
