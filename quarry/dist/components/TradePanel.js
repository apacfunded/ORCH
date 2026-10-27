// ============================================================
// TRADE PANEL — coins trade in SOL on pump.fun. This panel takes a SOL amount
// and shows what it's worth in the board's commodity (site-side conversion).
//
// v1: the Buy/Sell button is a stub ("Trading opens at launch"); nothing is sent.
// Phase 2 options (pick one):
//   a) Link out: send people to https://pump.fun/coin/<mint> (zero risk, already shown below).
//   b) In-site trading via PumpPortal's local transaction API:
//        POST https://pumpportal.fun/api/trade-local
//        { publicKey, action: "buy"|"sell", mint, amount, denominatedInSol: "true"|"false",
//          slippage, priorityFee, pool: "pump" }
//      It returns a serialized transaction; deserialize it and have the connected
//      wallet sign and send it. Note PumpPortal charges its own fee on trades.
// ============================================================
import { byId } from "../config/commodities.js";
import { fees, fmtFee } from "../config/fees.js";
import { isDemo } from "../config/flags.js";
import { market } from "../data/index.js";
import { h, onRemove, svg } from "../lib/dom.js";
import { fmtNum, fmtSmall } from "../lib/format.js";
import { UI } from "./Icons.js";
import { toast } from "./Toasts.js";
import { openWalletModal, wallet } from "./WalletButton.js";
/** Simulated SOL price used for the demo conversion. Phase 2 reads SOL/USD from the data layer. */
const SOL_USD_DEMO = 150;
export function tradePanel(coin) {
    const com = byId(coin.commodityId);
    const isHouseToken = !!coin.houseToken;
    const sym = com?.symbol ?? "";
    let side = "buy";
    let amount = 0;
    let slippage = 5;
    let priceUsd = coin.priceUsd;
    let commodityUsd = 0;
    void market().getCommodityQuote(coin.commodityId).then((q) => { commodityUsd = q.priceUsd; recalc(); });
    const offQ = market().subscribeCommodityQuote(coin.commodityId, (q) => { commodityUsd = q.priceUsd; recalc(); });
    const buyBtn = h("button", { class: "buy active", onclick: () => setSide("buy") }, "Buy");
    const sellBtn = h("button", { class: "sell", onclick: () => setSide("sell") }, "Sell");
    const input = h("input", { type: "number", inputmode: "decimal", min: "0", step: "any", placeholder: "0.00", id: "trade-amount" });
    const unit = h("span", { class: "unit" }, "SOL");
    const worth = h("span", { class: "muted" }, "");
    const outEl = h("b", null, "0");
    const impactEl = h("b", null, "0.00%");
    const slipBtns = [1, 5, 10].map((s) => h("button", { class: s === slippage ? "active" : "", onclick: () => { slippage = s; slipBtns.forEach((b) => b.classList.toggle("active", Number(b.textContent?.replace("%", "")) === s)); } }, `${s}%`));
    const submit = h("button", { class: "btn block up", onclick: () => onSubmit() }, "Buy $" + coin.ticker);
    const quick = h("div", { class: "quick" });
    const setQuick = () => {
        const vals = side === "buy" ? ["0.1", "0.5", "1", "5"] : ["25%", "50%", "75%", "100%"];
        quick.replaceChildren(...vals.map((q) => h("button", { onclick: () => { input.value = side === "buy" ? q : q.replace("%", ""); recalc(); } }, side === "buy" ? `${q} SOL` : q)));
    };
    const setSide = (s) => {
        side = s;
        buyBtn.classList.toggle("active", s === "buy");
        sellBtn.classList.toggle("active", s === "sell");
        submit.className = `btn block ${s === "buy" ? "up" : "down"}`;
        submit.textContent = `${s === "buy" ? "Buy" : "Sell"} $${coin.ticker}`;
        unit.textContent = s === "buy" ? "SOL" : `% of $${coin.ticker}`;
        input.placeholder = s === "buy" ? "0.00" : "0";
        setQuick();
        recalc();
    };
    const recalc = () => {
        amount = Math.max(0, Number(input.value) || 0);
        const depth = Math.max(coin.quoteToGraduate * 0.6, 1);
        const sol = side === "buy" ? amount : 0;
        const impact = side === "buy" ? (sol / (depth + sol)) * 100 : Math.min(30, amount * 0.08);
        const tokens = side === "buy" && priceUsd > 0 ? ((sol * SOL_USD_DEMO) / priceUsd) * (1 - impact / 100) : 0;
        outEl.textContent = side === "buy" ? `${fmtNum(tokens, 0)} ${coin.ticker}` : `${amount}% of your bag`;
        impactEl.textContent = `${impact.toFixed(2)}%`;
        impactEl.className = impact > 5 ? "down" : "";
        if (side === "buy" && sol > 0 && commodityUsd > 0 && !isHouseToken) {
            worth.textContent = `≈ ${fmtSmall((sol * SOL_USD_DEMO) / commodityUsd)} ${sym}`;
        }
        else
            worth.textContent = "";
    };
    const onSubmit = () => {
        if (!wallet.get().address) {
            openWalletModal();
            return;
        }
        if (amount <= 0) {
            toast("Enter an amount first", { color: "#f2b84b" });
            input.focus();
            return;
        }
        // STUB — Phase 2: PumpPortal trade-local transaction signed by the wallet, or link out to pump.fun.
        toast(isDemo() ? "Trading opens at launch (demo mode, nothing was sent)" : "Trading opens at launch", { icon: "info", color: "#f2b84b" });
    };
    input.addEventListener("input", recalc);
    setQuick();
    const pumpLink = isDemo()
        ? h("span", { class: "btn sm", "aria-disabled": "true", title: "Demo coins aren't on pump.fun" }, "pump.fun", svg(UI.external))
        : h("a", { class: "btn sm", href: `https://pump.fun/coin/${coin.mint}`, target: "_blank", rel: "noopener" }, "pump.fun", svg(UI.external));
    const el = h("div", { class: "card tradepanel" }, h("div", { class: "bs", role: "tablist" }, buyBtn, sellBtn), h("div", { class: "field" }, h("label", { for: "trade-amount" }, h("span", null, "Amount"), worth), h("div", { class: "inp" }, input, unit), quick), h("div", { class: "field" }, h("label", null, h("span", null, "Slippage")), h("div", { class: "quick" }, slipBtns)), h("div", { class: "est" }, h("div", null, h("span", null, "You receive (est.)"), outEl), h("div", null, h("span", null, "Price impact"), impactEl), h("div", null, h("span", null, "Trading fee"), h("b", null, "pump.fun's")), coin.rewards && !isHouseToken ? h("div", null, h("span", null, "Holder rewards"), h("b", null, `${fmtFee(fees.holderRewardsPct)} in ${sym}`)) : null), submit, h("div", { class: "helper" }, h("span", null, `Trades settle in SOL on pump.fun.${isHouseToken ? "" : ` ${sym} pricing is shown on this site only.`}`), pumpLink), h("p", { class: "muted", style: "font-size:11.5px;text-align:center" }, "Trading is not live yet. This panel sends nothing."));
    const off = market().subscribeCoin(coin.mint, (c) => { priceUsd = c.priceUsd; recalc(); });
    onRemove(el, () => { off(); offQ(); });
    return el;
}
