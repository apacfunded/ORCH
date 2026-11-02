// ============================================================
// APP SHELL — header, price strip, hash router, footer.
// ============================================================
import { installPaletteShortcut } from "./components/CommandPalette.js";
import { footer, header } from "./components/Header.js";
import { tickerTape } from "./components/TickerTape.js";
import { toast } from "./components/Toasts.js";
import { brand } from "./config/brand.js";
import { isDemo } from "./config/flags.js";
import { market } from "./data/index.js";
import { clear, h } from "./lib/dom.js";
import { currentPath, matchRoute, navigate } from "./lib/router.js";
import { boardPage, boardsIndexPage } from "./pages/Board.js";
import { coinPage } from "./pages/Coin.js";
import { docsPage } from "./pages/Docs.js";
import { homePage } from "./pages/Home.js";
import { launchPage } from "./pages/Launch.js";
import { notFoundPage } from "./pages/NotFound.js";
import { setupPage } from "./pages/Setup.js";
const ctx = { tint: () => { } };
const app = document.getElementById("app");
const main = h("main", { id: "main" });
app.append(header(), tickerTape(), main, footer());
installPaletteShortcut();
market(); // start the data layer early so the first paint has numbers
const routes = [
    { path: "/", render: () => homePage(ctx) },
    { path: "/boards", render: () => boardsIndexPage(ctx) },
    { path: "/board/:id", render: (p) => boardPage(ctx, p) },
    { path: "/coin/:mint", render: (p) => coinPage(ctx, p) },
    { path: "/launch", render: () => launchPage(ctx) },
    { path: "/pairs", render: () => { navigate("/boards"); return Promise.resolve(h("div")); } },
    { path: "/docs", render: () => Promise.resolve(docsPage()) },
    { path: "/setup", render: () => setupPage() },
];
let nav = 0;
async function render() {
    const id = ++nav;
    const path = currentPath();
    const m = matchRoute(routes, path.split("#")[0]);
    document.title = `${titleFor(path)} · ${brand.name}`;
    const skeleton = h("div", { class: "page", style: "display:grid;gap:16px" }, h("div", { class: "skel", style: "height:56px;max-width:420px" }), h("div", { class: "skel", style: "height:280px" }), h("div", { class: "skel", style: "height:160px" }));
    clear(main);
    main.appendChild(skeleton);
    try {
        const el = m ? await m.route.render(m.params) : notFoundPage();
        if (id !== nav)
            return; // a newer navigation won
        clear(main);
        main.appendChild(el);
        const anchor = location.hash.split("#")[2];
        if (anchor)
            requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView());
        else
            window.scrollTo({ top: 0 });
    }
    catch (err) {
        console.error(err);
        clear(main);
        main.appendChild(notFoundPage("Something went wrong loading this page. Try again in a moment."));
    }
}
function titleFor(path) {
    if (path === "/")
        return brand.tagline;
    if (path.startsWith("/boards"))
        return "The table";
    if (path.startsWith("/board"))
        return "Element";
    if (path.startsWith("/coin"))
        return "Certificate";
    if (path.startsWith("/launch"))
        return "Launch a coin";
    if (path.startsWith("/docs"))
        return "Method";
    if (path.startsWith("/setup"))
        return "Setup";
    return "Not found";
}
window.addEventListener("hashchange", () => void render());
void render();
if (isDemo())
    window.setTimeout(() => toast("Demo data: coins and prices are simulated.", { icon: "info", ms: 5000 }), 1500);
