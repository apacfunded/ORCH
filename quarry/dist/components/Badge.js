import { houseDisclaimer } from "../config/brand.js";
import { h, svg } from "../lib/dom.js";
import { UI } from "./Icons.js";
const LABEL = {
    backed: "BACKED",
    house: "HOUSE",
    locked: "LOCKED",
    soon: "SOON",
    graduated: "GRADUATED",
    curve: "CURVE",
    graduating: "GRADUATING",
    new: "NEW",
    rewards: "REWARDS",
};
export function badge(kind, opts = {}) {
    const el = h("span", { class: `badge ${kind}`, role: "status" });
    if (kind === "backed")
        el.appendChild(svg(UI.shield));
    if (kind === "locked")
        el.appendChild(svg(UI.lock));
    if (kind === "graduated")
        el.appendChild(svg(UI.grad));
    if (kind === "rewards")
        el.appendChild(svg(UI.gift));
    el.appendChild(document.createTextNode(LABEL[kind]));
    if (kind === "house" && opts.tooltip !== false) {
        el.classList.add("tip");
        el.tabIndex = 0;
        el.setAttribute("aria-label", `House pair. ${houseDisclaimer}`);
        el.appendChild(h("span", { class: "tipbox", role: "tooltip" }, houseDisclaimer));
    }
    return el;
}
export function tierBadge(c, opts = {}) {
    return badge(c.tier === "backed" ? "backed" : "house", opts);
}
export function statusBadge(status) {
    return badge(status);
}
