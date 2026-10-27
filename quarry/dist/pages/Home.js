import { brand } from "../config/brand.js";
import { art, artImg } from "../config/art.js";
import { boardCommodities, byId, categoryLabel, liveCommodities, soonCommodities } from "../config/commodities.js";
import { market, mockMarket } from "../data/index.js";
import { applyFilter } from "../data/CodexMarketData.js";
import { activityRail } from "../components/ActivityRail.js";
import { coinCard } from "../components/CoinCard.js";
import { commodityTile, unlockTile } from "../components/CommodityTile.js";
import { UI, commodityIcon } from "../components/Icons.js";
import { odometer } from "../components/Odometer.js";
import { toast } from "../components/Toasts.js";
import { h, onRemove, svg } from "../lib/dom.js";
import { fmtPct, fmtUsd, pctArrow } from "../lib/format.js";
import { reducedMotion, storage } from "../lib/motion.js";
import { heroFeed as heroFeedConfig } from "../config/hero.js";
import { heroSource } from "../data/heroFeed.js";
import { href } from "../lib/router.js";
export async function homePage(ctx) {
    const coins = await market().listCoins({ limit: 400 });
    // ---------- hero ----------
    const featured = featuredCard();
    const heroChart = liveHeroChart(heroSource());
    const hero = h("section", { class: "hero hero-art" }, artImg(art.hero, "hero-img"), h("div", { class: "hero-shade", "aria-hidden": "true" }), h("div", { class: "hero-copy" }, h("div", { class: "eyebrow" }, "Commodity-paired launchpad · Solana"), h("h1", { style: "margin-top:12px" }, "Launch coins paired with ", h("span", { class: "glow" }, "the real world"), "."), h("p", { class: "sub" }, brand.subline), h("div", { class: "ctas" }, h("a", { class: "btn primary", href: href("/launch") }, svg(UI.rocket), "Launch a coin"), h("a", { class: "btn", href: href("/boards") }, "Browse boards", svg(UI.arrow)))), h("div", { class: "hero-right" }, heroChart, featured));
    // ---------- boards ----------
    const volOf = (id) => coins.filter((x) => x.commodityId === id).reduce((s, x) => s + x.volume24hUsd, 0);
    const all = boardCommodities();
    // Backed boards always lead; the remaining slots go to the busiest House boards.
    const backed = all.filter((c) => c.tier === "backed");
    const top = [...backed, ...all.filter((c) => c.tier !== "backed").sort((a, b) => volOf(b.id) - volOf(a.id))].slice(0, 6);
    const rest = all.filter((c) => !top.includes(c));
    const tileById = new Map();
    const tiles = top.map((c) => { const t = commodityTile(c, coins, { onHoverTint: ctx.tint }); tileById.set(c.id, t); return t; });
    const tilesEl = h("div", { class: "tiles" }, tiles);
    const boards = h("section", { class: "section", id: "boards" }, h("div", { class: "section-head" }, h("div", null, h("h2", null, `${all.length} commodity boards`), h("div", { class: "sub" }, "Backed boards first, then the busiest House boards. Backed boards are priced in real tokenized metals; House boards in our own House tokens.")), h("a", { class: "btn sm", href: href("/boards") }, `All ${all.length} boards`, svg(UI.arrow))), tilesEl, h("div", { class: "soonstrip", "aria-label": "More boards" }, rest.map((c) => h("a", { class: "chip board-link", href: href(`/board/${c.id}`), style: `--c:${c.color}` }, svg(commodityIcon(c.icon)), h("span", null, c.name)))), soonCommodities().length ? h("div", { class: "soonstrip", "aria-label": "Boards coming later" }, soonCommodities().map((c) => h("span", { class: "chip", style: `--c:${c.color}` }, svg(commodityIcon(c.icon)), h("span", null, c.name), h("span", { class: "badge soon" }, "SOON")))) : null);
    // Unlock animation when a House token graduates (fires from the data layer).
    const onUnlock = (e) => {
        const id = e.detail.commodityId;
        const tile = tileById.get(id);
        if (tile)
            unlockTile(tile);
        const com = byId(id);
        toast(`$${com?.symbol ?? id.toUpperCase()} board is live`, { icon: "unlock", color: com?.color });
    };
    document.addEventListener("pit:unlock", onUnlock);
    // ---------- explorer + rail ----------
    const explorer = coinExplorer(coins, ctx);
    const mid = h("section", { class: "section home-mid" }, explorer, activityRail());
    // ---------- how it works ----------
    const steps = h("section", { class: "section" }, h("div", { class: "section-head" }, h("div", null, h("h2", null, "How it works"), h("div", { class: "sub" }, "Launch on pump.fun, get priced in the real world here."))), h("div", { class: "steps" }, step("01", "Pick a commodity", "Gold, silver, or a House board once it unlocks. That's the board your coin lives on here.", h("div", { class: "art" }, h("i", { class: "orb" }), h("i", { class: "orb" }), h("i", { class: "orb" }))), step("02", "Launch on pump.fun", "Name, ticker, image, optional dev buy. The coin is created on pump.fun from this site in one transaction.", h("div", { class: "art" }, svg(UI.rocket, "muted"), h("i", { class: "line" }))), step("03", "Trade in SOL", "Buys and sells happen on pump.fun in SOL. This site converts every price into the board's commodity.", h("div", { class: "art" }, curveArt())), step("04", "Graduate", "When the pump.fun curve fills, the coin graduates to PumpSwap. A graduating House token unlocks its board.", h("div", { class: "art" }, h("i", { class: "line" }), svg(UI.grad, "muted")))));
    const page = h("div", { class: "page" }, hero, boards, mid, steps);
    onRemove(page, () => document.removeEventListener("pit:unlock", onUnlock));
    return page;
}
function step(n, title, text, art) {
    return h("div", { class: "step" }, h("div", { class: "n" }, n), h("h3", null, title), h("p", null, text), art);
}
function curveArt() {
    const c = h("canvas", { class: "curve" });
    let t = 0;
    const draw = () => {
        const w = c.clientWidth || 200, hgt = 60;
        c.width = w * 2;
        c.height = hgt * 2;
        const x = c.getContext("2d");
        if (!x)
            return;
        x.setTransform(2, 0, 0, 2, 0, 0);
        x.clearRect(0, 0, w, hgt);
        x.strokeStyle = "#e6b84a";
        x.lineWidth = 2;
        x.beginPath();
        for (let i = 0; i <= w; i += 4) {
            const y = hgt - 6 - Math.pow(i / w, 2.2) * (hgt - 12) * (0.9 + 0.1 * Math.sin(t + i / 30));
            i === 0 ? x.moveTo(i, y) : x.lineTo(i, y);
        }
        x.stroke();
        const px = (t * 20) % w;
        const py = hgt - 6 - Math.pow(px / w, 2.2) * (hgt - 12);
        x.fillStyle = "#f6e9ea";
        x.beginPath();
        x.arc(px, py, 3, 0, 7);
        x.fill();
    };
    if (!reducedMotion()) {
        const loop = () => { if (!document.contains(c))
            return; t += 0.05; draw(); requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
    }
    else
        draw();
    return c;
}
// ---------- live hero chart (pure canvas, Catmull-Rom, glow, particle trail) ----------
// Tracks real data from data/heroFeed.ts: live gold spot now, your coin once config/hero.ts has its CA.
function liveHeroChart(feed) {
    const canvas = h("canvas");
    const lbl = h("div", { class: "lbl" }, "LOADING LIVE PRICE");
    const price = h("div", { class: "price num" }, "—");
    const el = h("div", { class: "card hero-chart" }, canvas, lbl, price);
    const pts = [];
    const particles = [];
    let raf = 0;
    let timer = 0;
    const color = heroFeedConfig.coinMint ? "#e0344a" : (byId("gold")?.color ?? "#e6b84a");
    const draw = () => {
        const dpr = Math.min(2, devicePixelRatio || 1);
        const w = canvas.clientWidth, hgt = canvas.clientHeight;
        if (canvas.width !== w * dpr) {
            canvas.width = w * dpr;
            canvas.height = hgt * dpr;
        }
        const c = canvas.getContext("2d");
        if (!c)
            return;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, w, hgt);
        c.strokeStyle = "rgba(246,233,234,.05)";
        c.lineWidth = 1;
        for (let i = 1; i < 5; i++) {
            c.beginPath();
            c.moveTo(0, (hgt / 5) * i);
            c.lineTo(w, (hgt / 5) * i);
            c.stroke();
        }
        const series = pts.length === 1 ? [pts[0], pts[0]] : pts;
        const n = series.length;
        if (n < 2)
            return;
        const min = Math.min(...series), max = Math.max(...series), span = max - min || Math.max(1e-9, max * 0.001);
        const X = (i) => 20 + (i / (n - 1)) * (w - 60);
        const Y = (v) => 48 + (1 - (v - min) / span) * (hgt - 70);
        const P = series.map((v, i) => ({ x: X(i), y: max === min ? hgt / 2 : Y(v) }));
        const path = () => {
            c.beginPath();
            c.moveTo(P[0].x, P[0].y);
            for (let i = 0; i < P.length - 1; i++) {
                const p0 = P[i - 1] ?? P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] ?? p2;
                c.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
            }
        };
        const g = c.createLinearGradient(0, 0, 0, hgt);
        g.addColorStop(0, color + "44");
        g.addColorStop(1, color + "00");
        path();
        c.save();
        c.lineTo(P[P.length - 1].x, hgt);
        c.lineTo(P[0].x, hgt);
        c.closePath();
        c.fillStyle = g;
        c.fill();
        c.restore();
        path();
        c.strokeStyle = color;
        c.lineWidth = 2;
        c.shadowColor = color;
        c.shadowBlur = 14;
        c.stroke();
        c.shadowBlur = 0;
        const head = P[P.length - 1];
        if (!reducedMotion() && particles.length < 40)
            particles.push({ x: head.x, y: head.y, vx: -Math.random() * 1.2 - 0.3, vy: (Math.random() - 0.5) * 0.8, a: 1 });
        for (const p of particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.a -= 0.025;
            c.fillStyle = color;
            c.globalAlpha = Math.max(0, p.a);
            c.fillRect(p.x, p.y, 2, 2);
        }
        c.globalAlpha = 1;
        for (let i = particles.length - 1; i >= 0; i--)
            if (particles[i].a <= 0)
                particles.splice(i, 1);
        c.beginPath();
        c.arc(head.x, head.y, 4, 0, 7);
        c.fillStyle = "#f6e9ea";
        c.fill();
        c.beginPath();
        c.arc(head.x, head.y, 9 + Math.sin(performance.now() / 200) * 2, 0, 7);
        c.strokeStyle = color;
        c.globalAlpha = .5;
        c.stroke();
        c.globalAlpha = 1;
        price.style.top = `${Math.max(8, Math.min(hgt - 30, head.y - 12))}px`;
    };
    const loop = () => { if (!document.contains(el))
        return; draw(); raf = requestAnimationFrame(loop); };
    requestAnimationFrame(() => { if (reducedMotion())
        draw();
    else
        loop(); });
    let last = 0;
    const show = (q) => {
        lbl.textContent = q.label;
        price.textContent = fmtHero(q.value);
        if (last)
            price.style.color = q.value >= last ? "var(--up)" : "var(--down)";
        last = q.value;
        heroBus.dispatchEvent(new CustomEvent("quote", { detail: q }));
    };
    const tick = async () => {
        const q = await feed.poll();
        if (!document.contains(el))
            return;
        if (q) {
            pts.push(q.value);
            if (pts.length > 80)
                pts.shift();
            show(q);
        }
        timer = window.setTimeout(tick, feed.intervalMs);
    };
    void feed.initial().then((r) => {
        if (r) {
            pts.push(...r.history.slice(-79));
            show(r.quote);
        }
        else
            lbl.textContent = "LIVE PRICE UNAVAILABLE · RETRYING";
        timer = window.setTimeout(tick, feed.intervalMs);
    });
    onRemove(el, () => { if (raf)
        cancelAnimationFrame(raf); window.clearTimeout(timer); });
    return el;
}
const fmtGold = (v) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtHero = (v) => (heroFeedConfig.coinMint ? fmtUsd(v) : fmtGold(v));
/** Lets the featured card reuse the chart's quotes instead of fetching twice. */
const heroBus = new EventTarget();
function featuredCard() {
    const gold = byId("gold");
    const isCoin = !!heroFeedConfig.coinMint;
    const icon = h("span", { style: "width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:var(--surface-3);color:" + (gold?.color ?? "#e6b84a") });
    if (!isCoin)
        icon.appendChild(svg(commodityIcon(gold?.icon ?? ""), "ico"));
    const title = h("span", null, isCoin ? "Loading…" : "Gold ");
    const sub = h("span", { class: "muted", style: "font-weight:400" }, isCoin ? "" : "XAU");
    const value = odometer("—");
    const pct = h("span", { class: "num muted" }, "");
    const el = h("a", { class: "card pad", href: isCoin ? `https://pump.fun/coin/${heroFeedConfig.coinMint}` : href("/board/gold"), target: isCoin ? "_blank" : undefined, rel: isCoin ? "noopener" : undefined, style: "display:grid;grid-template-columns:44px 1fr auto;gap:12px;align-items:center" }, icon, h("div", null, h("div", { style: "font-weight:600" }, title, " ", sub), h("div", { class: "num", style: "font-size:12px;color:var(--text-2);margin-top:4px" }, isCoin ? "Live on pump.fun" : "Live spot price per troy ounce")), h("div", { style: "text-align:right" }, h("div", { style: "font-size:18px;font-weight:600" }, value.el), pct));
    const on = (e) => {
        const q = e.detail;
        value.set(fmtHero(isCoin ? q.value : q.priceUsd));
        if (isCoin) {
            title.textContent = q.title;
            sub.textContent = q.subtitle;
            if (q.image && !icon.firstChild)
                icon.appendChild(h("img", { src: q.image, alt: "", style: "width:44px;height:44px;border-radius:50%;object-fit:cover" }));
        }
        if (q.change24h !== null) {
            pct.textContent = `${pctArrow(q.change24h)} ${fmtPct(q.change24h)}`;
            pct.className = `num ${q.change24h >= 0 ? "up" : "down"}`;
        }
    };
    heroBus.addEventListener("quote", on);
    onRemove(el, () => heroBus.removeEventListener("quote", on));
    return el;
}
// ---------- explorer ----------
export function coinExplorer(initial, ctx, fixedCommodity) {
    let sort = storage.get("pit:sort") ?? "mcap";
    let pair = fixedCommodity?.id ?? "all";
    let tier = null;
    let view = storage.get("pit:view") ?? "grid";
    let coins = initial;
    let page = 1;
    const PAGE = 24;
    const rendered = new Map();
    const sortTabs = h("div", { class: "tabs", role: "tablist", "aria-label": "Sort" });
    const ink = h("div", { class: "ink" });
    sortTabs.appendChild(ink);
    const sorts = [["mcap", "Market cap"], ["newest", "Newest"], ["volume", "24h volume"], ["graduating", "About to graduate"]];
    const sortBtns = sorts.map(([k, l]) => h("button", { role: "tab", class: k === sort ? "active" : "", onclick: () => { sort = k; storage.set("pit:sort", k); sortBtns.forEach((b, i) => b.classList.toggle("active", sorts[i][0] === k)); moveInk(); page = 1; render(); } }, l));
    sortBtns.forEach((b) => sortTabs.appendChild(b));
    const moveInk = () => { const a = sortTabs.querySelector("button.active"); if (a) {
        ink.style.left = `${a.offsetLeft}px`;
        ink.style.width = `${a.offsetWidth}px`;
    } };
    requestAnimationFrame(moveInk);
    const viewTabs = h("div", { class: "tabs", role: "tablist", "aria-label": "View" });
    const vink = h("div", { class: "ink" });
    viewTabs.appendChild(vink);
    const viewBtns = ["grid", "pulse"].map((v) => h("button", { role: "tab", class: v === view ? "active" : "", onclick: () => { view = v; storage.set("pit:view", v); viewBtns.forEach((b, i) => b.classList.toggle("active", (i === 0) === (v === "grid"))); mvInk(); render(); } }, v === "grid" ? "Grid" : "Pulse"));
    viewBtns.forEach((b) => viewTabs.appendChild(b));
    const mvInk = () => { const a = viewTabs.querySelector("button.active"); if (a) {
        vink.style.left = `${a.offsetLeft}px`;
        vink.style.width = `${a.offsetWidth}px`;
    } };
    requestAnimationFrame(mvInk);
    const chips = h("div", { class: "chips", role: "group", "aria-label": "Paired with" });
    const chipBtns = [];
    const mkChip = (id, label, color, icon) => {
        const b = h("button", { class: `chip ${pair === id ? "active" : ""}`, style: `--c:${color}`, "aria-pressed": pair === id ? "true" : "false", onclick: () => { pair = id; tier = null; boardSel.value = ""; boardSel.classList.remove("active"); chipBtns.forEach((x) => { const on = x.dataset.id === id; x.classList.toggle("active", on); x.setAttribute("aria-pressed", on ? "true" : "false"); }); tierBtns.forEach((x) => x.classList.remove("active")); page = 1; render(); } }, icon ? svg(commodityIcon(icon)) : null, h("span", null, label));
        b.dataset.id = id;
        chipBtns.push(b);
        return b;
    };
    const boardSel = h("select", { id: "f-board", class: "chip-select", "aria-label": "Board" });
    if (!fixedCommodity) {
        chips.appendChild(mkChip("all", "All", "#e0344a"));
        boardSel.appendChild(h("option", { value: "" }, "Board: any"));
        for (const [cat, label] of Object.entries(categoryLabel)) {
            const og = h("optgroup", { label });
            liveCommodities().filter((c) => c.category === cat).forEach((c) => og.appendChild(h("option", { value: c.id }, `${c.name} · ${c.symbol}`)));
            if (og.children.length)
                boardSel.appendChild(og);
        }
        boardSel.addEventListener("change", () => {
            pair = boardSel.value || "all";
            tier = null;
            chipBtns.forEach((x) => x.classList.toggle("active", x.dataset.id === pair));
            tierBtns.forEach((x) => x.classList.remove("active"));
            boardSel.classList.toggle("active", !!boardSel.value);
            page = 1;
            render();
        });
        chips.appendChild(boardSel);
    }
    const tierBtns = ["backed", "house"].map((t) => h("button", { class: "chip", style: `--c:${t === "backed" ? "#e6b84a" : "#b9a2ff"}`, onclick: () => { tier = tier === t ? null : t; pair = "all"; boardSel.value = ""; boardSel.classList.remove("active"); chipBtns.forEach((x) => x.classList.toggle("active", x.dataset.id === "all" && !tier)); tierBtns.forEach((x, i) => x.classList.toggle("active", tier === (i === 0 ? "backed" : "house"))); page = 1; render(); } }, h("span", null, t === "backed" ? "Backed" : "House")));
    if (!fixedCommodity)
        tierBtns.forEach((b) => chips.appendChild(b));
    const grid = h("div", { class: "grid" });
    const pulse = h("div", { class: "pulse" });
    const more = h("button", { class: "btn block", style: "margin-top:12px", onclick: () => { page++; render(); } }, "Load more");
    const body = h("div");
    const el = h("div", null, h("div", { class: "explorer-top" }, h("div", { class: "section-head", style: "margin-bottom:0" }, h("div", null, h("h2", null, fixedCommodity ? `${fixedCommodity.name} coins` : "Coins"), h("div", { class: "sub" }, "Every coin shows its pair. Click a card for the live chart.")), viewTabs), sortTabs, chips), body);
    const filtered = () => applyFilter(coins, { commodityId: pair === "all" ? undefined : pair, tier: tier ?? undefined, sort });
    const render = () => {
        const list = filtered();
        body.replaceChildren();
        if (view === "grid") {
            grid.replaceChildren();
            const slice = list.slice(0, page * PAGE);
            if (!slice.length)
                grid.appendChild(h("div", { class: "card pad", style: "grid-column:1/-1;text-align:center;color:var(--text-3)" }, "No coins on this board yet. ", h("a", { href: href("/launch"), style: "color:var(--accent)" }, "Launch the first one.")));
            for (const c of slice) {
                let card = rendered.get(c.mint);
                if (!card) {
                    card = coinCard(c, { onHoverTint: ctx.tint });
                    rendered.set(c.mint, card);
                }
                grid.appendChild(card);
            }
            body.appendChild(grid);
            if (list.length > slice.length)
                body.appendChild(more);
        }
        else {
            pulse.replaceChildren(pulseCol("New", list.filter((c) => c.status === "curve").sort((a, b) => b.createdAt - a.createdAt).slice(0, 14), "newest"), pulseCol("About to graduate", list.filter((c) => c.status !== "graduated").sort((a, b) => b.bondingProgress - a.bondingProgress).slice(0, 14), "progress"), pulseCol("Graduated", list.filter((c) => c.status === "graduated").sort((a, b) => b.marketCapUsd - a.marketCapUsd).slice(0, 14), "mcap"));
            body.appendChild(pulse);
        }
    };
    const pulseCol = (title, items, kind) => {
        const rows = items.map((c) => {
            const com = byId(c.commodityId);
            return h("a", { class: "row", href: href(`/coin/${c.mint}`) }, h("img", { src: c.image, alt: "" }), h("div", null, h("div", { class: "t" }, `$${c.ticker}`), h("div", { class: "p" }, svg(commodityIcon(com?.icon ?? "")), com?.symbol ?? "", com?.tier === "house" ? h("span", { class: "badge house", style: "height:16px;font-size:9px" }, "HOUSE") : null)), h("div", { class: "m" }, fmtUsd(c.marketCapUsd), h("small", { class: c.change24hPct >= 0 ? "up" : "down" }, kind === "progress" ? `${Math.round(c.bondingProgress * 100)}% curve` : kind === "newest" ? "new" : fmtPct(c.change24hPct))));
        });
        return h("div", { class: "col" }, h("h3", null, title, h("span", { class: "muted" }, String(items.length))), h("div", { class: "list" }, rows.length ? rows : h("div", { class: "muted", style: "padding:10px;font-size:13px" }, "Nothing here yet.")));
    };
    // live list: re-sort in place every few seconds without recreating cards
    let dirty = false;
    const offList = mockMarket()?.subscribeList((list) => { coins = list; dirty = true; }) ?? (() => { });
    const offLaunch = market().subscribeNewLaunches((c) => { coins = [c, ...coins]; dirty = true; });
    const tick = window.setInterval(() => { if (dirty && document.contains(el) && view === "pulse") {
        dirty = false;
        render();
    }
    else if (dirty && sort === "newest") {
        dirty = false;
        render();
    } }, 4000);
    render();
    onRemove(el, () => { offList(); offLaunch(); window.clearInterval(tick); });
    return el;
}
