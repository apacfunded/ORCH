// Rolling odometer: each digit rolls independently; non-digits (., $, K, M) swap in place.
import { h } from "../lib/dom.js";
import { reducedMotion } from "../lib/motion.js";
export function odometer(initial, cls = "") {
    const el = h("span", { class: `odo num ${cls}`.trim(), "aria-live": "off" });
    let current = "";
    const build = (text) => {
        el.replaceChildren();
        for (const ch of text)
            el.appendChild(makeSlot(ch));
        current = text;
    };
    const makeSlot = (ch) => {
        const isDigit = /\d/.test(ch);
        const slot = h("span", { class: `d${isDigit ? "" : " c"}` });
        slot.dataset.ch = ch;
        if (isDigit) {
            const col = h("span", { class: "col" });
            for (let i = 0; i <= 9; i++)
                col.appendChild(h("span", null, String(i)));
            col.style.transform = `translateY(-${Number(ch) * 1.15}em)`;
            slot.appendChild(col);
            // widen punctuation-only slots
        }
        else {
            slot.textContent = ch;
            slot.style.width = ch === "." || ch === "," ? ".3em" : ch === " " ? ".3em" : "auto";
            slot.style.padding = "0 .02em";
        }
        return slot;
    };
    const set = (text, dir = null) => {
        el.setAttribute("aria-label", text);
        if (text === current)
            return;
        if (reducedMotion() || text.length !== current.length) {
            build(text);
        }
        else {
            const slots = el.children;
            for (let i = 0; i < text.length; i++) {
                const slot = slots[i];
                const ch = text[i];
                if (slot.dataset.ch === ch)
                    continue;
                const wasDigit = /\d/.test(slot.dataset.ch ?? "");
                const isDigit = /\d/.test(ch);
                if (wasDigit && isDigit) {
                    slot.firstChild.style.transform = `translateY(-${Number(ch) * 1.15}em)`;
                    slot.dataset.ch = ch;
                }
                else {
                    el.replaceChild(makeSlot(ch), slot);
                }
            }
            current = text;
        }
        if (dir) {
            el.classList.remove("flash-up", "flash-down");
            void el.offsetWidth;
            el.classList.add(dir === "up" ? "flash-up" : "flash-down");
            window.setTimeout(() => el.classList.remove("flash-up", "flash-down"), 500);
        }
    };
    build(initial);
    el.setAttribute("aria-label", initial);
    return { el, set };
}
