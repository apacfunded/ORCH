import { badge, tierBadge } from "../components/Badge.js";
import { UI, commodityIcon } from "../components/Icons.js";
import { sparkline } from "../components/Sparkline.js";
import { toast } from "../components/Toasts.js";
import { houseDisclaimer } from "../config/brand.js";
import { boardCommodities, byId, categoryLabel } from "../config/commodities.js";
import { market } from "../data/index.js";
import { h, onRemove, svg } from "../lib/dom.js";
import { fmtPct, fmtUsd, pctArrow } from "../lib/format.js";
import { reducedMotion, storage } from "../lib/motion.js";
import { href } from "../lib/router.js";
import { coinExplorer } from "./Home.js";
import { notFoundPage } from "./NotFound.js";
import { artImg, boardArt } from "../config/art.js";
export async function boardsIndexPage(ctx) {
    // "/boards" simply shows the boards row + all coins; the home page already has it, so reuse pieces.
    const coins = await market().listCoins({ limit: 400 });
    const { commodityTile } = await import("../components/CommodityTile.js");
    const all = boardCommodities();
    const search = h("input", { type: "search", id: "board-search", class: "board-search", placeholder: `Search ${all.length} boards…`, "aria-label": "Search boards" });
    const tileFor = new Map();
    const groups = Object.keys(categoryLabel).map((cat) => {
        const list = all.filter((c) => c.category === cat);
        if (!list.length)
            return null;
        const tiles = list.map((c) => { const t = commodityTile(c, coins, { onHoverTint: ctx.tint }); tileFor.set(c.id, t); return t; });
        const g = h("div", { class: "board-group", dataset: { cat } }, h("h3", { class: "group-title" }, categoryLabel[cat], h("span", { class: "muted" }, ` ${list.length}`)), h("div", { class: "tiles" }, tiles));
        return g;
    });
    const empty = h("div", { class: "card pad muted", style: "display:none;text-align:center" }, "No board matches that. Try a commodity name like copper or tea.");
    search.addEventListener("input", () => {
        const q = search.value.trim().toLowerCase();
        let shown = 0;
        for (const c of all) {
            const t = tileFor.get(c.id);
            const on = !q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q);
            t.style.display = on ? "" : "none";
            if (on)
                shown++;
        }
        document.querySelectorAll(".board-group").forEach((g) => { g.style.display = [...g.querySelectorAll(".tile")].some((t) => t.style.display !== "none") ? "" : "none"; });
        empty.style.display = shown ? "none" : "";
    });
    return h("div", { class: "page" }, h("div", { class: "section-head" }, h("div", null, h("div", { class: "eyebrow" }, "Boards"), h("h2", { style: "font-size:30px;margin-top:6px" }, `${all.length} boards, one per commodity`)), search), groups, empty, h("div", { class: "section" }, coinExplorer(coins, ctx)));
}
export async function boardPage(ctx, params) {
    const com = byId(params.id);
    if (!com)
        return notFoundPage();
    const coins = await market().listCoins({ commodityId: com.id, limit: 400 });
    const houseCoin = coins.find((c) => c.houseToken);
    const quote = await market().getCommodityQuote(com.id);
    ctx.tint(com.color);
    // ---- banner with material texture ----
    const canvas = h("canvas");
    const isMetal = com.id === "gold" || com.id === "silver";
    const banner = h("div", { class: `banner ${isMetal ? "banner-metal" : "banner-house"}`, style: `--c:${com.color};--c2:${com.color2}` }, canvas, artImg(boardArt(com.id), "banner-img"), h("div", { class: "banner-tint", "aria-hidden": "true" }), h("div", { class: "meta" }, tierBadge(com, { tooltip: false }), com.status === "locked" ? badge("locked") : null, h("span", null, com.blurb)), h("h1", null, svg(commodityIcon(com.icon), "ico"), `${com.name} board`), com.tier === "house"
        ? h("div", { class: "disc" }, h("b", null, "House token. "), houseDisclaimer)
        : h("div", { class: "meta" }, "Coins here are priced in ", h("b", null, com.symbol), h("span", { class: "muted" }, " · trade in SOL on pump.fun"), com.issuer ? h("a", { class: "btn sm", href: com.issuer.url, target: "_blank", rel: "noopener" }, com.issuer.name, svg(UI.external)) : h("span", { class: "muted" }, "Issuer link: CONFIG")));
    materialTexture(canvas, com);
    // ---- stats ----
    const qp = h("div", { class: "v" }, fmtUsd(quote.priceUsd), h("small", { class: quote.change24h >= 0 ? "up" : "down" }, `${pctArrow(quote.change24h)} ${fmtPct(quote.change24h)}`));
    const spark = sparkline(quote.spark, { color: com.color });
    const vol = coins.reduce((s, c) => s + c.volume24hUsd, 0);
    const stats = h("div", { class: "board-stats" }, h("div", { class: "stat" }, h("div", { class: "k" }, `${com.symbol} price${com.tier === "house" ? " (house token)" : ""}`), qp, spark.el), h("div", { class: "stat" }, h("div", { class: "k" }, "Coins on board"), h("div", { class: "v" }, String(coins.filter((c) => !c.houseToken).length))), h("div", { class: "stat" }, h("div", { class: "k" }, "24h volume"), h("div", { class: "v" }, fmtUsd(vol))), h("div", { class: "stat" }, h("div", { class: "k" }, "Graduated"), h("div", { class: "v" }, String(coins.filter((c) => c.status === "graduated").length))));
    const offQ = market().subscribeCommodityQuote(com.id, (q) => { qp.replaceChildren(fmtUsd(q.priceUsd), h("small", { class: q.change24h >= 0 ? "up" : "down" }, `${pctArrow(q.change24h)} ${fmtPct(q.change24h)}`)); spark.setData(q.spark); });
    // ---- locked state ----
    let locked = null;
    if (com.status === "locked" && houseCoin) {
        const ringEl = progressRing(houseCoin.bondingProgress, com.color);
        const notified = storage.get(`pit:notify:${com.id}`) === "1";
        const notify = h("button", { class: "btn", onclick: () => { storage.set(`pit:notify:${com.id}`, "1"); notify.textContent = "You'll be notified here"; notify.setAttribute("disabled", ""); toast(`We'll flag it on this device when ${com.name} unlocks`, { icon: "bell", color: com.color }); } }, svg(UI.bell), notified ? "You'll be notified here" : "Notify me");
        if (notified)
            notify.setAttribute("disabled", "");
        locked = h("div", { class: "card pad lockedbox section" }, ringEl.el, h("div", null, h("div", { class: "eyebrow" }, "Board locked"), h("h2", { style: "margin-top:6px" }, `$${com.symbol} is still on its own curve`), h("p", { style: "color:var(--text-2);margin-top:8px;max-width:560px" }, `$${com.symbol} launched on pump.fun as a normal coin. When its bonding curve fills and it graduates, this board unlocks and creators can launch coins priced in $${com.symbol} here.`), h("div", { style: "display:flex;gap:10px;margin-top:14px;flex-wrap:wrap" }, h("a", { class: "btn primary", href: href(`/coin/${houseCoin.mint}`) }, svg(UI.chart), `View $${com.symbol}'s curve`), notify)));
        const off = market().subscribeCoin(houseCoin.mint, (c) => ringEl.set(c.bondingProgress));
        onRemove(locked, off);
    }
    const page = h("div", { class: "page" }, banner, stats, locked, h("div", { class: "section" }, coinExplorer(coins.filter((c) => !c.houseToken), ctx, com)));
    onRemove(page, () => { offQ(); spark.destroy(); ctx.tint(null); });
    return page;
}
function progressRing(p, color) {
    const r = 62, c = 2 * Math.PI * r;
    const fg = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    const lbl = h("div", { class: "lbl" }, h("div", null, `${Math.round(p * 100)}%`, h("small", null, "TO UNLOCK")));
    const el = h("div", { class: "ring", role: "img", "aria-label": `${Math.round(p * 100)}% to unlock` });
    el.innerHTML = `<svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="10"/></svg>`;
    const svgEl = el.querySelector("svg");
    fg.setAttribute("cx", "75");
    fg.setAttribute("cy", "75");
    fg.setAttribute("r", String(r));
    fg.setAttribute("fill", "none");
    fg.setAttribute("stroke", color);
    fg.setAttribute("stroke-width", "10");
    fg.setAttribute("stroke-linecap", "round");
    fg.setAttribute("stroke-dasharray", String(c));
    fg.setAttribute("stroke-dashoffset", String(c * (1 - p)));
    fg.style.transition = "stroke-dashoffset .8s cubic-bezier(.16,1,.3,1)";
    fg.style.filter = `drop-shadow(0 0 8px ${color})`;
    svgEl.appendChild(fg);
    el.appendChild(lbl);
    return { el, set(v) { fg.setAttribute("stroke-dashoffset", String(c * (1 - Math.min(1, v)))); lbl.replaceChildren(h("div", null, `${Math.round(v * 100)}%`, h("small", null, "TO UNLOCK"))); } };
}
// Animated material texture per commodity (canvas noise, cheap).
function materialTexture(canvas, com) {
    let raf = 0, t = 0;
    const draw = () => {
        const w = canvas.clientWidth || 800, hgt = canvas.clientHeight || 220;
        if (canvas.width !== w) {
            canvas.width = w;
            canvas.height = hgt;
        }
        const c = canvas.getContext("2d");
        if (!c)
            return;
        c.clearRect(0, 0, w, hgt);
        const g = c.createLinearGradient(0, 0, w, hgt);
        g.addColorStop(0, com.color2 + "cc");
        g.addColorStop(1, "#120607");
        c.fillStyle = g;
        c.fillRect(0, 0, w, hgt);
        c.globalCompositeOperation = "lighter";
        const n = com.material === "glow" ? 6 : 9;
        for (let i = 0; i < n; i++) {
            const ph = t * (0.4 + i * 0.07) + i;
            let x = w * (0.5 + 0.45 * Math.sin(ph * 0.7 + i)), y = hgt * (0.5 + 0.4 * Math.cos(ph * 0.5 + i * 2));
            let rad = com.material === "brushed" ? 40 : 90 + 40 * Math.sin(ph);
            if (com.material === "brushed") {
                x = (i / n) * w + 20 * Math.sin(t + i);
                y = hgt / 2;
                rad = hgt;
            }
            if (com.material === "steam") {
                y = hgt - ((t * 30 + i * 60) % (hgt + 100));
                rad = 60;
            }
            const rg = c.createRadialGradient(x, y, 0, x, y, rad);
            const a = com.material === "oilslick" ? 0.22 : com.material === "glow" ? 0.3 : 0.16;
            const col = com.material === "oilslick" ? ["#5b4b8a", "#2aa6a0", "#e6b84a"][i % 3] : com.color;
            rg.addColorStop(0, col + Math.round(a * 255).toString(16).padStart(2, "0"));
            rg.addColorStop(1, col + "00");
            c.fillStyle = rg;
            if (com.material === "brushed")
                c.fillRect(x - 10, 0, 20, hgt);
            else {
                c.beginPath();
                c.arc(x, y, rad, 0, 7);
                c.fill();
            }
        }
        c.globalCompositeOperation = "source-over";
        const fade = c.createLinearGradient(0, 0, 0, hgt);
        fade.addColorStop(0, "rgba(18,6,7,0)");
        fade.addColorStop(1, "rgba(18,6,7,.85)");
        c.fillStyle = fade;
        c.fillRect(0, 0, w, hgt);
    };
    const loop = () => { if (!document.contains(canvas))
        return; t += 0.012; draw(); raf = requestAnimationFrame(loop); };
    if (reducedMotion())
        draw();
    else
        raf = requestAnimationFrame(loop);
    onRemove(canvas, () => { if (raf)
        cancelAnimationFrame(raf); });
}
