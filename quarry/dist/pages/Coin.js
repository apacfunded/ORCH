import { badge } from "../components/Badge.js";
import { assayNo } from "../components/Certificate.js";
import { chartPanel } from "../components/ChartPanel.js";
import { UI } from "../components/Icons.js";
import { odometer } from "../components/Odometer.js";
import { copyText, toast } from "../components/Toasts.js";
import { houseDisclaimer, pairNote } from "../config/brand.js";
import { fees } from "../config/fees.js";
import { byId } from "../config/commodities.js";
import { elNum, elementOf } from "../config/elements.js";
import { isDemo } from "../config/flags.js";
import { market } from "../data/index.js";
import { h, onRemove, svg } from "../lib/dom.js";
import { fmtNum, fmtPct, fmtQuote, fmtSmall, fmtTime, fmtUsd, pctArrow, shortAddr, timeAgo } from "../lib/format.js";
import { href } from "../lib/router.js";
import { mainTicker } from "./Home.js";
import { notFoundPage } from "./NotFound.js";
export function sealSvg(top = "VERIFIED SPLIT", mid = `${fees.creatorSharePct}/${fees.buybackBurnPct}/${fees.mainHolderSolPct}`) {
    const ring = `${top} · LOCKED ON-CHAIN · `;
    return `<svg viewBox="0 0 160 160" aria-hidden="true"><defs><path id="sealp" d="M80 80m-60 0a60 60 0 1 1 120 0a60 60 0 1 1-120 0"/></defs><circle cx="80" cy="80" r="76" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="80" cy="80" r="46" fill="none" stroke="currentColor" stroke-width="1"/><text font-family="JetBrains Mono, monospace" font-size="11" fill="currentColor"><textPath href="#sealp" textLength="372" lengthAdjust="spacing">${ring}</textPath></text><text x="80" y="78" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="17" font-weight="600" fill="currentColor">${mid}</text><text x="80" y="96" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="8" letter-spacing="1.5" fill="currentColor">ASSAYED</text></svg>`;
}
function meter(p) {
    const ticks = Array.from({ length: 21 }, (_, i) => {
        const a = Math.PI * (1 - i / 20);
        const r1 = 88, r2 = i % 5 === 0 ? 74 : 80;
        return `<line x1="${100 + r1 * Math.cos(a)}" y1="${100 - r1 * Math.sin(a)}" x2="${100 + r2 * Math.cos(a)}" y2="${100 - r2 * Math.sin(a)}" stroke="currentColor" stroke-width="${i % 5 === 0 ? 1.5 : 1}"/>`;
    }).join("");
    const labels = [0, 25, 50, 75, 100].map((v) => { const a = Math.PI * (1 - v / 100); return `<text x="${100 + 62 * Math.cos(a)}" y="${100 - 62 * Math.sin(a) + 3}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="8" fill="currentColor" opacity=".6">${v}</text>`; }).join("");
    const el = h("div", { class: "meter" });
    const val = h("div", { class: "mv" }, "0%");
    const set = (v) => {
        const q = Math.max(0, Math.min(1, v));
        const a = Math.PI * (1 - q);
        el.querySelector(".needle")?.setAttribute("x2", String(100 + 84 * Math.cos(a)));
        el.querySelector(".needle")?.setAttribute("y2", String(100 - 84 * Math.sin(a)));
        const arc = el.querySelector(".arc");
        if (arc)
            arc.setAttribute("stroke-dasharray", `${(Math.PI * 92 * q).toFixed(1)} 999`);
        val.textContent = `${Math.round(q * 100)}%`;
    };
    el.innerHTML = `<svg viewBox="0 0 200 112"><path d="M8 100a92 92 0 0 1 184 0" fill="none" stroke="var(--rule)" stroke-width="4"/><path class="arc" d="M8 100a92 92 0 0 1 184 0" fill="none" stroke="var(--signal)" stroke-width="4" stroke-dasharray="0 999" style="transition:stroke-dasharray .6s"/><g style="color:var(--ink)">${ticks}${labels}</g><line class="needle" x1="100" y1="100" x2="16" y2="100" stroke="var(--ink)" stroke-width="2"/><circle cx="100" cy="100" r="4" fill="var(--ink)"/></svg>`;
    el.appendChild(val);
    set(p);
    return { el, set };
}
export async function coinPage(_ctx, params) {
    const coin = await market().getCoin(params.mint).catch(() => null);
    if (!coin)
        return notFoundPage(`No sample at ${shortAddr(params.mint)}. Coins appear here once they're launched through Quarry and verified.`);
    const com = byId(coin.commodityId);
    const e = elementOf(coin.commodityId);
    const sym = com?.symbol ?? "—";
    // ---- certificate header ----
    const copyBtn = h("button", { class: "iconbtn", "aria-label": "Copy contract address", title: "Copy CA", onclick: () => void copyText(coin.mint, copyBtn) });
    copyBtn.innerHTML = UI.copy;
    const status = h("span", null, coin.status === "graduated" ? badge("graduated") : coin.status === "graduating" ? badge("graduating") : badge("curve"));
    const links = h("div", { class: "links" }, isDemo() ? null : h("a", { class: "btn sm primary", href: `https://pump.fun/coin/${coin.mint}`, target: "_blank", rel: "noopener" }, "Trade on pump.fun", svg(UI.external)), h("a", { class: "btn sm", href: `https://solscan.io/token/${coin.mint}`, target: "_blank", rel: "noopener" }, "Solscan"), coin.socials?.x ? h("a", { class: "btn sm", href: coin.socials.x, target: "_blank", rel: "noopener" }, "X") : null, coin.socials?.website ? h("a", { class: "btn sm", href: coin.socials.website, target: "_blank", rel: "noopener" }, "Website") : null, coin.socials?.telegram ? h("a", { class: "btn sm", href: coin.socials.telegram, target: "_blank", rel: "noopener" }, "Telegram") : null);
    const comPrice = h("b", null, "—");
    const cert = h("div", { class: "certificate" }, h("div", { class: "band" }, h("span", null, "Certificate of assay"), h("span", null, `Nº ${assayNo(coin)}`)), h("div", { class: "body" }, h("img", { src: coin.image, alt: "" }), h("div", { style: "min-width:0" }, h("h1", null, coin.name), h("div", { class: "tk" }, h("b", null, `$${coin.ticker}`), h("span", { class: "muted" }, "/"), h("a", { class: "el-chip", href: href(`/board/${com?.id ?? ""}`), style: `--c:${com?.color ?? "var(--ink)"}` }, h("i"), `${e?.sym ?? "?"} · ${com?.name ?? "Unknown"}`), status), links), h("div", { class: "seal stamp-in", title: `Creator fees locked at launch: ${fees.creatorSharePct}% creator, ${fees.buybackBurnPct}% buyback & burn ${mainTicker()}, ${fees.mainHolderSolPct}% ${mainTicker()} holders in SOL`, html: sealSvg() })), h("div", { class: "meta" }, h("div", null, h("span", { class: "label" }, "Contract"), h("b", null, shortAddr(coin.mint, 6), copyBtn)), h("div", null, h("span", { class: "label" }, "Creator"), h("b", null, coin.creator ? h("a", { href: `https://solscan.io/account/${coin.creator}`, target: "_blank", rel: "noopener", class: "linkish" }, shortAddr(coin.creator, 5)) : "—")), h("div", null, h("span", { class: "label" }, "Launched"), h("b", null, new Date(coin.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }))), h("div", null, h("span", { class: "label" }, `${sym} / ${com?.unit ?? "unit"}`), comPrice)));
    // ---- stat line ----
    const mcap = odometer(fmtUsd(coin.marketCapUsd));
    const price = odometer(`$${fmtSmall(coin.priceUsd)}`);
    const inCom = h("div", { class: "s", title: pairNote }, coin.priceQuote ? `${fmtQuote(coin.priceQuote, sym)}` : `— ${sym}`);
    const chg = h("div", { class: `s ${coin.change24hPct >= 0 ? "up" : "down"}` }, `${pctArrow(coin.change24hPct)} ${fmtPct(coin.change24hPct)} 24H`);
    const vol = odometer(fmtUsd(coin.volume24hUsd));
    const curvePct = odometer(`${Math.round(coin.bondingProgress * 100)}%`);
    const statline = h("div", { class: "statline" }, h("div", null, h("span", { class: "label" }, "Market cap"), h("div", { class: "v" }, mcap.el), chg), h("div", null, h("span", { class: "label" }, "Price"), h("div", { class: "v" }, price.el), inCom), h("div", null, h("span", { class: "label" }, "24H volume"), h("div", { class: "v" }, vol.el), h("div", { class: "s" }, "pump.fun, in SOL")), h("div", null, h("span", { class: "label" }, "Curve"), h("div", { class: "v" }, curvePct.el), h("div", { class: "s" }, coin.status === "graduated" ? "Graduated" : "to graduation")));
    // ---- side: gauge ----
    const m = meter(coin.bondingProgress);
    const inCurve = h("span", null, "—"), toGrad = h("span", null, "—");
    const renderCurve = (c) => { inCurve.textContent = `${fmtNum(c.quoteInCurve ?? 0, 2)} SOL`; toGrad.textContent = c.status === "graduated" ? "Done" : `${fmtNum(Math.max(0, (c.quoteToGraduate ?? 0) - 0), 2)} SOL`; };
    renderCurve(coin);
    const gaugePanel = h("div", { class: "panel" }, h("div", { class: "ph" }, h("span", { class: "label" }, "Bonding curve"), h("span", { class: "label" }, "pump.fun")), h("div", { class: "pb" }, m.el, h("div", { class: "kv", style: "margin-top:10px" }, h("div", null, h("span", null, "SOL in curve"), inCurve), h("div", null, h("span", null, "SOL to graduate"), toGrad)), isDemo() ? null : h("a", { class: "btn primary block lg", style: "margin-top:12px", href: `https://pump.fun/coin/${coin.mint}`, target: "_blank", rel: "noopener" }, "Trade on pump.fun", svg(UI.external)), h("p", { class: "hint", style: "margin-top:10px" }, coin.status === "graduated" ? "Graduated. Liquidity moved to PumpSwap; trading continues there." : "When the curve fills, pump.fun graduates the coin to PumpSwap automatically.")));
    // ---- side: trades ----
    const tradesBody = h("div", { class: "tape-trades" }, h("div", { class: "wait" }, "Waiting for trades…"));
    const offTrades = market().subscribeTrades(coin.pairAddress, (t) => {
        tradesBody.querySelector(".wait")?.remove();
        tradesBody.prepend(h("div", { class: `tr in ${t.side}` }, h("span", null, fmtTime(t.ts)), h("span", { class: "side" }, t.side === "buy" ? "BUY" : "SELL"), h("span", null, `${fmtSmall(t.quoteAmount)} SOL`), h("span", { class: "w" }, shortAddr(t.wallet, 3))));
        while (tradesBody.children.length > 40)
            tradesBody.lastElementChild?.remove();
    });
    const tradesPanel = h("div", { class: "panel" }, h("div", { class: "ph" }, h("span", { class: "label" }, "Live trades"), h("span", { class: "live-dot live" }, h("i"), "LIVE")), tradesBody);
    // ---- notes ----
    const notes = h("div", { class: "notes-sec" }, h("div", { class: "panel" }, h("div", { class: "ph" }, h("span", { class: "label" }, "Notes")), h("div", { class: "pb" }, h("p", { class: "desc" }, coin.description || "No notes filed with this sample."), com?.tier === "house" ? h("div", { class: "note house", style: "margin-top:14px" }, h("b", null, "House element. "), houseDisclaimer) : h("div", { class: "note", style: "margin-top:14px" }, pairNote))), h("div", { class: "panel" }, h("div", { class: "ph" }, h("span", { class: "label" }, "Assay record")), h("div", { class: "pb" }, h("div", { class: "kv" }, h("div", null, h("span", null, "Trades on"), h("span", null, "pump.fun, in SOL")), h("div", null, h("span", null, "Element"), h("span", null, `${e ? elNum(e.n) : "--"} ${com?.name ?? ""} (${com?.tier ?? ""})`)), h("div", null, h("span", null, "Supply"), h("span", null, fmtNum(coin.supply ?? 1e9))), h("div", null, h("span", null, "Creator fees · creator"), h("span", null, `${fees.creatorSharePct}%`)), h("div", null, h("span", null, `Creator fees · burn ${mainTicker()}`), h("span", null, `${fees.buybackBurnPct}%`)), h("div", null, h("span", null, `Creator fees · ${mainTicker()} holders`), h("span", null, `${fees.mainHolderSolPct}% in SOL`)), h("div", null, h("span", null, "Contract"), h("span", null, coin.mint))))));
    const holdersHost = h("div", { class: "holders" }, h("div", { class: "skel", style: "height:90px" }));
    void market().getHolders(coin.mint).then((hs) => {
        holdersHost.replaceChildren(...hs.slice(0, 10).map((x, i) => h("div", { class: "row" }, h("span", { class: "muted" }, String(i + 1)), h("span", null, shortAddr(x.wallet, 4), x.label ? h("span", { class: "lab" }, x.label.toUpperCase()) : null), h("div", { class: "bar" }, h("i", { style: `--p:${Math.min(100, x.pct * 5).toFixed(1)}%` })), h("span", { style: "text-align:right" }, `${x.pct.toFixed(2)}%`))));
        if (!hs.length)
            holdersHost.replaceChildren(h("p", { class: "hint" }, "Holder list isn't available for this coin yet. See it on Solscan."));
    }).catch(() => holdersHost.replaceChildren(h("p", { class: "hint" }, "Holder list unavailable.")));
    const holdersPanel = h("div", { class: "panel" }, h("div", { class: "ph" }, h("span", { class: "label" }, "Top holders")), h("div", { class: "pb" }, holdersHost));
    const sticky = isDemo() ? null : h("div", { class: "stickybar" }, h("a", { class: "btn primary block", href: `https://pump.fun/coin/${coin.mint}`, target: "_blank", rel: "noopener" }, `Trade $${coin.ticker} on pump.fun`, svg(UI.external)));
    const page = h("div", { class: "page has-sticky" }, h("div", { class: "crumbs" }, h("a", { href: href("/boards") }, "The table"), h("span", null, "/"), com ? h("a", { href: href(`/board/${com.id}`) }, `${e ? elNum(e.n) : ""} ${com.name}`) : null, h("span", null, "/"), h("span", null, `$${coin.ticker}`)), cert, h("div", { class: "coingrid" }, h("div", { style: "min-width:0" }, statline, chartPanel(coin), notes), h("div", null, gaugePanel, tradesPanel, holdersPanel)), sticky);
    // ---- live ----
    const offQ = market().subscribeCommodityQuote(coin.commodityId, (q) => { comPrice.textContent = fmtUsd(q.priceUsd); });
    void market().getCommodityQuote(coin.commodityId).then((q) => { comPrice.textContent = fmtUsd(q.priceUsd); }).catch(() => { });
    let lastPrice = coin.priceUsd, lastStatus = coin.status;
    const off = market().subscribeCoin(coin.mint, (c) => {
        const dir = c.priceUsd > lastPrice ? "up" : c.priceUsd < lastPrice ? "down" : null;
        lastPrice = c.priceUsd;
        mcap.set(fmtUsd(c.marketCapUsd), dir);
        price.set(`$${fmtSmall(c.priceUsd)}`, dir);
        inCom.textContent = c.priceQuote ? fmtQuote(c.priceQuote, sym) : `— ${sym}`;
        vol.set(fmtUsd(c.volume24hUsd));
        curvePct.set(`${Math.round(c.bondingProgress * 100)}%`);
        chg.textContent = `${pctArrow(c.change24hPct)} ${fmtPct(c.change24hPct)} 24H`;
        chg.className = `s ${c.change24hPct >= 0 ? "up" : "down"}`;
        m.set(c.bondingProgress);
        renderCurve({ ...coin, ...c });
        if (c.status !== lastStatus) {
            lastStatus = c.status;
            status.replaceChildren(badge(c.status === "graduated" ? "graduated" : c.status === "graduating" ? "graduating" : "curve"));
            if (c.status === "graduated")
                toast(`$${coin.ticker} graduated on pump.fun`, { icon: "grad", color: "#ff5b1f" });
        }
    });
    onRemove(page, () => { off(); offQ(); offTrades(); });
    void timeAgo;
    return page;
}
