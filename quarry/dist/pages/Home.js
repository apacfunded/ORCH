import { brand } from "../config/brand.js";
import { fees } from "../config/fees.js";
import { elements } from "../config/elements.js";
import { heroFeed as heroCfg } from "../config/hero.js";
import { market } from "../data/index.js";
import { heroSource, tokenSnapshot } from "../data/heroFeed.js";
import { certCard, emptyNote } from "../components/Certificate.js";
import { periodicTable, tableLegend } from "../components/Element.js";
import { UI } from "../components/Icons.js";
import { odometer } from "../components/Odometer.js";
import { h, onRemove, svg } from "../lib/dom.js";
import { fmtPct, fmtSmall, fmtUsd, pctArrow } from "../lib/format.js";
import { href } from "../lib/router.js";
export const mainTicker = () => `$${(brand.platformTicker ?? brand.name).toUpperCase()}`;
export async function homePage() {
    const coins = await market().listCoins({ limit: 400 }).catch(() => []);
    const listed = coins.filter((c) => !c.houseToken);
    // ---------- hero ----------
    const hero = h("section", { class: "hero" }, h("div", { class: "copy" }, h("div", { class: "kicker" }, h("span", { class: "label" }, "Assay office · Solana"), h("span", { class: "label" }, "Launches on pump.fun")), h("h1", null, "Every coin, ", h("em", null, "weighed"), " against the real world."), h("div", { style: "display:grid;gap:20px" }, h("p", { class: "sub" }, brand.subline), h("div", { class: "ctas" }, h("a", { class: "btn primary lg", href: href("/launch") }, "Launch a coin", svg(UI.arrow)), h("a", { class: "btn lg", href: href("/boards") }, "Browse the table"))), h("div", { class: "facts" }, h("div", null, h("span", { class: "label" }, "Elements"), h("b", null, String(elements().length))), h("div", null, h("span", { class: "label" }, "Fee split, locked"), h("b", null, `${fees.creatorSharePct}/${fees.buybackBurnPct}/${fees.mainHolderSolPct}`)), h("div", null, h("span", { class: "label" }, "Samples listed"), h("b", null, String(listed.length))))), h("div", { class: "readout-col" }, readout()));
    // ---------- table ----------
    const table = periodicTable(coins);
    const tableSec = h("section", { class: "section", id: "table" }, h("div", { class: "sechead" }, h("span", { class: "no" }, "§ 01"), h("h2", null, "The table"), h("div", { class: "side" }, `${elements().length} elements · `, h("a", { href: href("/boards") }, "open full table"))), table.el, tableLegend());
    // ---------- fresh assays ----------
    const fresh = [...listed].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
    const freshGrid = h("div", { class: "certs" }, fresh.map((c) => certCard(c)));
    const freshBody = h("div", null, fresh.length ? freshGrid : emptyNote("No samples on the table yet.", "The first coin launched here gets Assay Nº 1 on the front page.", h("a", { class: "btn primary", href: href("/launch") }, "Submit the first sample")));
    const offLaunch = market().subscribeNewLaunches((c) => {
        if (c.houseToken)
            return;
        if (!freshBody.contains(freshGrid))
            freshBody.replaceChildren(freshGrid);
        freshGrid.prepend(certCard(c, { fresh: true }));
        while (freshGrid.children.length > 8)
            freshGrid.lastElementChild?.remove();
    });
    const freshSec = h("section", { class: "section" }, h("div", { class: "sechead" }, h("span", { class: "no" }, "§ 02"), h("h2", null, "Fresh assays"), h("div", { class: "side" }, "Newest launches, live")), freshBody);
    // ---------- fees ----------
    const feeSec = h("section", { class: "section" }, h("div", { class: "sechead" }, h("span", { class: "no" }, "§ 03"), h("h2", null, "How fees flow"), h("div", { class: "side" }, "Per coin, forever")), feeFlow());
    // ---------- method strip ----------
    const steps = [
        ["Submit", "Name, ticker, image. Socials optional."],
        ["Choose an element", "Gold, oil, uranium, coffee or 46 others. That's the board your coin lives on."],
        ["Launch on pump.fun", "One transaction from your wallet. Trades in SOL on pump.fun."],
        ["Get weighed", "Here, your price is shown in your element, live, next to USD."],
    ];
    const methodSec = h("section", { class: "section" }, h("div", { class: "sechead" }, h("span", { class: "no" }, "§ 04"), h("h2", null, "Method, short"), h("div", { class: "side" }, h("a", { href: href("/docs") }, "read the full method"))), h("div", { class: "stats", style: "margin-top:0;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))" }, steps.map(([t, d], i) => h("div", { style: "padding:16px 14px 18px" }, h("span", { class: "label" }, `Step ${String(i + 1).padStart(2, "0")}`), h("div", { class: "serif", style: "font-size:26px;line-height:1.05;margin-top:8px" }, t), h("p", { class: "muted", style: "font-size:13.5px;margin-top:8px" }, d)))));
    const page = h("div", { class: "page" }, hero, tableSec, freshSec, feeSec, methodSec);
    onRemove(page, offLaunch);
    return page;
}
export function feeFlow() {
    return h("div", { class: "flow" }, h("div", { class: "src" }, h("span", { class: "label" }, "Input"), h("div", { class: "serif" }, "100% of a coin's pump.fun creator fees"), h("p", null, "pump.fun pays creator fees on every trade. Each coin launched here splits them three ways, set in the launch transaction."), h("div", { class: "lock" }, svg(UI.lock), "Locked on-chain at launch. Nobody can change it.")), h("div", { class: "lines" }, line(fees.creatorSharePct, "To the creator", "Paid straight to the wallet that launched the coin.", false), line(fees.buybackBurnPct, `Buy back & burn ${mainTicker()}`, `Used to buy ${mainTicker()} on the market, then burned.`, true), line(fees.mainHolderSolPct, `To ${mainTicker()} holders`, "Paid out in SOL to main-coin holders.", false)));
}
function line(pct, title, sub, sig) {
    return h("div", { class: `line ${sig ? "sig" : ""}` }, h("div", { class: "pct" }, `${pct}%`), h("div", { class: "what" }, h("b", null, title), h("small", null, sub)), h("div", { class: "bar" }, h("i", { style: `--p:${pct}%` })));
}
// ---------- main-coin instrument readout ----------
const GT = "https://api.geckoterminal.com/api/v2/networks/solana/pools";
async function getJson(url) {
    try {
        const r = await fetch(url, { cache: "no-store" });
        return r.ok ? await r.json() : null;
    }
    catch {
        return null;
    }
}
function readout() {
    const isCoin = !!heroCfg.coinMint;
    const canvas = h("canvas");
    const who = h("div", { class: "who" }, h("span", { class: "live-dot live" }, h("i"), "LIVE"));
    const name = h("b", null, isCoin ? mainTicker() : "Gold");
    const label = h("span", { class: "label" }, isCoin ? "Market cap" : "USD / oz");
    const big = odometer("—");
    const chg = h("span", { class: "chg muted" }, "");
    const fHigh = h("b", null, "—"), fLow = h("b", null, "—"), fPrice = h("b", null, "—");
    const img = h("img", { alt: "", style: "display:none" });
    who.prepend(img);
    who.appendChild(name);
    const el = h("div", { class: "readout", style: "flex:1" }, h("div", { class: "rhead" }, who, h("span", { class: "label" }, isCoin ? "Main coin · 24h" : "Gold spot · live")), h("div", { class: "big" }, h("div", { style: "width:100%" }, label), h("span", { class: "v" }, big.el), chg), h("div", { class: "plot" }, canvas), h("div", { class: "rfoot" }, h("div", null, h("span", { class: "label" }, "24H high"), fHigh), h("div", null, h("span", { class: "label" }, "24H low"), fLow), h("div", null, h("span", { class: "label" }, isCoin ? "Price" : "Trade"), isCoin ? fPrice : h("a", { href: href("/board/gold"), class: "mono", style: "display:block;font-size:13px;margin-top:2px" }, "Gold board →"))));
    let pts = [];
    let k = 1; // price → displayed value (mcap) multiplier
    let last = 0;
    const fmtV = (v) => (isCoin ? fmtUsd(v) : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    const draw = () => {
        const dpr = Math.min(2, devicePixelRatio || 1);
        const w = canvas.clientWidth, ht = canvas.clientHeight;
        if (!w || !ht)
            return;
        canvas.width = w * dpr;
        canvas.height = ht * dpr;
        const c = canvas.getContext("2d");
        if (!c)
            return;
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, w, ht);
        const css = getComputedStyle(document.documentElement);
        const ink = css.getPropertyValue("--ink").trim() || "#141414";
        const ink3 = css.getPropertyValue("--ink-3").trim() || "#6e6a60";
        const rule = css.getPropertyValue("--rule").trim() || "#d8d2c4";
        const sig = css.getPropertyValue("--signal").trim() || "#ff5b1f";
        const axis = 64;
        const pw = w - axis, top = 12, bot = 22, ph = ht - top - bot;
        c.font = "10px JetBrains Mono, monospace";
        c.lineWidth = 1;
        const series = pts.length === 1 ? [pts[0], pts[0]] : pts;
        const min = series.length ? Math.min(...series) : 0, max = series.length ? Math.max(...series) : 1;
        const span = max - min || Math.max(1e-9, max * 0.002);
        const Y = (v) => top + (1 - (v - min) / span) * ph;
        // grid + axis labels
        for (let i = 0; i <= 4; i++) {
            const y = top + (ph / 4) * i;
            c.strokeStyle = rule;
            c.beginPath();
            c.moveTo(0, Math.round(y) + 0.5);
            c.lineTo(pw, Math.round(y) + 0.5);
            c.stroke();
            if (series.length) {
                c.fillStyle = ink3;
                c.textAlign = "left";
                c.fillText(fmtV(max - (span / 4) * i), pw + 8, y + 3);
            }
        }
        c.fillStyle = ink3;
        c.textAlign = "left";
        c.fillText(isCoin ? "−24H" : "−15H", 0, ht - 6);
        c.textAlign = "right";
        c.fillText("NOW", pw, ht - 6);
        if (series.length < 2) {
            c.textAlign = "center";
            c.fillText("WAITING FOR DATA", pw / 2, top + ph / 2);
            return;
        }
        const X = (i) => (i / (series.length - 1)) * pw;
        c.strokeStyle = ink;
        c.lineWidth = 1.5;
        c.lineJoin = "round";
        c.beginPath();
        series.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v))));
        c.stroke();
        const lx = X(series.length - 1), ly = Y(series[series.length - 1]);
        c.setLineDash([3, 3]);
        c.strokeStyle = sig;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(0, Math.round(ly) + 0.5);
        c.lineTo(pw, Math.round(ly) + 0.5);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = sig;
        c.fillRect(lx - 3, ly - 3, 6, 6);
        c.fillRect(pw + 2, ly - 8, axis - 2, 16);
        c.fillStyle = "#141414";
        c.textAlign = "left";
        c.fillText(fmtV(series[series.length - 1]), pw + 6, ly + 3.5);
    };
    const show = (value, change, price) => {
        big.set(fmtV(value), last ? (value > last ? "up" : value < last ? "down" : null) : null);
        last = value;
        if (change !== null && change !== undefined && isFinite(change)) {
            chg.textContent = `${pctArrow(change)} ${fmtPct(change)} 24H`;
            chg.className = `chg ${change >= 0 ? "up" : "down"}`;
        }
        if (price)
            fPrice.textContent = `$${fmtSmall(price)}`;
        if (pts.length) {
            fHigh.textContent = fmtV(Math.max(...pts));
            fLow.textContent = fmtV(Math.min(...pts));
        }
        draw();
    };
    let timer = 0;
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    document.addEventListener("pit:theme", draw);
    if (isCoin) {
        const mint = heroCfg.coinMint;
        const poll = async (first) => {
            const t = await tokenSnapshot(mint);
            if (t) {
                k = t.price ? t.mc / t.price : 1e9;
                if (t.symbol)
                    name.textContent = `$${t.symbol.toUpperCase()}`;
                if (t.image && img.style.display === "none") {
                    img.src = t.image;
                    img.style.display = "";
                }
                if (first && t.pair) {
                    const o = await getJson(`${GT}/${t.pair}/ohlcv/minute?aggregate=15&limit=96&currency=usd`);
                    const rows = (o?.data?.attributes?.ohlcv_list ?? []).slice().sort((a, b) => a[0] - b[0]);
                    pts = rows.map((row) => row[4] * k).filter((v) => isFinite(v) && v > 0);
                }
                pts.push(t.mc);
                if (pts.length > 160)
                    pts.shift();
                show(t.mc, t.change, t.price);
            }
            else if (first) {
                draw();
            }
            if (document.contains(el) || first)
                timer = window.setTimeout(() => void poll(false), 15000);
        };
        void poll(true);
    }
    else {
        const feed = heroSource();
        const tick = async () => { const q = await feed.poll(); if (q) {
            pts.push(q.value);
            if (pts.length > 160)
                pts.shift();
            show(q.value, q.change24h);
        } timer = window.setTimeout(tick, feed.intervalMs); };
        void feed.initial().then((r) => { if (r) {
            pts = r.history.slice(-120);
            show(r.quote.value, r.quote.change24h);
        }
        else
            draw(); timer = window.setTimeout(tick, feed.intervalMs); });
    }
    onRemove(el, () => { window.clearTimeout(timer); ro.disconnect(); document.removeEventListener("pit:theme", draw); });
    return el;
}
// Board page reuses the explorer name from the old layout.
export { coinLedger as coinExplorer } from "../components/Ledger.js";
