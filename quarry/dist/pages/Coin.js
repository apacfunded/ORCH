import { badge, statusBadge, tierBadge } from "../components/Badge.js";
import { chartPanel } from "../components/ChartPanel.js";
import { UI, commodityIcon } from "../components/Icons.js";
import { odometer } from "../components/Odometer.js";
import { copyText, toast } from "../components/Toasts.js";
import { tradePanel } from "../components/TradePanel.js";
import { wallet } from "../components/WalletButton.js";
import { houseDisclaimer, pairNote } from "../config/brand.js";
import { isDemo } from "../config/flags.js";
import { fees, fmtFee } from "../config/fees.js";
import { byId } from "../config/commodities.js";
import { market } from "../data/index.js";
import { h, onRemove, svg } from "../lib/dom.js";
import { fmtNum, fmtPct, fmtQuote, fmtSmall, fmtTime, fmtUsd, pctArrow, shortAddr, timeAgo } from "../lib/format.js";
import { storage } from "../lib/motion.js";
import { href } from "../lib/router.js";
import { notFoundPage } from "./NotFound.js";
export async function coinPage(ctx, params) {
    const coin = await market().getCoin(params.mint);
    if (!coin)
        return notFoundPage(`No coin at ${shortAddr(params.mint)}`);
    const com = byId(coin.commodityId);
    const accent = com?.color ?? "#e6b84a";
    const sym = com?.symbol ?? "QUOTE";
    const isHouseToken = !!coin.houseToken;
    ctx.tint(accent);
    // ---- header ----
    const copyBtn = h("button", { class: "iconbtn", "aria-label": "Copy contract address", onclick: () => void copyText(coin.mint, copyBtn) });
    copyBtn.innerHTML = UI.copy;
    const statusEl = statusBadge(coin.status);
    const head = h("div", { class: "card pad" }, h("div", { class: "coinhead" }, h("img", { src: coin.image, alt: "" }), h("div", { style: "flex:1;min-width:0" }, h("h1", null, coin.name, statusEl, coin.rewards ? badge("rewards") : null), h("div", { class: "row2" }, h("span", { class: "num" }, `$${coin.ticker}`), isHouseToken
        ? h("span", { class: "pairchip", style: `--c:${accent}` }, h("b", null, coin.ticker), " / ", h("b", null, "SOL"), h("span", { class: "muted", style: "font-size:11px" }, "unlocks the board"))
        : h("span", { class: "pairchip tip", style: `--c:${accent}`, tabindex: "0", "aria-label": `${coin.ticker} priced in ${sym}. ${pairNote}` }, h("b", null, coin.ticker), " / ", svg(commodityIcon(com?.icon ?? ""), "ico"), h("b", null, sym), com ? tierBadge(com, { tooltip: false }) : null, h("span", { class: "tipbox", role: "tooltip" }, pairNote, com?.tier === "house" ? ` ${houseDisclaimer}` : "")), h("span", { class: "ca" }, "CA ", shortAddr(coin.mint, 6), copyBtn), h("div", { class: "links" }, isDemo() ? null : h("a", { class: "btn sm", href: `https://pump.fun/coin/${coin.mint}`, target: "_blank", rel: "noopener", title: "Trade on pump.fun" }, "pump.fun", svg(UI.external)), h("a", { class: "iconbtn", href: `https://solscan.io/token/${coin.mint}`, target: "_blank", rel: "noopener", title: "Solscan", "aria-label": "View on Solscan" }, svg(UI.external)), coin.socials.x ? h("a", { class: "iconbtn", href: coin.socials.x, target: "_blank", rel: "noopener", title: "X", "aria-label": "X" }, "𝕏") : null, coin.socials.website ? h("a", { class: "iconbtn", href: coin.socials.website, target: "_blank", rel: "noopener", title: "Website", "aria-label": "Website" }, svg(UI.home)) : null)))), isHouseToken ? h("div", { class: "disc-box", style: "margin-top:12px" }, h("b", null, "House token · "), houseDisclaimer, ` It trades on pump.fun like any coin. When $${sym} graduates, the ${com?.name} board unlocks.`) : null, com?.tier === "house" && !isHouseToken ? h("div", { class: "disc-box", style: "margin-top:12px" }, h("b", null, "Priced in a House token · "), houseDisclaimer) : null);
    // ---- stat row with odometers ----
    const mcap = odometer(fmtUsd(coin.marketCapUsd));
    const price = odometer(`$${fmtSmall(coin.priceUsd)}`);
    const priceQ = h("div", { class: "v small num", title: isHouseToken ? "Price in SOL" : `Converted: USD price ÷ ${sym} price` }, isHouseToken ? fmtQuote(coin.priceQuote, "SOL") : `≈ ${fmtQuote(coin.priceQuote, sym)}`);
    const vol = odometer(fmtUsd(coin.volume24hUsd));
    const holders = odometer(fmtNum(coin.holders));
    const prog = odometer(`${Math.round(coin.bondingProgress * 100)}%`);
    const chg = h("div", { class: `v small num ${coin.change24hPct >= 0 ? "up" : "down"}` }, `${pctArrow(coin.change24hPct)} ${fmtPct(coin.change24hPct)} 24h`);
    const stats = h("div", { class: "statrow" }, h("div", { class: "stat" }, h("div", { class: "k" }, "Market cap"), h("div", { class: "v" }, mcap.el), chg), h("div", { class: "stat" }, h("div", { class: "k" }, "Price"), h("div", { class: "v" }, price.el), priceQ), h("div", { class: "stat" }, h("div", { class: "k" }, "24h volume"), h("div", { class: "v" }, vol.el)), h("div", { class: "stat" }, h("div", { class: "k" }, "Holders"), h("div", { class: "v" }, holders.el)), h("div", { class: "stat" }, h("div", { class: "k" }, "Bonding"), h("div", { class: "v" }, prog.el)));
    // ---- bonding card ----
    const bondFill = h("i", { style: `--p:${(coin.bondingProgress * 100).toFixed(1)}%` });
    const bondNums = h("div", { class: "nums" });
    const renderBond = (c) => bondNums.replaceChildren(h("span", null, h("b", null, `${fmtNum(c.quoteInCurve, 2)} SOL`), " in curve"), h("span", null, h("b", null, `${fmtNum(Math.max(0, c.quoteToGraduate - c.quoteInCurve), 2)} SOL`), " to graduate"));
    renderBond(coin);
    const bond = h("div", { class: "card bondcard", style: `--c:${accent};--c2:${com?.color2 ?? accent}` }, h("div", { style: "display:flex;justify-content:space-between;align-items:center" }, h("div", { class: "eyebrow" }, coin.status === "graduated" ? "Graduated on pump.fun" : "pump.fun bonding curve"), h("span", { class: "num" }, `${Math.round(coin.bondingProgress * 100)}%`)), h("div", { class: "bar big" }, bondFill), bondNums, h("p", { class: "muted", style: "font-size:12.5px" }, coin.status === "graduated" ? `Graduated ${coin.graduatedAt ? timeAgo(coin.graduatedAt) : ""}. Liquidity moved to pump.fun's AMM (PumpSwap) and trading continues there.${isHouseToken ? ` The ${com?.name} board is unlocked.` : ""}` : `When the curve fills, pump.fun graduates the coin and moves its liquidity to PumpSwap automatically.${isHouseToken ? ` That also unlocks the ${com?.name} board here.` : ""}`));
    // ---- tabs ----
    const tabsBar = h("div", { class: "tabs", role: "tablist" });
    const ink = h("div", { class: "ink" });
    tabsBar.appendChild(ink);
    const body = h("div", { class: "body" });
    const tabs = [["Trades", () => tradesTab(coin)], ["Holders", () => holdersTab(coin)], ["Comments", () => commentsTab(coin)], ["Info", () => infoTab(coin, sym)]];
    let cur = 0;
    const btns = tabs.map(([l], i) => h("button", { role: "tab", class: i === 0 ? "active" : "", onclick: () => { cur = i; btns.forEach((b, j) => b.classList.toggle("active", j === i)); moveInk(); body.replaceChildren(tabs[i][1]()); } }, l));
    btns.forEach((b) => tabsBar.appendChild(b));
    const moveInk = () => { const a = btns[cur]; ink.style.left = `${a.offsetLeft}px`; ink.style.width = `${a.offsetWidth}px`; };
    requestAnimationFrame(moveInk);
    body.appendChild(tabs[0][1]());
    const chart = chartPanel(coin);
    const trade = tradePanel(coin);
    const sticky = h("div", { class: "stickybar" }, h("button", { class: "btn up", style: "flex:1", onclick: () => { trade.scrollIntoView({ behavior: "smooth" }); trade.querySelector(".bs .buy")?.click(); } }, "Buy"), h("button", { class: "btn down", style: "flex:1", onclick: () => { trade.scrollIntoView({ behavior: "smooth" }); trade.querySelector(".bs .sell")?.click(); } }, "Sell"));
    const page = h("div", { class: "page" }, h("a", { class: "btn ghost sm", href: href(com ? `/board/${com.id}` : "/"), style: "margin-bottom:10px" }, svg(UI.back), com ? `${com.name} board` : "Boards"), h("div", { class: "coinpage" }, h("div", null, head, stats, h("div", { style: "margin-top:16px" }, chart), h("div", { class: "card pad coin-tabs" }, tabsBar, body)), h("div", { class: "side", style: "display:grid;gap:12px" }, trade, bond)), sticky);
    // ---- live numbers ----
    let lastPrice = coin.priceUsd;
    let lastStatus = coin.status;
    const off = market().subscribeCoin(coin.mint, (c) => {
        const dir = c.priceUsd > lastPrice ? "up" : c.priceUsd < lastPrice ? "down" : null;
        lastPrice = c.priceUsd;
        mcap.set(fmtUsd(c.marketCapUsd), dir);
        price.set(`$${fmtSmall(c.priceUsd)}`, dir);
        priceQ.textContent = isHouseToken ? fmtQuote(c.priceQuote, "SOL") : `≈ ${fmtQuote(c.priceQuote, sym)}`;
        vol.set(fmtUsd(c.volume24hUsd));
        holders.set(fmtNum(c.holders));
        prog.set(`${Math.round(c.bondingProgress * 100)}%`);
        chg.textContent = `${pctArrow(c.change24hPct)} ${fmtPct(c.change24hPct)} 24h`;
        chg.className = `v small num ${c.change24hPct >= 0 ? "up" : "down"}`;
        bondFill.style.setProperty("--p", `${(c.bondingProgress * 100).toFixed(1)}%`);
        bond.querySelector(".num").textContent = `${Math.round(c.bondingProgress * 100)}%`;
        renderBond(c);
        if (c.status !== lastStatus) {
            lastStatus = c.status;
            const nb = statusBadge(c.status);
            statusEl.replaceWith(nb);
            if (c.status === "graduated")
                toast(`$${coin.ticker} graduated on pump.fun`, { icon: "grad", color: accent });
        }
    });
    onRemove(page, () => { off(); ctx.tint(null); });
    return page;
}
// ---------- tabs ----------
function tradesTab(coin) {
    const com = byId(coin.commodityId);
    void com;
    const sym = "SOL";
    const tbody = h("tbody");
    const el = h("div", { style: "overflow-x:auto" }, h("table", { class: "trades" }, h("thead", null, h("tr", null, h("th", null, "Time"), h("th", null, "Side"), h("th", null, sym), h("th", null, coin.ticker), h("th", null, "Price"), h("th", null, "Wallet"))), tbody));
    let maxQ = 0.5;
    const off = market().subscribeTrades(coin.pairAddress, (t) => {
        maxQ = Math.max(maxQ, t.quoteAmount);
        const whale = t.quoteAmount > maxQ * 0.5 && t.quoteAmount > 5;
        const tr = h("tr", { class: `in ${t.side} ${whale ? "whale" : ""}`, style: `--w:${Math.min(100, (t.quoteAmount / maxQ) * 100).toFixed(0)}%` }, h("td", null, fmtTime(t.ts)), h("td", { class: "side" }, t.side.toUpperCase()), h("td", null, fmtSmall(t.quoteAmount)), h("td", null, fmtNum(t.baseAmount, 0)), h("td", null, `$${fmtSmall(t.priceUsd)}`), h("td", { class: "muted" }, shortAddr(t.wallet)));
        tbody.prepend(tr);
        while (tbody.children.length > 40)
            tbody.lastElementChild?.remove();
    });
    if (!tbody.children.length)
        tbody.appendChild(h("tr", null, h("td", { colspan: "6", class: "muted" }, "Waiting for trades…")));
    const mo = new MutationObserver(() => { const first = tbody.firstElementChild; if (tbody.children.length > 1 && first?.textContent?.includes("Waiting"))
        first.remove(); const w = [...tbody.children].find((r) => r.textContent?.includes("Waiting")); if (tbody.children.length > 1 && w)
        w.remove(); });
    mo.observe(tbody, { childList: true });
    onRemove(el, () => { off(); mo.disconnect(); });
    return el;
}
function holdersTab(coin) {
    const el = h("div", { class: "holders" }, h("div", { class: "skel", style: "height:120px" }));
    void market().getHolders(coin.mint).then((hs) => {
        el.replaceChildren(...hs.map((x, i) => h("div", { class: "row" }, h("span", { class: "muted" }, String(i + 1)), h("span", null, shortAddr(x.wallet, 5), x.label ? h("span", { class: "lab" }, x.label.toUpperCase()) : null), h("div", { class: "bar" }, h("i", { style: `--p:${Math.min(100, x.pct * 8).toFixed(1)}%` })), h("span", { style: "text-align:right" }, `${x.pct.toFixed(2)}%`))));
        if (!hs.length)
            el.replaceChildren(h("div", { class: "muted" }, "No holders yet."));
    });
    return el;
}
function commentsTab(coin) {
    // v1: local-only thread (kept in this browser). v2: wallet-signed posts via the proxy.
    const key = `pit:comments:${coin.mint}`;
    const load = () => { try {
        return JSON.parse(storage.get(key) ?? "[]");
    }
    catch {
        return [];
    } };
    const list = h("div");
    const render = () => {
        const items = load();
        list.replaceChildren(...items.map((c) => h("div", { class: "c" }, h("div", { class: "who" }, `${shortAddr(c.who, 4)} · ${timeAgo(c.ts)}`), h("div", null, c.text))));
        if (!items.length)
            list.appendChild(h("div", { class: "muted", style: "font-size:13px;padding:8px 0" }, "No callouts yet. Post the first thesis."));
    };
    const ta = h("textarea", { placeholder: "Post a callout or thesis…", maxlength: "280", "aria-label": "Comment" });
    const form = h("form", { onsubmit: (e) => {
            e.preventDefault();
            const text = ta.value.trim();
            if (!text)
                return;
            const who = wallet.get().address ?? "guest";
            const items = load();
            items.unshift({ who, text, ts: Date.now() });
            storage.set(key, JSON.stringify(items.slice(0, 50)));
            ta.value = "";
            render();
            toast("Posted (saved on this device only in demo)", { icon: "check", color: "#58d68d" });
        } }, ta, h("button", { class: "btn primary", type: "submit" }, "Post"));
    render();
    return h("div", { class: "comments" }, form, list, h("p", { class: "muted", style: "font-size:11.5px;margin-top:8px" }, "Wallet-signed comments arrive with live data. Demo comments stay in this browser."));
}
function infoTab(coin, sym) {
    const com = byId(coin.commodityId);
    return h("div", null, h("p", { style: "color:var(--text-2);margin-bottom:12px;font-size:14px" }, coin.description || "No description."), h("div", { class: "kv" }, h("div", null, h("span", null, "Trades on"), h("span", null, "pump.fun, in SOL")), h("div", null, h("span", null, "Priced here in"), h("span", null, `${sym} (site-side conversion)`)), h("div", null, h("span", null, "Board tier"), h("span", null, com?.tier === "backed" ? "Backed (tokenized commodity price)" : "House (launchpad token, no reserves)")), h("div", null, h("span", null, `${sym} price source`), h("span", null, com?.mint ?? "CONFIG — not set")), h("div", null, h("span", null, "Creator"), h("span", null, shortAddr(coin.creator, 6))), h("div", null, h("span", null, "Launched"), h("span", null, new Date(coin.createdAt).toLocaleString())), h("div", null, h("span", null, "Supply"), h("span", null, fmtNum(coin.supply))), h("div", null, h("span", null, "Trading fee"), h("span", null, "pump.fun's standard fee")), h("div", null, h("span", null, "Creator fees: launchpad share"), h("span", null, fmtFee(fees.launchpadSharePct))), h("div", null, h("span", null, "Creator fees: creator share"), h("span", null, fmtFee(fees.creatorSharePct))), h("div", null, h("span", null, "Holder rewards"), h("span", null, coin.rewards ? `${fmtFee(fees.holderRewardsPct)} of creator fees, paid in ${sym}` : "Off")), h("div", null, h("span", null, "Contract"), h("span", null, coin.mint))));
}
