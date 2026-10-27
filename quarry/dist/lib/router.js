export function currentPath() {
    const h = location.hash.replace(/^#/, "");
    return h.startsWith("/") ? h : "/" + h;
}
export function navigate(path) {
    location.hash = path;
}
export function href(path) {
    return "#" + path;
}
export function matchRoute(routes, path) {
    const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
    for (const r of routes) {
        const rp = r.path.split("/");
        const pp = clean.split("/");
        if (rp.length !== pp.length)
            continue;
        const params = {};
        let ok = true;
        for (let i = 0; i < rp.length; i++) {
            if (rp[i].startsWith(":"))
                params[rp[i].slice(1)] = decodeURIComponent(pp[i]);
            else if (rp[i] !== pp[i]) {
                ok = false;
                break;
            }
        }
        if (ok)
            return { route: r, params };
    }
    return null;
}
export function query() {
    const q = location.hash.split("?")[1] ?? "";
    return new URLSearchParams(q);
}
