import { certCard } from "../components/Certificate.js";
import { filterTable, periodicTable } from "../components/Element.js";
import { UI } from "../components/Icons.js";
import { toast } from "../components/Toasts.js";
import { connectedProvider, openWalletModal, refreshBalance, wallet } from "../components/WalletButton.js";
import { brand, houseDisclaimer, pairNote } from "../config/brand.js";
import { fees } from "../config/fees.js";
import { byId } from "../config/commodities.js";
import { elNum, elementOf } from "../config/elements.js";
import { flags, isDemo } from "../config/flags.js";
import { cosign, deserializeTx, newMintKeypair } from "../lib/solana.js";
import { market, mockMarket } from "../data/index.js";
import { h, onRemove, svg } from "../lib/dom.js";
import { shortAddr } from "../lib/format.js";
import { reducedMotion } from "../lib/motion.js";
import { href, query } from "../lib/router.js";
import { sealSvg } from "./Coin.js";
async function api(path, init) {
    const r = await fetch(`${flags.apiUrl}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
    const j = (await r.json().catch(() => ({})));
    if (!r.ok && r.status !== 202)
        throw new Error(j.error || `Request failed (${r.status})`);
    return j;
}
async function shrinkImage(dataUrl) {
    if (dataUrl.length < 1400000 || dataUrl.startsWith("data:image/gif"))
        return dataUrl;
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.9);
}
async function launchCoin(d, phase) {
    const m = mockMarket();
    if (m)
        return m.demoLaunch({ name: d.name, ticker: d.ticker, commodityId: d.commodityId, image: d.image || undefined, description: d.description || undefined });
    const creator = wallet.get().address;
    const provider = connectedProvider();
    if (!creator || !provider?.signTransaction)
        throw new Error("Connect a wallet that can sign transactions (Phantom, Solflare or Backpack).");
    if (!d.image)
        throw new Error("Add an image for your coin first (step 1).");
    phase("UPLOADING…");
    const up = await api("/upload", { method: "POST", body: JSON.stringify({ name: d.name.trim(), symbol: d.ticker, description: d.description, image: await shrinkImage(d.image), twitter: d.x, telegram: d.telegram, website: d.website, board: d.commodityId }) });
    phase("BUILDING…");
    const mintKp = newMintKeypair();
    const mint = mintKp.publicKey.toBase58();
    const built = await api("/build", { method: "POST", body: JSON.stringify({ creator, mint, metaId: up.id, devBuySol: Number(d.devBuy) || 0 }) });
    phase("APPROVE IN WALLET…");
    let signed;
    try {
        signed = await provider.signTransaction(deserializeTx(built.tx));
    }
    catch {
        throw new Error("You cancelled in your wallet. Nothing was sent.");
    }
    const tx = cosign(signed, [mintKp]);
    phase("SENDING IT…");
    let res = await api("/submit", { method: "POST", body: JSON.stringify({ tx }) });
    for (let i = 0; res.pending && i < 20; i++) {
        phase("CONFIRMING…");
        await new Promise((r) => setTimeout(r, 4000));
        const prev = res;
        res = await api("/submit", { method: "POST", body: JSON.stringify({ mint, signature: prev.signature }) }).catch(() => prev);
    }
    if (!res.coin)
        throw new Error(`Your coin was sent (${mint.slice(0, 6)}…) but is still confirming. It will show on its board in a minute.`);
    void refreshBalance();
    const live = await market().refresh?.(mint);
    return live ?? {
        mint, pairAddress: mint, name: res.coin.name, ticker: res.coin.symbol, image: res.coin.image, commodityId: res.coin.board,
        status: "curve", bondingProgress: 0, priceUsd: 0, priceQuote: 0, marketCapUsd: 0, volume24hUsd: 0, change24hPct: 0, holders: 1,
        createdAt: res.coin.createdAt, rewards: true, spark: [1, 1],
    };
}
const mainCoin = () => (brand.platformTicker ? `$${brand.platformTicker}` : `$${brand.name.toUpperCase()}`);
const PHASE = { "UPLOADING…": "Uploading…", "BUILDING…": "Building…", "APPROVE IN WALLET…": "Approve in wallet…", "SENDING IT…": "Sending…", "CONFIRMING…": "Confirming…" };
export async function launchPage() {
    const preset = query().get("board");
    const d = { name: "", ticker: "", description: "", image: "", x: "", website: "", telegram: "", commodityId: preset && byId(preset) ? preset : null, devBuy: "", rewards: false };
    let step = 0;
    const LABELS = ["Sample", "Element", "Weigh-in", "Certify"];
    const stepper = h("div", { class: "stepper", "aria-label": "Progress" }, LABELS.map((l, i) => h("div", null, h("b", null, `0${i + 1}`), h("span", null, l))));
    const stage = h("div", { class: "wstep" });
    const previewHost = h("div");
    const sealHost = h("div", { class: "seal pending", style: "width:96px;height:96px;justify-self:end;margin-top:4px;position:relative", html: sealSvg("PENDING ASSAY", "--/--/--") });
    const previewCol = h("div", { class: "previewcol" }, h("span", { class: "label" }, "Live certificate"), previewHost, sealHost);
    const head = h("div", { class: "launch-head" }, h("div", null, h("span", { class: "label" }, "Submit a sample"), h("h1", { style: "margin-top:8px" }, "Launch a coin."), h("p", null, "Name it, pick an element, launch it on pump.fun. It gets a certificate here and a live price in its element.")), h("div", { class: "launch-art" }, brand.tileArt ? h("img", { src: brand.tileArt, alt: "" }) : null, h("div", { class: "label", style: "text-align:right" }, "Launches on pump.fun", h("br"), `Creator fees ${fees.creatorSharePct}/${fees.buybackBurnPct}/${fees.mainHolderSolPct}, locked`)));
    const el = h("div", { class: "page" }, head, stepper, h("div", { class: "wizard" }, stage, previewCol));
    const renderPreview = () => {
        const com = d.commodityId ? byId(d.commodityId) : null;
        const fake = {
            mint: "PREVIEW", pairAddress: "PREVIEW", name: d.name || "Your coin", ticker: (d.ticker || "TICKER").toUpperCase(),
            image: d.image || placeholderImage(), commodityId: com?.id ?? "", status: "curve", bondingProgress: 0,
            priceUsd: 0.0000042, priceQuote: 0, marketCapUsd: 4200, volume24hUsd: 0, change24hPct: 0, holders: 1, createdAt: Date.now(), rewards: true, spark: [1, 1],
        };
        previewHost.replaceChildren(certCard(fake, { preview: true }));
    };
    const renderStepper = () => stepper.querySelectorAll(":scope > div").forEach((s, i) => { s.className = i < step ? "done" : i === step ? "cur" : ""; s.setAttribute("aria-current", i === step ? "step" : "false"); });
    const go = (n) => {
        step = n;
        renderStepper();
        stage.replaceChildren(STEPS[n]());
        if (!reducedMotion())
            stage.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 160, easing: "ease-out" });
        window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });
    };
    const field = (label, input, hint) => h("div", { class: "field" }, h("label", { for: input.id }, h("span", null, label), hint ? h("span", { class: "muted" }, hint) : null), input);
    const txt = (id, key, placeholder, max) => {
        const i = h("input", { type: "text", id, placeholder, maxlength: max ? String(max) : undefined, value: String(d[key] ?? ""), autocomplete: "off" });
        i.addEventListener("input", () => { d[key] = key === "ticker" ? i.value.toUpperCase().replace(/[^A-Z0-9]/g, "") : i.value; if (key === "ticker")
            i.value = String(d.ticker); renderPreview(); });
        return i;
    };
    const nav = (back, nextLabel, onNext) => h("div", { class: "wnav" }, back === null ? h("span") : h("button", { class: "btn", onclick: () => go(back) }, svg(UI.back), "Back"), onNext ? h("button", { class: "btn primary", onclick: onNext }, nextLabel, svg(UI.arrow)) : h("span"));
    const STEPS = [
        // 01 — sample
        () => {
            const name = txt("f-name", "name", "e.g. Golden Walrus", 32);
            const ticker = txt("f-ticker", "ticker", "WALRUS", 10);
            const desc = h("textarea", { id: "f-desc", placeholder: "What is this coin? One or two lines.", maxlength: "280" });
            desc.value = d.description;
            desc.addEventListener("input", () => { d.description = desc.value; });
            const img = h("img", { alt: "", src: d.image || undefined, style: d.image ? "" : "display:none" });
            const ph = h("span", { class: "ph" }, img, d.image ? null : svg(UI.plus));
            const file = h("input", { type: "file", accept: "image/*", id: "f-img" });
            file.addEventListener("change", () => { const f = file.files?.[0]; if (!f)
                return; const r = new FileReader(); r.onload = () => { d.image = String(r.result); img.src = d.image; img.style.display = ""; ph.querySelector(".svgwrap")?.remove(); renderPreview(); }; r.readAsDataURL(f); });
            const err = h("div", { class: "err", role: "alert" });
            return h("div", null, h("h2", null, "The sample"), h("p", { class: "hint" }, "Name, ticker and image are required. Socials are optional."), h("div", { class: "fields" }, h("div", { class: "twocol" }, field("Name", name), field("Ticker", ticker, "A–Z, 0–9")), h("div", { class: "field" }, h("label", { for: "f-img" }, h("span", null, "Image"), h("span", { class: "muted" }, "PNG, JPG or GIF")), h("label", { class: "upload", for: "f-img" }, ph, h("span", null, h("b", null, d.image ? "Change image" : "Choose image"), h("br"), h("span", { class: "hint" }, "Square works best")), file)), field("Description", desc, "optional"), h("div", { class: "threecol" }, field("X link", txt("f-x", "x", "https://x.com/…")), field("Website", txt("f-web", "website", "https://…")), field("Telegram", txt("f-tg", "telegram", "https://t.me/…")))), err, nav(null, "Choose an element", () => {
                if (!d.name.trim() || d.ticker.length < 2) {
                    err.textContent = "Add a name and a ticker of at least 2 characters.";
                    (d.name.trim() ? ticker : name).focus();
                    return;
                }
                if (!d.image && !isDemo()) {
                    err.textContent = "Add an image. pump.fun needs one for every coin.";
                    return;
                }
                err.textContent = "";
                go(1);
            }));
        },
        // 02 — element
        () => {
            const table = periodicTable([], { mode: "pick", mini: true, selected: d.commodityId });
            const disc = h("div", { class: "note house", style: d.commodityId && byId(d.commodityId)?.tier === "house" ? "margin-top:14px" : "display:none" }, h("b", null, "House element. "), houseDisclaimer);
            const picked = h("span", { class: "label" }, "");
            const showPicked = () => { const com = d.commodityId ? byId(d.commodityId) : null; picked.textContent = com ? `Selected: ${(d.ticker || "TICKER")} / ${com.symbol}` : "Nothing selected"; };
            showPicked();
            table.tiles.forEach((t, id) => t.addEventListener("click", () => {
                d.commodityId = id;
                table.tiles.forEach((x, xid) => x.setAttribute("aria-pressed", xid === id ? "true" : "false"));
                const com = byId(id);
                disc.style.cssText = com.tier === "house" ? "margin-top:14px" : "display:none";
                showPicked();
                renderPreview();
            }));
            const search = h("input", { type: "search", class: "search", placeholder: "Find an element", "aria-label": "Find an element" });
            search.addEventListener("input", () => filterTable(table.el, table.tiles, search.value));
            const err = h("div", { class: "err", role: "alert" });
            return h("div", null, h("h2", null, "Choose your element"), h("p", { class: "hint" }, "Your coin lives on this board and is priced in it here. On pump.fun it trades in SOL like any coin."), h("div", { class: "picktools" }, search, picked), table.el, disc, h("p", { class: "hint", style: "margin-top:14px" }, pairNote), err, nav(0, "Weigh-in", () => { if (!d.commodityId) {
                err.textContent = "Pick an element to continue.";
                return;
            } go(2); }));
        },
        // 03 — weigh-in
        () => {
            const dev = h("input", { type: "number", id: "f-dev", inputmode: "decimal", min: "0", step: "any", placeholder: "0", value: d.devBuy });
            const cost = h("span", null, "");
            const renderCost = () => { cost.textContent = `${Number(d.devBuy) > 0 ? `${d.devBuy} SOL dev buy + ` : ""}~0.02 SOL rent & fees`; };
            dev.addEventListener("input", () => { d.devBuy = dev.value; renderCost(); });
            renderCost();
            const quick = h("div", { class: "quickamt" }, ["0", "0.1", "0.5", "1", "2"].map((v) => h("button", { type: "button", onclick: () => { dev.value = v === "0" ? "" : v; d.devBuy = dev.value; renderCost(); } }, v === "0" ? "None" : `${v} SOL`)));
            return h("div", null, h("h2", null, "Weigh-in"), h("p", { class: "hint" }, "An optional dev buy goes in the same transaction as the launch, so nobody can buy before you."), h("div", { class: "fields" }, h("div", { class: "field" }, h("label", { for: "f-dev" }, h("span", null, "Dev buy"), h("span", { class: "muted" }, "optional")), h("div", { class: "inp" }, dev, h("span", { class: "unit" }, "SOL")), quick)), h("div", { class: "feerows" }, h("div", null, h("span", null, h("b", { style: "font-family:var(--font-ui);font-size:15px;font-weight:600" }, "To you, the creator"), h("small", null, "Paid to your wallet by pump.fun")), h("b", null, `${fees.creatorSharePct}%`)), h("div", null, h("span", null, h("b", { style: "font-family:var(--font-ui);font-size:15px;font-weight:600" }, `Buy back & burn ${mainCoin()}`), h("small", null, "Bought on the market, then burned")), h("b", null, `${fees.buybackBurnPct}%`)), h("div", null, h("span", null, h("b", { style: "font-family:var(--font-ui);font-size:15px;font-weight:600" }, `${mainCoin()} holders`), h("small", null, "Paid out in SOL")), h("b", null, `${fees.mainHolderSolPct}%`))), h("p", { class: "hint", style: "margin-top:10px;display:flex;gap:6px;align-items:center" }, svg(UI.lock), "Your coin's creator-fee split. Written into the launch transaction and locked on-chain."), h("div", { class: "costline" }, h("span", { class: "label", style: "color:var(--ink)" }, "You pay"), cost), byId(d.commodityId)?.tier === "house" ? h("div", { class: "note house", style: "margin-top:14px" }, h("b", null, "House element. "), houseDisclaimer) : null, nav(1, "Certify", () => go(3)));
        },
        // 04 — certify
        () => {
            const com = byId(d.commodityId);
            const e = elementOf(d.commodityId);
            const btn = h("button", { class: "btn primary block launchbtn", onclick: async () => {
                    if (!wallet.get().address) {
                        openWalletModal();
                        return;
                    }
                    btn.setAttribute("disabled", "");
                    btn.textContent = "Starting…";
                    try {
                        const coin = await launchCoin(d, (label) => { btn.textContent = PHASE[label] ?? label; });
                        stage.replaceChildren(successScreen(coin, com));
                        stepper.querySelectorAll(":scope > div").forEach((s) => (s.className = "done"));
                        sealHost.innerHTML = sealSvg();
                        sealHost.classList.remove("pending");
                        sealHost.classList.add("stamp-in");
                    }
                    catch (err) {
                        toast(err.message, { color: "#c4362b", ms: 6000 });
                        btn.removeAttribute("disabled");
                        btn.textContent = "Launch on pump.fun";
                    }
                } }, isDemo() ? "Launch (demo)" : "Launch on pump.fun");
            if (!isDemo()) {
                btn.setAttribute("disabled", "");
                btn.textContent = "Checking launchpad…";
                void fetch(`${flags.apiUrl}/setup`).then((r) => r.json()).then((st) => {
                    if (st.ready) {
                        btn.removeAttribute("disabled");
                        btn.textContent = "Launch on pump.fun";
                    }
                    else
                        btn.textContent = "Launching opens soon";
                }).catch(() => { btn.removeAttribute("disabled"); btn.textContent = "Launch on pump.fun"; });
            }
            const walletLine = h("span", null, wallet.get().address ? shortAddr(wallet.get().address, 5) : "Not connected");
            const offW = wallet.on((s) => { walletLine.textContent = s.address ? shortAddr(s.address, 5) : "Not connected"; });
            const box = h("div", null, h("h2", null, "Certify"), h("p", { class: "hint" }, isDemo() ? "Demo mode: this makes a simulated coin on this site only." : "One transaction from your wallet creates the coin on pump.fun, locks the fee split, and lists it here."), h("div", { class: "kv", style: "margin-top:18px;border-top:1px solid var(--ink)" }, h("div", null, h("span", null, "Name"), h("span", null, d.name)), h("div", null, h("span", null, "Ticker"), h("span", null, `$${d.ticker}`)), h("div", null, h("span", null, "Element"), h("span", null, `${e ? elNum(e.n) : ""} ${com.name} · ${com.tier}`)), h("div", null, h("span", null, "Shown here as"), h("span", null, `${d.ticker} / ${com.symbol}`)), h("div", null, h("span", null, "Launches on"), h("span", null, "pump.fun, trades in SOL")), h("div", null, h("span", null, "Dev buy"), h("span", null, Number(d.devBuy) > 0 ? `${d.devBuy} SOL` : "None")), h("div", null, h("span", null, "Creator fees"), h("span", null, `${fees.creatorSharePct}% you · ${fees.buybackBurnPct}% burn · ${fees.mainHolderSolPct}% holders`)), h("div", null, h("span", null, "You pay"), h("span", null, `${Number(d.devBuy) > 0 ? `${d.devBuy} SOL + ` : ""}~0.02 SOL`)), h("div", null, h("span", null, "Site fee"), h("span", null, fees.launchCostSol === null ? "None" : `${fees.launchCostSol} SOL`)), h("div", null, h("span", null, "Wallet"), walletLine)), btn, h("p", { class: "hint", style: "margin-top:10px;text-align:center" }, "Your wallet shows the full transaction before you approve."), nav(2, "", null));
            onRemove(box, () => offW?.());
            return box;
        },
    ];
    const successScreen = (coin, com) => {
        const text = encodeURIComponent(`Just launched $${coin.ticker} on the ${com.name} board on ${brand.name}. ${brand.siteUrl}/#/coin/${coin.mint}`);
        return h("div", { class: "success" }, h("span", { class: "label" }, isDemo() ? "Demo · simulated coin" : "Assay complete"), h("h2", null, `$${coin.ticker} is on the table.`), h("p", { class: "muted" }, `Trading on pump.fun in SOL. Priced in ${com.symbol} here.`), certCard(coin, { live: false }), h("div", { class: "actions" }, h("a", { class: "btn primary", href: href(`/coin/${coin.mint}`) }, "View coin", svg(UI.arrow)), isDemo() ? null : h("a", { class: "btn", href: `https://pump.fun/coin/${coin.mint}`, target: "_blank", rel: "noopener" }, "View on pump.fun", svg(UI.external)), h("a", { class: "btn", href: `https://x.com/intent/post?text=${text}`, target: "_blank", rel: "noopener" }, "Share on X")));
    };
    renderPreview();
    go(0);
    return el;
}
function placeholderImage() {
    return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#ebe6da"/><path d="M0 0L64 64M64 0L0 64" stroke="#c4bdac" stroke-width="1"/></svg>`);
}
