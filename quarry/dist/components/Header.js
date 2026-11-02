import { brand, houseDisclaimer } from "../config/brand.js";
import { isDemo } from "../config/flags.js";
import { market } from "../data/index.js";
import { h, svg } from "../lib/dom.js";
import { storage } from "../lib/motion.js";
import { currentPath, href } from "../lib/router.js";
import { openPalette } from "./CommandPalette.js";
import { LOGO, UI } from "./Icons.js";
import { walletButton } from "./WalletButton.js";
const NAV = [
    { label: "Table", path: "/boards" },
    { label: "Launch", path: "/launch" },
    { label: "Method", path: "/docs" },
];
export function logoTile(cls = "logo-tile") {
    return h("span", { class: cls, html: LOGO });
}
function currentTheme() {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "light" || t === "dark")
        return t;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function themeToggle() {
    const btn = h("button", { class: "iconbtn theme-btn", "aria-label": "Switch light or dark", title: "Theme" });
    const paint = () => { btn.innerHTML = currentTheme() === "dark" ? UI.sun : UI.moon; };
    btn.onclick = () => {
        const next = currentTheme() === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        storage.set("quarry:theme", next);
        paint();
        document.dispatchEvent(new CustomEvent("pit:theme"));
    };
    paint();
    return btn;
}
export function header() {
    const links = NAV.map((n) => h("a", { href: href(n.path), dataset: { path: n.path } }, n.label));
    const live = h("span", { class: "live-dot", title: "Data connection" }, h("i"), "LIVE");
    const setLive = (s) => { live.className = `live-dot ${s}`; live.lastChild.textContent = s === "live" ? "LIVE" : s === "reconnecting" ? "RECONNECTING" : "OFFLINE"; };
    document.addEventListener("pit:connection", (e) => setLive(e.detail));
    setLive(market().connectionState());
    let drawer = null;
    const closeDrawer = () => { drawer?.remove(); drawer = null; menu.setAttribute("aria-expanded", "false"); };
    const menu = h("button", { class: "iconbtn menubtn", "aria-label": "Menu", "aria-expanded": "false", onclick: () => {
            if (drawer)
                return closeDrawer();
            const theme = h("button", { onclick: () => { themeToggle().click(); closeDrawer(); } }, "Light / dark", h("span", { class: "muted" }, currentTheme().toUpperCase()));
            drawer = h("nav", { class: "drawer", "aria-label": "Menu" }, h("a", { href: href("/"), onclick: closeDrawer }, "Home", svg(UI.arrow)), ...NAV.map((n) => h("a", { href: href(n.path), onclick: closeDrawer }, n.label, svg(UI.arrow))), brand.mainCoinMint ? h("a", { href: `https://pump.fun/coin/${brand.mainCoinMint}`, target: "_blank", rel: "noopener", onclick: closeDrawer }, `Buy $${brand.platformTicker}`, svg(UI.external)) : null, theme);
            document.body.appendChild(drawer);
            menu.setAttribute("aria-expanded", "true");
        } });
    menu.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
    window.addEventListener("hashchange", closeDrawer);
    const wb = walletButton();
    wb.classList.add("wallet-btn");
    const el = h("header", { class: "header" }, h("div", { class: "inner" }, h("a", { class: "logo", href: href("/"), "aria-label": `${brand.name} home` }, logoTile(), h("span", { class: "word" }, brand.name)), h("nav", { class: "nav", "aria-label": "Primary" }, links), h("div", { class: "spacer" }), isDemo() ? h("span", { class: "badge new", title: "Simulated coins and prices" }, "DEMO DATA") : null, live, h("button", { class: "searchbtn", onclick: openPalette, "aria-label": "Search (Ctrl+K)" }, svg(UI.search), h("span", { class: "label-long" }, "Search coin, ticker, CA"), h("kbd", null, "Ctrl K")), !brand.mainCoinMint ? null : h("a", { class: "btn sm main-coin", href: `https://pump.fun/coin/${brand.mainCoinMint}`, target: "_blank", rel: "noopener", title: `Buy $${brand.platformTicker} on pump.fun` }, h("i", { class: "dot" }), `$${(brand.platformTicker ?? "").toUpperCase()}`), themeToggle(), h("a", { class: "btn primary sm launch-btn", href: href("/launch") }, "Launch a coin"), wb, menu));
    const sync = () => {
        const p = currentPath();
        for (const a of links)
            a.classList.toggle("active", p.startsWith(a.dataset.path) || (a.dataset.path === "/boards" && p.startsWith("/board/")));
    };
    window.addEventListener("hashchange", sync);
    sync();
    return el;
}
/** Kept for compatibility with older imports; the new layout has no bottom nav. */
export function mobileNav() {
    return document.createComment("no mobile nav");
}
export function footer() {
    const year = new Date().getFullYear();
    return h("footer", { class: "footer" }, h("div", { class: "inner" }, h("div", null, h("div", { style: "display:flex;align-items:center;gap:12px" }, logoTile(), h("span", { class: "word" }, brand.name)), h("p", null, "An assay office for memecoins. Every coin launches on pump.fun and is priced here against a real-world element."), h("p", null, brand.riskLine), h("p", null, `House elements: ${houseDisclaimer}`)), h("div", { class: "col" }, h("span", { class: "label" }, "Index"), h("a", { href: href("/boards") }, "The table"), h("a", { href: href("/launch") }, "Submit a sample"), h("a", { href: href("/docs") }, "Method"), h("a", { href: href("/docs#faq") }, "FAQ")), h("div", { class: "col" }, h("span", { class: "label" }, "Elsewhere"), brand.mainCoinMint ? h("a", { href: `https://pump.fun/coin/${brand.mainCoinMint}`, target: "_blank", rel: "noopener" }, `$${brand.platformTicker} on pump.fun`) : null, brand.xHandle ? h("a", { href: `https://x.com/${brand.xHandle}`, target: "_blank", rel: "noopener" }, `X @${brand.xHandle}`) : null, brand.telegram ? h("a", { href: brand.telegram, target: "_blank", rel: "noopener" }, "Telegram") : null, h("a", { href: href("/docs#terms") }, "Terms")), h("div", { class: "base" }, h("span", null, `© ${year} ${brand.name} · ${brand.siteUrl.replace(/^https?:\/\//, "")}`), h("span", null, "Assayed live · Prices are informational"))));
}
