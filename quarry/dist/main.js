// ============================================================
// APP SHELL — background, header, ticker tape, hash router, footer, mobile nav.
// ============================================================
import { background } from "./components/Background.js";
import { installPaletteShortcut } from "./components/CommandPalette.js";
import { footer, header, mobileNav } from "./components/Header.js";
import { playIntro } from "./components/Intro.js";
import { tickerTape } from "./components/TickerTape.js";
import { toast } from "./components/Toasts.js";
import { brand } from "./config/brand.js";
import { isDemo } from "./config/flags.js";
import { market } from "./data/index.js";
import { clear, h } from "./lib/dom.js";
import { currentPath, matchRoute } from "./lib/router.js";
import { boardPage, boardsIndexPage } from "./pages/Board.js";
import { coinPage } from "./pages/Coin.js";
import { docsPage } from "./pages/Docs.js";
import { homePage } from "./pages/Home.js";
import { launchPage } from "./pages/Launch.js";
import { notFoundPage } from "./pages/NotFound.js";
import { pairsPage } from "./pages/Pairs.js";
const bg = background();
document.body.prepend(bg.el);
const ctx = { tint: (c) => bg.tint(c) };
const app = document.getElementById("app");
const main = h("main", { id: "main" });
app.append(header(), tickerTape(), main, footer(), mobileNav());
installPaletteShortcut();
market(); // start the data layer early so the first paint has numbers
const routes = [
    { path: "/", render: () => homePage(ctx) },
    { path: "/boards", render: () => boardsIndexPage(ctx) },
    { path: "/board/:id", render: (p) => boardPage(ctx, p) },
    { path: "/coin/:mint", render: (p) => coinPage(ctx, p) },
    { path: "/launch", render: () => launchPage(ctx) },
    { path: "/pairs", render: () => pairsPage(ctx) },
    { path: "/docs", render: () => Promise.resolve(docsPage()) },
];
let nav = 0;
async function render() {
    const id = ++nav;
    const path = currentPath();
    const m = matchRoute(routes, path);
    document.title = `${brand.name} · ${titleFor(path)}`;
    const skeleton = h("div", { class: "page", style: "display:grid;gap:14px" }, h("div", { class: "skel", style: "height:220px" }), h("div", { class: "skel", style: "height:160px" }));
    clear(main);
    main.appendChild(skeleton);
    try {
        const el = m ? await m.route.render(m.params) : notFoundPage();
        if (id !== nav)
            return; // a newer navigation won
        clear(main);
        main.appendChild(el);
        if (!path.includes("#"))
            window.scrollTo({ top: 0 });
        const anchor = location.hash.split("#")[2];
        if (anchor)
            document.getElementById(anchor)?.scrollIntoView();
    }
    catch (err) {
        console.error(err);
        clear(main);
        main.appendChild(notFoundPage("Something went wrong loading this page."));
    }
}
function titleFor(path) {
    if (path === "/")
        return brand.tagline;
    if (path.startsWith("/board"))
        return "Boards";
    if (path.startsWith("/coin"))
        return "Coin";
    if (path.startsWith("/launch"))
        return "Launch a coin";
    if (path.startsWith("/pairs"))
        return "Pairs";
    if (path.startsWith("/docs"))
        return "How it works";
    return "Not found";
}
window.addEventListener("hashchange", () => void render());
void playIntro().then(() => {
    void render();
    if (isDemo())
        window.setTimeout(() => toast("Demo mode: every coin and price on this site is simulated.", { icon: "info", color: "#f2b84b", ms: 5000 }), 1500);
});
