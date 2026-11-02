import { h } from "../lib/dom.js";
import { href } from "../lib/router.js";
export function notFoundPage(msg = "This page isn't on the table.") {
    return h("div", { class: "page" }, h("div", { class: "notfound" }, h("span", { class: "label" }, "Element 404 · not found"), h("div", { class: "sym" }, "Nf"), h("p", { class: "muted", style: "max-width:460px" }, msg), h("div", { style: "display:flex;gap:10px" }, h("a", { class: "btn primary", href: href("/") }, "Back to the front page"), h("a", { class: "btn", href: href("/boards") }, "Open the table"))));
}
