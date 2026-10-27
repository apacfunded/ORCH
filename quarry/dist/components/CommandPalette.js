import { byId, commodities } from "../config/commodities.js";
import { market } from "../data/index.js";
import { h } from "../lib/dom.js";
import { fmtUsd } from "../lib/format.js";
import { href, navigate } from "../lib/router.js";
import { commodityIcon } from "./Icons.js";
let open = false;
export function openPalette() {
    if (open)
        return;
    open = true;
    const prevFocus = document.activeElement;
    const input = h("input", { type: "search", placeholder: "Search name, ticker, or contract address…", "aria-label": "Search coins and boards", autocomplete: "off" });
    const res = h("div", { class: "res", role: "listbox" });
    const box = h("div", { class: "palette" }, input, res);
    const overlay = h("div", { class: "overlay", role: "dialog", "aria-modal": "true" }, box);
    let sel = 0;
    let rows = [];
    let all = [];
    const close = () => { overlay.remove(); open = false; document.removeEventListener("keydown", onKey); prevFocus?.focus(); };
    const render = (q) => {
        const s = q.trim().toLowerCase();
        rows = [];
        res.replaceChildren();
        const boards = commodities.filter((c) => c.status !== "soon" && (!s || c.name.toLowerCase().includes(s) || c.symbol.toLowerCase().includes(s))).slice(0, s ? 3 : 2);
        for (const c of boards) {
            const a = h("a", { href: href(`/board/${c.id}`), onclick: close, style: `--c:${c.color}` }, h("span", { class: "svgwrap", style: "width:32px;height:32px;display:grid;place-items:center;color:var(--c)", html: commodityIcon(c.icon) }), h("div", null, h("div", { class: "t" }, `${c.name} board`), h("div", { class: "s" }, c.symbol)), h("div", { class: "m muted" }, c.status.toUpperCase()));
            rows.push(a);
            res.appendChild(a);
        }
        const coins = all.filter((c) => !s || c.name.toLowerCase().includes(s) || c.ticker.toLowerCase().includes(s) || c.mint.toLowerCase().includes(s)).slice(0, 8);
        for (const c of coins) {
            const com = byId(c.commodityId);
            const a = h("a", { href: href(`/coin/${c.mint}`), onclick: close }, h("img", { src: c.image, alt: "" }), h("div", null, h("div", { class: "t" }, `$${c.ticker} `, h("span", { class: "muted", style: "font-weight:400" }, c.name)), h("div", { class: "s" }, `${c.ticker} / ${com?.symbol ?? ""}`)), h("div", { class: "m" }, fmtUsd(c.marketCapUsd)));
            rows.push(a);
            res.appendChild(a);
        }
        if (!rows.length)
            res.appendChild(h("div", { class: "empty" }, "Nothing matches yet. Try a ticker or paste a contract address."));
        sel = 0;
        highlight();
    };
    const highlight = () => rows.forEach((r, i) => r.classList.toggle("sel", i === sel));
    const onKey = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            close();
        }
        else if (e.key === "ArrowDown") {
            e.preventDefault();
            sel = Math.min(rows.length - 1, sel + 1);
            highlight();
            rows[sel]?.scrollIntoView({ block: "nearest" });
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            sel = Math.max(0, sel - 1);
            highlight();
        }
        else if (e.key === "Enter") {
            const r = rows[sel];
            if (r) {
                navigate(r.getAttribute("href").slice(1));
                close();
            }
        }
        else if (e.key === "Tab") { // focus trap: keep focus inside the palette
            e.preventDefault();
            input.focus();
        }
    };
    document.addEventListener("keydown", onKey);
    input.addEventListener("input", () => render(input.value));
    overlay.addEventListener("click", (e) => { if (e.target === overlay)
        close(); });
    document.body.appendChild(overlay);
    input.focus();
    render("");
    void market().listCoins({ limit: 400 }).then((c) => { all = c; render(input.value); });
}
export function installPaletteShortcut() {
    document.addEventListener("keydown", (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            openPalette();
        }
        if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
            e.preventDefault();
            openPalette();
        }
    });
}
