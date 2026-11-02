import { filterTable, periodicTable, tableLegend } from "../components/Element.js";
import { UI } from "../components/Icons.js";
import { coinLedger, ledgerSkeleton } from "../components/Ledger.js";
import { sparkline } from "../components/Sparkline.js";
import { houseDisclaimer, pairNote } from "../config/brand.js";
import { byId } from "../config/commodities.js";
import { elNum, elementOf, elements } from "../config/elements.js";
import { market } from "../data/index.js";
import { h, onRemove, svg } from "../lib/dom.js";
import { fmtPct, fmtUsd, pctArrow } from "../lib/format.js";
import { href } from "../lib/router.js";
import { notFoundPage } from "./NotFound.js";
export async function boardsIndexPage() {
    const coins = await market().listCoins({ limit: 400 }).catch(() => []);
    const table = periodicTable(coins);
    const search = h("input", { type: "search", class: "search", placeholder: `Find an element (copper, Au, tea…)`, "aria-label": "Find an element" });
    const none = h("div", { class: "empty", style: "display:none" }, h("div", { class: "serif" }, "No element by that name."), h("p", null, "Try a commodity name like copper or tea, or a symbol like Au."));
    search.addEventListener("input", () => { none.style.display = filterTable(table.el, table.tiles, search.value) ? "none" : ""; });
    return h("div", { class: "page" }, h("div", { class: "launch-head" }, h("div", null, h("span", { class: "label" }, "Index"), h("h1", { style: "margin-top:8px" }, "The table"), h("p", null, `${elements().length} elements. Each one is a board. Coins launched on an element are priced in it, live.`)), h("div", null, search)), h("div", { style: "margin-top:24px" }, table.el, none, tableLegend()), h("section", { class: "section" }, h("div", { class: "sechead" }, h("span", { class: "no" }, "§ A"), h("h2", null, "Every sample"), h("div", { class: "side" }, "All coins, all elements")), coinLedger(coins)));
}
export async function boardPage(_ctx, params) {
    const com = byId(params.id);
    const e = elementOf(params.id);
    if (!com || !e)
        return notFoundPage("That element isn't on the table.");
    const ledgerHost = h("div", null, ledgerSkeleton());
    const [coins, quote] = await Promise.all([
        market().listCoins({ commodityId: com.id, limit: 400 }).catch(() => []),
        market().getCommodityQuote(com.id).catch(() => ({ priceUsd: 0, change24h: 0, spark: [0, 0] })),
    ]);
    const listed = coins.filter((c) => !c.houseToken);
    // ---- big element tile ----
    const bigPx = h("b", null, fmtUsd(quote.priceUsd));
    const bigChg = h("span", { class: quote.change24h >= 0 ? "up" : "down" }, `${pctArrow(quote.change24h)} ${fmtPct(quote.change24h)}`);
    const tile = h("div", { class: "bigel", style: `--c:${com.color}` }, h("div", { class: "top" }, h("span", null, elNum(e.n)), h("span", { class: `badge ${com.tier === "backed" ? "backed" : ""}` }, com.tier === "backed" ? "BACKED" : "HOUSE")), h("div", { class: "sym" }, e.sym), h("div", { class: "nm" }, com.name), h("div", { class: "px" }, h("span", { class: "label" }, `USD / ${com.unit ?? "unit"}`), h("span", null, bigPx, " ", bigChg)));
    // ---- stats ----
    const vol = listed.reduce((s, c) => s + c.volume24hUsd, 0);
    const spark = sparkline(quote.spark, { color: "auto", fill: false });
    const priceCell = h("b", null, fmtUsd(quote.priceUsd));
    const stats = h("div", { class: "stats" }, h("div", null, h("span", { class: "label" }, `${com.symbol} price`), priceCell, spark.el), h("div", null, h("span", { class: "label" }, "Coins"), h("b", null, String(listed.length))), h("div", null, h("span", { class: "label" }, "24H volume"), h("b", null, fmtUsd(vol))), h("div", null, h("span", { class: "label" }, "Graduated"), h("b", null, String(listed.filter((c) => c.status === "graduated").length))));
    const offQ = market().subscribeCommodityQuote(com.id, (q) => {
        bigPx.textContent = fmtUsd(q.priceUsd);
        priceCell.textContent = fmtUsd(q.priceUsd);
        bigChg.textContent = `${pctArrow(q.change24h)} ${fmtPct(q.change24h)}`;
        bigChg.className = q.change24h >= 0 ? "up" : "down";
        spark.setData(q.spark);
    });
    const info = h("div", { class: "boardinfo" }, h("span", { class: "label" }, `Element ${elNum(e.n)} · ${com.category === "wildcard" ? "Wildcards" : com.category[0].toUpperCase() + com.category.slice(1)}`), h("h1", { style: "margin-top:8px" }, `${com.name}`), h("p", { class: "blurb" }, `Coins on this board are shown in ${com.symbol} as well as USD. They trade in SOL on pump.fun.`), stats, h("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:18px" }, h("a", { class: "btn primary", href: href(`/launch?board=${com.id}`) }, `Launch on ${com.name}`, svg(UI.arrow)), com.issuer ? h("a", { class: "btn", href: com.issuer.url, target: "_blank", rel: "noopener" }, com.issuer.name, svg(UI.external)) : null), h("div", { class: com.tier === "house" ? "note house" : "note", style: "margin-top:18px" }, com.tier === "house" ? [h("b", null, "House element. "), houseDisclaimer] : [h("b", null, "Backed element. "), pairNote]));
    ledgerHost.replaceChildren(coinLedger(coins, { board: com }));
    const page = h("div", { class: "page" }, h("div", { class: "crumbs" }, h("a", { href: href("/boards") }, "The table"), h("span", null, "/"), h("span", null, `${elNum(e.n)} ${com.name}`)), h("div", { class: "boardtop" }, tile, info), h("section", { class: "section", style: "margin-top:48px" }, h("div", { class: "sechead" }, h("span", { class: "no" }, elNum(e.n)), h("h2", null, `Samples on ${com.name}`), h("div", { class: "side" }, `${listed.length} listed`)), ledgerHost));
    onRemove(page, () => { offQ(); spark.destroy(); });
    return page;
}
