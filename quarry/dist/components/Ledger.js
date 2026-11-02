// Coin ledger: dense sortable table with a certificate-grid toggle. Used on the table and board pages.
import { byId } from "../config/commodities.js";
import { market } from "../data/index.js";
import { h, onRemove } from "../lib/dom.js";
import { fmtPct, fmtQuote, fmtSmall, fmtUsd, pctArrow, timeAgo } from "../lib/format.js";
import { storage } from "../lib/motion.js";
import { href, navigate } from "../lib/router.js";
import { certCard, emptyNote, miniEl } from "./Certificate.js";
const COLS = [
    { k: "rank", label: "#", sort: null },
    { k: "coin", label: "Coin", sort: null, l: true },
    { k: "el", label: "Element", sort: null, l: true, board: false },
    { k: "price", label: "Price USD", sort: "price" },
    { k: "quote", label: "In element", sort: "quote" },
    { k: "mcap", label: "Mkt cap", sort: "mcap" },
    { k: "chg", label: "24H", sort: "chg" },
    { k: "curve", label: "Curve", sort: "curve" },
    { k: "age", label: "Age", sort: "age" },
];
const sorters = {
    price: (a, b) => b.priceUsd - a.priceUsd,
    quote: (a, b) => b.priceQuote - a.priceQuote,
    mcap: (a, b) => b.marketCapUsd - a.marketCapUsd,
    chg: (a, b) => b.change24hPct - a.change24hPct,
    curve: (a, b) => b.bondingProgress - a.bondingProgress,
    age: (a, b) => b.createdAt - a.createdAt,
};
/** opts: { board?: commodity, title?: string } */
export function coinLedger(initial, opts = {}) {
    let coins = initial.filter((c) => !c.houseToken);
    let sort = storage.get("quarry:sort") ?? "mcap";
    let view = storage.get("quarry:view") ?? "table";
    let q = "";
    let shown = 50;
    const cols = COLS.filter((c) => !(opts.board && c.board === false));
    const headBtns = new Map();
    const thead = h("thead", null, h("tr", null, cols.map((c) => {
        if (!c.sort)
            return h("th", { class: c.l ? "l" : "" }, c.label);
        const b = h("button", { class: c.sort === sort ? "on" : "", onclick: () => { sort = c.sort; storage.set("quarry:sort", sort); headBtns.forEach((x, k) => x.classList.toggle("on", k === sort)); render(); } }, c.label, c.sort === sort ? " ↓" : "");
        headBtns.set(c.sort, b);
        return h("th", { "aria-sort": c.sort === sort ? "descending" : "none" }, b);
    })));
    const tbody = h("tbody");
    const table = h("table", { class: "ledger stack" }, thead, tbody);
    const grid = h("div", { class: "certs" });
    const body = h("div");
    const more = h("button", { class: "btn block", style: "margin-top:14px", onclick: () => { shown += 50; render(); } }, "Show more");
    const viewSeg = h("div", { class: "seg", role: "group", "aria-label": "View" });
    const vBtns = [["table", "Ledger"], ["grid", "Certificates"]].map(([k, l]) => h("button", { class: k === view ? "active" : "", "aria-pressed": k === view ? "true" : "false", onclick: () => { view = k; storage.set("quarry:view", k); vBtns.forEach((b, i) => { const on = (i === 0) === (k === "table"); b.classList.toggle("active", on); b.setAttribute("aria-pressed", on ? "true" : "false"); }); render(); } }, l));
    vBtns.forEach((b) => viewSeg.appendChild(b));
    const sortSel = h("select", { class: "search", "aria-label": "Sort", style: "min-width:0" }, ["mcap", "age", "chg", "curve", "price"].map((k) => h("option", { value: k, selected: k === sort }, { mcap: "Sort: market cap", age: "Sort: newest", chg: "Sort: 24h change", curve: "Sort: curve progress", price: "Sort: price" }[k])));
    sortSel.addEventListener("change", () => { sort = sortSel.value; storage.set("quarry:sort", sort); headBtns.forEach((x, k) => x.classList.toggle("on", k === sort)); render(); });
    const search = h("input", { type: "search", class: "search", placeholder: "Filter by name or ticker", "aria-label": "Filter coins" });
    search.addEventListener("input", () => { q = search.value.trim().toLowerCase(); shown = 50; render(); });
    const toolbar = h("div", { class: "toolbar" }, h("div", { style: "display:flex;gap:8px;flex-wrap:wrap" }, search, sortSel), viewSeg);
    const rowFor = (c, i) => {
        const com = byId(c.commodityId);
        const sym = com?.symbol ?? "";
        const cells = {
            rank: h("td", { class: "rank" }, String(i + 1)),
            coin: h("td", { class: "l coincell-td" }, h("div", { class: "coincell" }, h("img", { src: c.image, alt: "", loading: "lazy" }), h("div", { style: "min-width:0" }, h("b", null, `$${c.ticker}`), h("small", null, c.name)))),
            el: h("td", { class: "l" }, h("span", { style: "display:inline-flex;align-items:center;gap:8px" }, miniEl(c.commodityId), h("span", { class: "muted" }, com?.name ?? ""))),
            price: h("td", { "data-k": "USD" }, `$${fmtSmall(c.priceUsd)}`),
            quote: h("td", { "data-k": sym }, c.priceQuote ? fmtQuote(c.priceQuote, sym) : "—"),
            mcap: h("td", { "data-k": "MC" }, fmtUsd(c.marketCapUsd)),
            chg: h("td", { "data-k": "24H", class: c.change24hPct >= 0 ? "up" : "down" }, `${pctArrow(c.change24hPct)} ${fmtPct(c.change24hPct)}`),
            curve: h("td", { "data-k": "CURVE" }, c.status === "graduated" ? "Graduated" : h("span", null, h("span", { class: "gauge" }, h("i", { style: `--p:${(Math.min(1, c.bondingProgress) * 100).toFixed(1)}%` })), `${Math.round(c.bondingProgress * 100)}%`)),
            age: h("td", { "data-k": "AGE" }, timeAgo(c.createdAt)),
        };
        const tr = h("tr", { tabindex: "0", onclick: () => navigate(`/coin/${c.mint}`), onkeydown: (e) => { if (e.key === "Enter")
                navigate(`/coin/${c.mint}`); } }, cols.map((col) => cells[col.k]));
        return tr;
    };
    const list = () => {
        let l = coins;
        if (q)
            l = l.filter((c) => c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q) || c.mint.toLowerCase() === q);
        return [...l].sort(sorters[sort] ?? sorters.mcap);
    };
    const render = () => {
        const l = list();
        const slice = l.slice(0, shown);
        body.replaceChildren();
        if (!coins.length) {
            body.appendChild(emptyNote(opts.board ? `No samples on ${opts.board.name} yet.` : "No samples on the table yet.", "Be the first to launch here.", h("a", { class: "btn primary", href: href(opts.board ? `/launch?board=${opts.board.id}` : "/launch") }, "Launch a coin")));
            return;
        }
        if (!l.length) {
            body.appendChild(emptyNote("Nothing matches that filter.", "Try a ticker, a name, or clear the search."));
            return;
        }
        if (view === "table") {
            tbody.replaceChildren(...slice.map(rowFor));
            body.appendChild(h("div", { style: "overflow-x:auto" }, table));
        }
        else {
            grid.replaceChildren(...slice.map((c) => certCard(c)));
            body.appendChild(grid);
        }
        if (l.length > slice.length)
            body.appendChild(more);
    };
    const offLaunch = market().subscribeNewLaunches((c) => { if (opts.board && c.commodityId !== opts.board.id)
        return; coins = [c, ...coins.filter((x) => x.mint !== c.mint)]; render(); });
    // refresh numbers in the ledger view every 20s (certificate cards update themselves)
    const refresh = window.setInterval(async () => {
        if (view !== "table" || !document.contains(body))
            return;
        const fresh = await market().listCoins({ commodityId: opts.board?.id, limit: 400 }).catch(() => null);
        if (fresh) {
            coins = fresh.filter((c) => !c.houseToken);
            render();
        }
    }, 20000);
    const el = h("div", null, toolbar, body);
    render();
    onRemove(el, () => { offLaunch(); window.clearInterval(refresh); });
    return el;
}
export function ledgerSkeleton(rows = 6) {
    return h("table", { class: "ledger" }, h("tbody", null, Array.from({ length: rows }, () => h("tr", { class: "skelrow" }, h("td", { colspan: "9" }, h("div", { class: "skel", style: "height:14px" }))))));
}
