export function h(tag, props = null, ...children) {
    const el = document.createElement(tag);
    if (props) {
        for (const [k, v] of Object.entries(props)) {
            if (v === null || v === undefined || v === false)
                continue;
            if (k === "class")
                el.className = String(v);
            else if (k === "style" && typeof v === "object")
                Object.assign(el.style, v);
            else if (k === "style")
                el.setAttribute("style", String(v));
            else if (k.startsWith("on") && typeof v === "function")
                el.addEventListener(k.slice(2).toLowerCase(), v);
            else if (k === "html")
                el.innerHTML = String(v);
            else if (k === "dataset" && typeof v === "object")
                Object.assign(el.dataset, v);
            else if (v === true)
                el.setAttribute(k, "");
            else
                el.setAttribute(k, String(v));
        }
    }
    append(el, children);
    return el;
}
export function append(el, children) {
    for (const c of children) {
        if (c === null || c === undefined || c === false)
            continue;
        if (Array.isArray(c))
            append(el, c);
        else if (c instanceof Node)
            el.appendChild(c);
        else
            el.appendChild(document.createTextNode(String(c)));
    }
}
export function svg(markup, cls = "") {
    const span = document.createElement("span");
    span.className = `svgwrap ${cls}`.trim();
    span.innerHTML = markup;
    return span;
}
export function clear(el) {
    while (el.firstChild)
        el.removeChild(el.firstChild);
}
export function qs(sel, root = document) {
    const el = root.querySelector(sel);
    if (!el)
        throw new Error(`missing ${sel}`);
    return el;
}
/** Run `fn` when `el` is removed from the document (for subscriptions). */
export function onRemove(el, fn) {
    const mo = new MutationObserver(() => {
        if (!document.contains(el)) {
            mo.disconnect();
            fn();
        }
    });
    queueMicrotask(() => mo.observe(document.body, { childList: true, subtree: true }));
}
/** Pause a callback while the element is off-screen or the tab is hidden. */
export function whenVisible(el, onChange) {
    let inView = false;
    const io = new IntersectionObserver((entries) => {
        inView = entries[0]?.isIntersecting ?? false;
        onChange(inView && document.visibilityState === "visible");
    }, { rootMargin: "80px" });
    io.observe(el);
    const vis = () => onChange(inView && document.visibilityState === "visible");
    document.addEventListener("visibilitychange", vis);
    return () => {
        io.disconnect();
        document.removeEventListener("visibilitychange", vis);
    };
}
