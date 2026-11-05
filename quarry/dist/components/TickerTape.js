// Thin mono price strip under the header: main coin pinned left, every element scrolling.
import { brand } from "../config/brand.js";
import { elements } from "../config/elements.js";
import { market } from "../data/index.js";
import { heroSource } from "../data/heroFeed.js";
import { h, onRemove } from "../lib/dom.js";
import { fmtPct, fmtUsd, pctArrow } from "../lib/format.js";
import { href } from "../lib/router.js";
export function tickerTape() {
    const offs = [];
    const make = () => elements().map(({ c, sym }) => {
        const price = h("span", { class: "p" }, "—");
        const chg = h("span", null, "");
        const item = h("a", { class: "item", href: href(`/board/${c.id}`), style: `--c:${c.color}`, title: `${c.name}${c.tier === "house" ? " (House element)" : ""}` }, h("i"), h("span", { class: "sym" }, sym), h("span", null, c.symbol), price, chg, c.tier === "house" ? h("span", { class: "h" }, "H") : null);
        const apply = (q) => {
            price.textContent = fmtUsd(q.priceUsd);
            chg.textContent = `${pctArrow(q.change24h)}${fmtPct(q.change24h)}`;
            chg.className = q.change24h >= 0 ? "up" : "down";
        };
        void market().getCommodityQuote(c.id).then(apply).catch(() => { });
        offs.push(market().subscribeCommodityQuote(c.id, apply));
        return item;
    });
    const track = h("div", { class: "track", style: `animation-duration:${Math.max(90, elements().length * 4)}s` }, make(), make());
    const mainPrice = h("b", null, "—");
    const mainChg = h("span", null, "");
    const fixed = brand.mainCoinMint
        ? h("a", { class: "fixed", href: `https://pump.fun/coin/${brand.mainCoinMint}`, target: "_blank", rel: "noopener", title: `$${brand.platformTicker} on pump.fun` }, h("span", { class: "muted" }, `$${brand.platformTicker}`), mainPrice, mainChg)
        : null;
    if (fixed) {
        const feed = heroSource();
        let timer = 0;
        const show = (q) => {
            if (!q)
                return;
            mainPrice.textContent = `${fmtUsd(q.value)} MC`;
            if (q.change24h !== null && q.change24h !== undefined) {
                mainChg.textContent = `${pctArrow(q.change24h)}${fmtPct(q.change24h)}`;
                mainChg.className = q.change24h >= 0 ? "up" : "down";
            }
        };
        const tick = async () => { show(await feed.poll().catch(() => null)); timer = window.setTimeout(tick, Math.max(15000, feed.intervalMs)); };
        void feed.initial().then((r) => { if (r)
            show(r.quote); timer = window.setTimeout(tick, Math.max(15000, feed.intervalMs)); }).catch(() => { });
        offs.push(() => window.clearTimeout(timer));
    }
    const el = h("div", { class: "tape", "aria-label": "Element prices" }, fixed, h("div", { class: "viewport" }, track));
    onRemove(el, () => offs.forEach((o) => o()));
    return el;
}
