import { h, svg } from "../lib/dom.js";
import { UI } from "./Icons.js";
let root = null;
function ensureRoot() {
    if (!root) {
        root = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
        document.body.appendChild(root);
    }
    return root;
}
export function toast(text, opts = {}) {
    const r = ensureRoot();
    const el = h("div", { class: "toast", style: opts.color ? `--c:${opts.color}` : undefined }, svg(UI[opts.icon ?? "info"], "ico"), h("span", null, text));
    r.appendChild(el);
    while (r.children.length > 4)
        r.firstChild?.remove();
    window.setTimeout(() => {
        el.classList.add("out");
        window.setTimeout(() => el.remove(), 220);
    }, opts.ms ?? 3200);
}
/** Copy to clipboard with an icon morph on the button and a toast. */
export async function copyText(text, btn) {
    try {
        await navigator.clipboard.writeText(text);
    }
    catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
    }
    if (btn) {
        const prev = btn.innerHTML;
        btn.classList.add("copied");
        btn.innerHTML = UI.check;
        window.setTimeout(() => {
            btn.classList.remove("copied");
            btn.innerHTML = prev;
        }, 1400);
    }
    toast("Copied to clipboard", { icon: "check", color: "#58d68d", ms: 1600 });
}
