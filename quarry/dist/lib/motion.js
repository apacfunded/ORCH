/** Motion preferences, shared by every animated component. */
const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
export const reducedMotion = () => mq.matches;
export const isMobile = () => window.innerWidth < 768;
/** Try/catch localStorage so private mode never throws. */
export const storage = {
    get(key) {
        try {
            return localStorage.getItem(key);
        }
        catch {
            return null;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, value);
        }
        catch { /* ignore */ }
    },
};
/** Flash an element green/red for a moment (used for price changes). */
export function flash(el, dir) {
    if (reducedMotion())
        return;
    el.classList.remove("flash-up", "flash-down");
    void el.offsetWidth; // restart animation
    el.classList.add(dir === "up" ? "flash-up" : "flash-down");
    window.setTimeout(() => el.classList.remove("flash-up", "flash-down"), 450);
}
