// Featured main-coin certificate ($QUARRY): live market cap, price, 24h, volume, sparkline, buy links.
import { brand } from "../config/brand.js";
import { fees } from "../config/fees.js";
import { tokenSnapshot } from "../data/heroFeed.js";
import { h, onRemove, svg } from "../lib/dom.js";
import { fmtPct, fmtSmall, fmtUsd, pctArrow, shortAddr } from "../lib/format.js";
import { UI } from "./Icons.js";
import { odometer } from "./Odometer.js";
import { sparkline } from "./Sparkline.js";
import { copyText } from "./Toasts.js";
const GT = "https://api.geckoterminal.com/api/v2/networks/solana/pools";
export function mainCoinCard() {
    const mint = brand.mainCoinMint;
    if (!mint)
        return h("div");
    const tk = `$${(brand.platformTicker ?? brand.name).toUpperCase()}`;
    const mc = odometer("—"), px = odometer("—");
    const chg = h("span", { class: "muted" }, "—");
    const vol = h("b", null, "—"), liq = h("b", null, "—");
    const spark = sparkline([], { color: "auto", fill: true });
    const copyBtn = h("button", { class: "iconbtn", "aria-label": "Copy contract address", onclick: () => void copyText(mint, copyBtn) });
    copyBtn.innerHTML = UI.copy;
    let pair = null;
    const chartLink = h("a", { class: "btn", href: `https://dexscreener.com/solana/${mint}`, target: "_blank", rel: "noopener" }, "Chart", svg(UI.external));
    const el = h("div", { class: "maincoin" }, h("div", { class: "mc-band" }, h("span", null, "Main coin · reference sample"), h("span", null, "Nº 00000")), h("div", { class: "mc-body" }, h("div", { class: "mc-id" }, h("img", { src: brand.logo ?? "", alt: "" }), h("div", null, h("div", { class: "mc-tk" }, tk), h("div", { class: "muted" }, `${brand.name} · launches on pump.fun`), h("div", { class: "mc-ca" }, h("span", { class: "mono" }, shortAddr(mint, 6)), copyBtn))), h("div", { class: "mc-stats" }, h("div", null, h("span", { class: "label" }, "Market cap"), h("div", { class: "v" }, mc.el), chg), h("div", null, h("span", { class: "label" }, "Price"), h("div", { class: "v" }, px.el)), h("div", null, h("span", { class: "label" }, "24H volume"), vol), h("div", null, h("span", { class: "label" }, "Liquidity"), liq)), h("div", { class: "mc-spark" }, spark.el), h("div", { class: "mc-cta" }, h("a", { class: "btn primary lg", href: `https://pump.fun/coin/${mint}`, target: "_blank", rel: "noopener" }, `Buy ${tk}`, svg(UI.external)), chartLink)), h("div", { class: "mc-foot" }, h("span", null, svg(UI.lock), `Every coin launched here sends ${fees.buybackBurnPct}% of its creator fees to buy back & burn ${tk}, and ${fees.mainHolderSolPct}% to ${tk} holders in SOL.`)));
    let last = 0, timer = 0;
    const tick = async (first) => {
        const t = await tokenSnapshot(mint).catch(() => null);
        if (t) {
            mc.set(fmtUsd(t.mc), last ? (t.mc > last ? "up" : t.mc < last ? "down" : null) : null);
            last = t.mc;
            px.set(`$${fmtSmall(t.price)}`);
            if (t.change !== null) {
                chg.textContent = `${pctArrow(t.change)} ${fmtPct(t.change)} 24H`;
                chg.className = t.change >= 0 ? "up" : "down";
            }
            vol.textContent = t.volume ? fmtUsd(t.volume) : "—";
            liq.textContent = t.liquidity ? fmtUsd(t.liquidity) : "—";
            if (first && t.pair) {
                pair = t.pair;
                chartLink.href = `https://www.geckoterminal.com/solana/pools/${pair}`;
                try {
                    const r = await fetch(`${GT}/${pair}/ohlcv/minute?aggregate=15&limit=96&currency=usd`);
                    const o = r.ok ? await r.json() : null;
                    const rows = (o?.data?.attributes?.ohlcv_list ?? []).slice().sort((a, b) => a[0] - b[0]);
                    spark.setData(rows.map((x) => x[4]).filter((v) => v > 0));
                }
                catch { /* sparkline stays empty */ }
            }
        }
        if (first || document.contains(el))
            timer = window.setTimeout(() => void tick(false), 15000);
    };
    void tick(true);
    onRemove(el, () => { window.clearTimeout(timer); spark.destroy(); });
    return el;
}
