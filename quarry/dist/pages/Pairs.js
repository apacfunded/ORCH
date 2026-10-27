import { badge, tierBadge } from "../components/Badge.js";
import { UI, commodityIcon } from "../components/Icons.js";
import { houseDisclaimer, pairNote } from "../config/brand.js";
import { categoryLabel, commodities } from "../config/commodities.js";
import { market } from "../data/index.js";
import { h, onRemove, svg } from "../lib/dom.js";
import { fmtPct, fmtUsd, pctArrow } from "../lib/format.js";
import { href } from "../lib/router.js";
import { art, artImg } from "../config/art.js";
export async function pairsPage(ctx) {
    const coins = await market().listCoins({ limit: 400 });
    const offs = [];
    const groups = Object.keys(categoryLabel).map((cat) => {
        const rows = commodities.filter((c) => c.category === cat).map((c) => {
            const mine = coins.filter((x) => x.commodityId === c.id);
            const price = h("b", null, "—");
            const chg = h("span", null, "");
            if (c.status !== "soon") {
                const apply = (q) => { price.textContent = fmtUsd(q.priceUsd); chg.textContent = ` ${pctArrow(q.change24h)} ${fmtPct(q.change24h)}`; chg.className = q.change24h >= 0 ? "up" : "down"; };
                void market().getCommodityQuote(c.id).then(apply);
                offs.push(market().subscribeCommodityQuote(c.id, apply));
            }
            const row = h(c.status === "soon" ? "div" : "a", { class: "pairrow", href: c.status === "soon" ? undefined : href(`/board/${c.id}`), style: `--c:${c.color}` }, svg(commodityIcon(c.icon), "ico"), h("div", { class: "nm" }, c.name, h("small", null, c.symbol), tierBadge(c, { tooltip: false }), c.status === "locked" ? badge("locked") : c.status === "soon" ? badge("soon") : null), h("div", { class: "k" }, "Board price", h("b", null, price, chg)), h("div", { class: "k hide-sm" }, "Coins", h("b", null, String(mine.length))), h("div", { class: "k hide-sm" }, "Volume", h("b", null, fmtUsd(mine.reduce((s, x) => s + x.volume24hUsd, 0)))), h("div", { class: "note" }, c.tier === "backed"
                ? (c.issuer ? h("a", { href: c.issuer.url, target: "_blank", rel: "noopener", style: "color:var(--accent)" }, `Issued by ${c.issuer.name} `, svg(UI.external)) : h("span", { class: "muted" }, "Backed by a tokenized commodity. Issuer: CONFIG"))
                : h("span", null, h("b", { style: "color:var(--house)" }, "House · "), houseDisclaimer)));
            return row;
        });
        return h("div", { class: "section", style: "margin-top:28px" }, h("div", { class: "section-head" }, h("h2", { style: "font-size:18px" }, categoryLabel[cat])), h("div", { class: "pairs-table" }, rows));
    });
    const el = h("div", { class: "page" }, h("div", { class: "art-header art-header-tall" }, artImg(art.stillLife, "art-header-img"), h("div", { class: "art-header-shade", "aria-hidden": "true" }), h("div", { class: "art-header-copy" }, h("div", { class: "eyebrow" }, "Pairs"), h("h1", null, "Every commodity, two tiers"), h("p", null, pairNote))), h("div", { class: "twocol" }, h("div", { class: "explain" }, h("h3", null, badge("backed"), "Backed pairs"), h("div", { class: "art" }, vaultArt("#e6b84a")), h("p", null, "Priced against a real tokenized commodity that already exists on Solana (gold, silver). The launchpad doesn't issue it. This site reads that token's price and converts every coin on the board into it; the board page links to the issuer.")), h("div", { class: "explain" }, h("h3", null, badge("house", { tooltip: false }), "House pairs"), h("div", { class: "art" }, curveArt("#b9a2ff")), h("p", null, houseDisclaimer + " Each House token launches on pump.fun as a normal coin; when it graduates, its board unlocks and coins can be priced in it here. Low supply (around 1M–10M) keeps the unit price premium-looking, but it is still just a launchpad token."))), groups);
    onRemove(el, () => { offs.forEach((o) => o()); ctx.tint(null); });
    return el;
}
function vaultArt(color) {
    const el = h("div", { style: "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:10px" });
    for (let i = 0; i < 5; i++)
        el.appendChild(h("i", { style: `width:34px;height:22px;border-radius:4px;background:linear-gradient(135deg,${color},#8b6a1e);box-shadow:0 4px 10px rgba(0,0,0,.4);animation:bob 2.4s ease-in-out ${i * 0.15}s infinite` }));
    el.appendChild(h("span", { class: "svgwrap", style: `position:absolute;right:14px;color:${color};width:28px;height:28px`, html: UI.shield }));
    return el;
}
function curveArt(color) {
    const el = h("div", { style: "position:absolute;inset:0;display:flex;align-items:flex-end;padding:10px 14px;gap:4px" });
    for (let i = 0; i < 18; i++)
        el.appendChild(h("i", { style: `flex:1;height:${8 + Math.pow(i / 17, 2) * 60}px;background:${color};opacity:${0.25 + (i / 17) * 0.75};border-radius:2px 2px 0 0;animation:bob 2s ease-in-out ${i * 0.06}s infinite` }));
    el.appendChild(h("span", { class: "svgwrap", style: `position:absolute;right:14px;top:12px;color:${color};width:26px;height:26px`, html: UI.lock }));
    return el;
}
