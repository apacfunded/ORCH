// ============================================================
// WALLET — connects to injected Solana wallets (Phantom, Solflare, Backpack)
// through their standard `connect()` API. No packages needed. Shows a
// truncated address and the SOL balance. Signing happens only in the launch
// flow, and the wallet always asks the user to approve it.
// ============================================================
import { flags } from "../config/flags.js";
import { h, svg } from "../lib/dom.js";
import { shortAddr } from "../lib/format.js";
import { storage } from "../lib/motion.js";
import { UI } from "./Icons.js";
import { toast } from "./Toasts.js";
const state = { address: null, balanceSol: null, name: null };
const listeners = new Set();
export const wallet = {
    get: () => state,
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
const emit = () => listeners.forEach((l) => l(state));
function providers() {
    const win = window;
    const out = [];
    const ph = win.phantom?.solana ?? (win.solana?.isPhantom ? win.solana : undefined);
    if (ph)
        out.push({ name: "Phantom", w: ph });
    if (win.solflare)
        out.push({ name: "Solflare", w: win.solflare });
    if (win.backpack)
        out.push({ name: "Backpack", w: win.backpack });
    if (!out.length && win.solana)
        out.push({ name: "Wallet", w: win.solana });
    return out;
}
async function fetchBalance(address) {
    try {
        const res = await fetch(`${flags.apiUrl}/balance?address=${encodeURIComponent(address)}`);
        const j = (await res.json());
        return typeof j.sol === "number" ? j.sol : null;
    }
    catch {
        return null;
    }
}
/** The connected wallet's injected provider (for signing). */
export function connectedProvider() {
    return providers().find((x) => x.name === state.name)?.w ?? null;
}
export async function refreshBalance() {
    if (!state.address)
        return;
    state.balanceSol = await fetchBalance(state.address);
    emit();
}
async function connectWith(name, w) {
    const r = await w.connect();
    const pk = (r && "publicKey" in r && r.publicKey) ? r.publicKey.toString() : w.publicKey?.toString();
    if (!pk)
        throw new Error("no public key");
    state.address = pk;
    state.name = name;
    state.balanceSol = null;
    emit();
    storage.set("pit:wallet", name);
    toast(`Connected ${name} · ${shortAddr(pk)}`, { icon: "wallet", color: "#58d68d" });
    state.balanceSol = await fetchBalance(pk);
    emit();
}
export async function disconnectWallet() {
    const p = providers().find((x) => x.name === state.name);
    try {
        await p?.w.disconnect?.();
    }
    catch { /* ignore */ }
    state.address = null;
    state.balanceSol = null;
    state.name = null;
    storage.set("pit:wallet", "");
    emit();
    toast("Wallet disconnected", { icon: "wallet" });
}
export function openWalletModal() {
    const list = providers();
    const overlay = h("div", { class: "overlay", role: "dialog", "aria-modal": "true", "aria-label": "Connect a wallet" });
    const close = () => overlay.remove();
    const modal = h("div", { class: "modal" }, h("div", { style: "display:flex;justify-content:space-between;align-items:center" }, h("h3", null, "Connect a wallet"), h("button", { class: "iconbtn", "aria-label": "Close", onclick: close }, svg(UI.x))), h("div", { class: "wallets" }, list.length
        ? list.map((p) => h("button", { onclick: async () => { try {
                await connectWith(p.name, p.w);
                close();
            }
            catch {
                toast("Connection was cancelled", { color: "#ff8a5c" });
            } } }, p.name, h("small", null, "detected")))
        : [
            h("p", { class: "muted", style: "font-size:13.5px" }, "No Solana wallet extension was found. Install Phantom, Solflare or Backpack, then try again."),
            h("a", { class: "btn", href: "https://phantom.app", target: "_blank", rel: "noopener" }, "Get Phantom"),
        ]), h("p", { class: "muted", style: "font-size:12px" }, "Connecting only reads your address and SOL balance. Every transaction asks for your approval in the wallet."));
    overlay.appendChild(modal);
    overlay.addEventListener("click", (e) => { if (e.target === overlay)
        close(); });
    document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", esc);
    } });
    document.body.appendChild(overlay);
    modal.querySelector("button")?.focus();
}
export function walletButton() {
    const btn = h("button", { class: "btn sm", "aria-label": "Connect wallet" });
    const render = (s) => {
        btn.replaceChildren(svg(UI.wallet));
        if (s.address) {
            btn.appendChild(h("span", { class: "num" }, shortAddr(s.address)));
            if (s.balanceSol !== null)
                btn.appendChild(h("span", { class: "num muted" }, `${s.balanceSol.toFixed(2)} SOL`));
            btn.onclick = () => { void disconnectWallet(); };
            btn.title = "Disconnect";
        }
        else {
            btn.appendChild(h("span", null, "Connect wallet"));
            btn.onclick = openWalletModal;
        }
    };
    render(state);
    wallet.on(render);
    // auto-reconnect a trusted wallet
    const saved = storage.get("pit:wallet");
    if (saved) {
        const p = providers().find((x) => x.name === saved);
        if (p)
            p.w.connect({ onlyIfTrusted: true }).then((r) => {
                const pk = (r && "publicKey" in r && r.publicKey) ? r.publicKey.toString() : p.w.publicKey?.toString();
                if (pk) {
                    state.address = pk;
                    state.name = p.name;
                    emit();
                    void fetchBalance(pk).then((b) => { state.balanceSol = b; emit(); });
                }
            }).catch(() => { });
    }
    return btn;
}
