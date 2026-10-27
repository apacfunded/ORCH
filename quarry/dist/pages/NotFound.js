import { UI } from "../components/Icons.js";
import { h, svg } from "../lib/dom.js";
import { href } from "../lib/router.js";
export function notFoundPage(msg = "There's nothing in this pit.") {
    return h("div", { class: "page nf" }, h("div", { class: "tumble" }, svg(UI.coin)), h("div", { class: "tumble" }, svg(UI.coin)), h("div", null, h("h1", null, "404"), h("p", { style: "color:var(--text-2);margin-top:8px" }, msg), h("a", { class: "btn primary", href: href("/"), style: "margin-top:16px" }, svg(UI.home), "Back to the floor")));
}
