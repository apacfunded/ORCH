import { brand } from "../config/brand.js";
import { isDemo } from "../config/flags.js";
import { market } from "../data/index.js";
import { h, svg } from "../lib/dom.js";
import { storage } from "../lib/motion.js";
import { currentPath, href } from "../lib/router.js";
import { openPalette } from "./CommandPalette.js";
import { LOGO, UI } from "./Icons.js";
import { walletButton } from "./WalletButton.js";
const NAV = [
    { label: "Boards", path: "/boards" },
    { label: "Launch", path: "/launch" },
    { label: "Pairs", path: "/pairs" },
    { label: "How it works", path: "/docs" },
];
function themeToggle() {
    const btn = h("button", { class: "iconbtn", "aria-label": "Toggle light or dark theme", title: "Theme" });
    const apply = (t) => {
        document.documentElement.setAttribute("data-theme", t);
        btn.innerHTML = t === "light" ? UI.moon : UI.sun;
    };
    apply(storage.get("pit:theme") ?? "dark");
    btn.onclick = () => {
        const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
        storage.set("pit:theme", next);
        apply(next);
    };
    return btn;
}
export function header() {
    const links = NAV.map((n) => h("a", { href: href(n.path), dataset: { path: n.path } }, n.label));
    const live = h("span", { class: "live-dot" }, h("i"), "LIVE");
    const setLive = (s) => { live.className = `live-dot ${s}`; live.lastChild.textContent = s === "live" ? "LIVE" : s === "reconnecting" ? "RECONNECTING" : "OFFLINE"; };
    document.addEventListener("pit:connection", (e) => setLive(e.detail));
    setLive(market().connectionState());
    const el = h("header", { class: "header" }, h("div", { class: "inner" }, h("a", { class: "logo", href: href("/"), "aria-label": `${brand.name} home` }, brand.logo ? h("img", { src: brand.logo, alt: "", style: "width:32px;height:32px;border-radius:9px;object-fit:cover", onerror: (e) => { const i = e.target; i.replaceWith(h("span", { class: "logo-mark", html: LOGO })); } }) : h("span", { class: "logo-mark", html: LOGO }), h("span", null, brand.name)), h("nav", { class: "nav", "aria-label": "Primary" }, links), h("div", { class: "spacer" }), isDemo() ? h("span", { class: "demo-pill", title: "Simulated coins and prices. Nothing on this page is real yet." }, "DEMO DATA") : null, live, !brand.mainCoinMint ? null : h("a", { class: "btn sm main-coin", href: `https://pump.fun/coin/${brand.mainCoinMint}`, target: "_blank", rel: "noopener", title: `Buy $${brand.platformTicker} on pump.fun` }, `$${(brand.platformTicker ?? "").toUpperCase()}`), h("button", { class: "searchbtn", onclick: openPalette, "aria-label": "Search (Ctrl+K)" }, svg(UI.search), h("span", { class: "label-long" }, "Search name, ticker, CA"), h("span", { class: "label-short" }, "Search"), h("kbd", null, "Ctrl K")), themeToggle(), h("a", { class: "btn primary sm", href: href("/launch") }, svg(UI.plus), "Launch a coin"), walletButton()));
    const sync = () => {
        const p = currentPath();
        for (const a of links)
            a.classList.toggle("active", p.startsWith(a.dataset.path) || (a.dataset.path === "/boards" && p.startsWith("/board/")));
    };
    window.addEventListener("hashchange", sync);
    sync();
    window.addEventListener("scroll", () => el.classList.toggle("shrunk", window.scrollY > 40), { passive: true });
    return el;
}
export function mobileNav() {
    const items = [
        { label: "Home", path: "/", icon: UI.home },
        { label: "Boards", path: "/boards", icon: UI.grid },
        { label: "Launch", path: "/launch", icon: UI.plus },
    ];
    const links = items.map((i) => h("a", { href: href(i.path), dataset: { path: i.path }, "aria-label": i.label }, svg(i.icon), i.label));
    const el = h("nav", { class: "mobilenav", "aria-label": "Mobile" }, ...links, h("button", { onclick: openPalette, "aria-label": "Search" }, svg(UI.search), "Search"), h("button", { onclick: () => (document.querySelector(".header .btn.sm:last-child") ?? document.body).click(), "aria-label": "Wallet" }, svg(UI.wallet), "Wallet"));
    const sync = () => {
        const p = currentPath();
        for (const a of links)
            a.classList.toggle("active", a.dataset.path === "/" ? p === "/" : p.startsWith(a.dataset.path) || (a.dataset.path === "/boards" && p.startsWith("/board/")));
    };
    window.addEventListener("hashchange", sync);
    sync();
    return el;
}
export function footer() {
    return h("footer", { class: "footer" }, h("div", { class: "inner" }, h("div", null, h("div", { style: "font-weight:600;color:var(--text)" }, brand.name), h("p", { class: "risk", style: "margin-top:8px" }, brand.riskLine), h("p", { class: "risk", style: "margin-top:6px" }, "House tokens are issued by the launchpad, are not backed by physical reserves and do not track real commodity prices.")), h("div", { class: "links" }, h("a", { href: href("/boards") }, "Boards"), h("a", { href: href("/pairs") }, "Pairs"), h("a", { href: href("/docs") }, "Docs"), brand.xHandle ? h("a", { href: `https://x.com/${brand.xHandle}`, target: "_blank", rel: "noopener" }, "X") : null, brand.telegram ? h("a", { href: brand.telegram, target: "_blank", rel: "noopener" }, "Telegram") : null, h("a", { href: href("/docs#terms") }, "Terms"))));
}
