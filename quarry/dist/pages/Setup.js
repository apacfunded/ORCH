// /#/setup — one-time launchpad setup (admin wallet only). Creates the address lookup table that lets
// every launch (create + locked fee split + dev buy) fit in a single transaction.
import { connectedProvider, openWalletModal, wallet } from "../components/WalletButton.js";
import { toast } from "../components/Toasts.js";
import { flags } from "../config/flags.js";
import { h } from "../lib/dom.js";
import { shortAddr } from "../lib/format.js";
import { cosign, deserializeTx } from "../lib/solana.js";
async function call(init) {
    const r = await fetch(`${flags.apiUrl}/setup`, { ...init, headers: { "content-type": "application/json" } });
    const j = (await r.json().catch(() => ({})));
    if (!r.ok)
        throw new Error(j.error || `Request failed (${r.status})`);
    return j;
}
export async function setupPage() {
    const box = h("div", { class: "card", style: "max-width:640px;margin:24px auto;display:grid;gap:14px;padding:22px" });
    const render = async () => {
        let st;
        try {
            st = await call();
        }
        catch (e) {
            box.replaceChildren(h("h2", null, "Setup"), h("p", { class: "err" }, e.message));
            return;
        }
        const row = (k, v) => h("div", null, h("span", null, k), h("span", { class: "num" }, v ?? "not set"));
        const btn = h("button", { class: "btn primary block" }, st.lut ? "Done: launches are live" : "Create lookup table (~0.006 SOL)");
        if (st.lut || !st.buybackWallet || !st.holderWallet)
            btn.disabled = true;
        btn.onclick = async () => {
            if (!wallet.get().address) {
                openWalletModal();
                return;
            }
            const p = connectedProvider();
            if (!p?.signTransaction) {
                toast("This wallet cannot sign transactions.", { color: "#ff8a5c" });
                return;
            }
            btn.disabled = true;
            try {
                btn.textContent = "Building…";
                const res = await call({ method: "POST", body: JSON.stringify({ payer: wallet.get().address }) });
                btn.textContent = "Approve in wallet…";
                const txs = res.txs.map(deserializeTx);
                const signed = p.signAllTransactions ? await p.signAllTransactions(txs) : await Promise.all(txs.map((t) => p.signTransaction(t)));
                btn.textContent = "Sending…";
                await call({ method: "POST", body: JSON.stringify({ lut: res.lut, txs: signed.map((t) => cosign(t, [])) }) });
                toast("Setup complete. Launches are live.", { color: "#58d68d" });
                await render();
            }
            catch (e) {
                toast(e.message, { color: "#ff8a5c" });
                btn.disabled = false;
                btn.textContent = "Try again";
            }
        };
        box.replaceChildren(h("div", { class: "eyebrow" }, "Admin"), h("h2", null, st.ready ? "Launchpad is live" : "Finish launchpad setup"), h("div", { class: "kv" }, row("Buyback & burn wallet", st.buybackWallet), row("Holder rewards wallet", st.holderWallet), row("Split (creator / buyback / holders)", st.split.map((b) => `${b / 100}%`).join(" / ")), row("Admin wallet", st.admin), row("Lookup table", st.lut), row("Connected", wallet.get().address ? shortAddr(wallet.get().address) : null)), h("p", { class: "hint" }, "Connect the admin wallet and approve. This creates a public lookup table holding pump.fun's fixed addresses plus the two fee wallets, so each launch fits in one transaction. It only needs to run once."), btn);
    };
    await render();
    wallet.on(() => void render());
    return h("div", { class: "page" }, box);
}
