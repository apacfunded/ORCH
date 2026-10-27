// First-visit intro: commodity icons drop like ingots onto the floor, the logo stamps in, then it slides away.
import { brand } from "../config/brand.js";
import { boardCommodities } from "../config/commodities.js";
import { h } from "../lib/dom.js";
import { reducedMotion, storage } from "../lib/motion.js";
import { LOGO, commodityIcon } from "./Icons.js";
export function playIntro() {
    if (reducedMotion() || storage.get("pit:intro") === "seen")
        return Promise.resolve();
    return new Promise((resolve) => {
        const ingots = boardCommodities().slice(0, 6).map((c, i) => {
            const s = h("span", { style: `color:${c.color};animation-delay:${0.08 * i}s` });
            s.innerHTML = commodityIcon(c.icon);
            return s;
        });
        const el = h("div", { class: "intro", role: "dialog", "aria-label": "Intro" }, h("div", { class: "floor" }), h("div", { class: "ingots" }, ingots), h("div", { class: "stamp" }, h("span", { class: "stamp-mark", html: LOGO }), brand.name.slice(0, 1), h("i", null, brand.name.slice(1))), h("div", { class: "skip" }, "CLICK OR PRESS ANY KEY TO SKIP"));
        let done = false;
        const finish = () => {
            if (done)
                return;
            done = true;
            storage.set("pit:intro", "seen");
            el.classList.add("out");
            window.setTimeout(() => { el.remove(); resolve(); }, 480);
            document.removeEventListener("keydown", finish);
        };
        el.addEventListener("click", finish);
        document.addEventListener("keydown", finish);
        document.body.appendChild(el);
        window.setTimeout(finish, 2200);
    });
}
