import { tierBadge } from "../components/Badge.js";
import { coinCard } from "../components/CoinCard.js";
import { UI, commodityIcon } from "../components/Icons.js";
import { toast } from "../components/Toasts.js";
import { openWalletModal, wallet } from "../components/WalletButton.js";
import { brand, houseDisclaimer, pairNote } from "../config/brand.js";
import { fees, fmtFee } from "../config/fees.js";
import { boardCommodities, byId, categoryLabel } from "../config/commodities.js";
import { isDemo } from "../config/flags.js";
import { mockMarket } from "../data/index.js";
import { h, svg } from "../lib/dom.js";
import { reducedMotion } from "../lib/motion.js";
import { href } from "../lib/router.js";
import { art, artImg } from "../config/art.js";
/**
 * launchCoin() — Phase 2 real flow (left as a documented stub). Coins launch on pump.fun.
 *  1. Upload metadata to pump.fun's IPFS endpoint (multipart form):
 *       POST https://pump.fun/api/ipfs   fields: file, name, symbol, description, twitter, telegram, website, showName
 *     -> { metadataUri }
 *     (Browsers may hit CORS here; if so, route this one call through the /proxy worker.)
 *  2. Generate a fresh mint keypair in the browser (it signs the create transaction too).
 *  3. Ask PumpPortal for an unsigned create transaction:
 *       POST https://pumpportal.fun/api/trade-local
 *       { publicKey: wallet, action: "create", tokenMetadata: { name, symbol, uri: metadataUri },
 *         mint: mintKeypair.publicKey, denominatedInSol: "true", amount: devBuySol, slippage: 10,
 *         priorityFee: 0.0005, pool: "pump" }
 *     Verify the current field names in PumpPortal's "Token Creation" docs before shipping.
 *  4. Deserialize, partially sign with the mint keypair, then wallet.signAndSendTransaction(); confirm.
 *  5. Set creator-fee sharing so the launchpad wallet (fees.launchpadFeeWallet) gets its share
 *     (pump.fun allows up to 10 recipients) — through pump.fun's fee-sharing settings for the coin.
 *  6. POST { mint, commodityId, signature } to the proxy's /registry so this site lists the coin
 *     on the chosen board. The proxy checks the signature on-chain before accepting it.
 * The commodity choice never touches pump.fun: it lives only in our registry.
 */
async function launchCoin(d) {
    const m = mockMarket();
    if (!m)
        throw new Error("Launching is not live yet");
    return m.demoLaunch({ name: d.name, ticker: d.ticker, commodityId: d.commodityId, image: d.image || undefined, description: d.description || undefined });
}
export async function launchPage(ctx) {
    const d = { name: "", ticker: "", description: "", image: "", x: "", website: "", telegram: "", commodityId: null, devBuy: "", rewards: false };
    let step = 0;
    const steps = h("div", { class: "wsteps", "aria-hidden": "true" }, [0, 1, 2, 3].map(() => h("div")));
    const stage = h("div");
    const preview = h("div", { class: "preview" }, h("div", { class: "pcap" }, "Live preview"));
    const previewCard = h("div");
    preview.appendChild(previewCard);
    const header = h("div", { class: "art-header" }, artImg(art.foundry, "art-header-img"), h("div", { class: "art-header-shade", "aria-hidden": "true" }), h("div", { class: "art-header-copy" }, h("div", { class: "eyebrow" }, "Launch a coin · pump.fun"), h("h1", null, "SEND ", h("span", { class: "loud-hot" }, "IT."), h("br"), "PRICE IT IN ", h("span", { class: "loud-gold" }, "GOLD.")), h("p", null, "Name it. Pick a commodity. Launch on pump.fun. Your coin gets its own board and commodity price here.")));
    const el = h("div", { class: "page launch-loud" }, header, h("div", { class: "wizard" }, h("div", { style: "display:grid;gap:14px" }, steps, stage), preview));
    const renderPreview = () => {
        const com = d.commodityId ? byId(d.commodityId) : null;
        const fake = {
            mint: "PREVIEW", pairAddress: "PREVIEW", name: d.name || "Your coin", ticker: (d.ticker || "TICKER").toUpperCase(),
            image: d.image || placeholderImage(com?.color ?? "#e6b84a"), commodityId: com?.id ?? "gold", status: "curve", bondingProgress: 0.02,
            priceUsd: 0.0000042, priceQuote: 0, marketCapUsd: 4200, volume24hUsd: 0, change24hPct: 0, holders: 1, createdAt: Date.now(), rewards: d.rewards, spark: [1, 1.02, 1.01, 1.04, 1.03, 1.06, 1.05, 1.08],
        };
        previewCard.replaceChildren(coinCard(fake, { live: false }));
        if (com)
            ctx.tint(com.color);
    };
    const renderSteps = () => steps.querySelectorAll("div").forEach((s, i) => { s.className = i < step ? "done" : i === step ? "cur" : ""; });
    const go = (n) => { step = n; renderSteps(); stage.replaceChildren(STEPS[n]()); stage.animate([{ opacity: 0, transform: "translateX(8px)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: "ease-out" }); window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" }); };
    const field = (label, input, hint) => h("div", { class: "field" }, h("label", { for: input.id }, h("span", null, label), hint ? h("span", { class: "muted" }, hint) : null), input);
    const txt = (id, key, placeholder, max) => {
        const i = h("input", { type: "text", id, placeholder, maxlength: max ? String(max) : undefined, value: String(d[key] ?? "") });
        i.addEventListener("input", () => { d[key] = key === "ticker" ? i.value.toUpperCase().replace(/[^A-Z0-9]/g, "") : i.value; if (key === "ticker")
            i.value = String(d.ticker); renderPreview(); });
        return i;
    };
    const STEPS = [
        // 1 — details
        () => {
            const name = txt("f-name", "name", "e.g. Golden Walrus", 32);
            const ticker = txt("f-ticker", "ticker", "WALRUS", 8);
            const desc = h("textarea", { id: "f-desc", placeholder: "What is this coin about?", maxlength: "280" });
            desc.value = d.description;
            desc.addEventListener("input", () => { d.description = desc.value; });
            const img = h("img", { alt: "", style: d.image ? "" : "display:none", src: d.image || undefined });
            const circ = h("div", { class: "circ" }, img, d.image ? null : svg(UI.plus));
            const file = h("input", { type: "file", accept: "image/*", id: "f-img" });
            file.addEventListener("change", () => { const f = file.files?.[0]; if (!f)
                return; const r = new FileReader(); r.onload = () => { d.image = String(r.result); img.src = d.image; img.style.display = ""; circ.querySelector(".svgwrap")?.remove(); renderPreview(); }; r.readAsDataURL(f); });
            const err = h("div", { class: "err" });
            return h("div", { class: "card wstep" }, h("div", { class: "loud-step" }, "STEP 1/4"), h("h2", null, "NAME YOUR COIN."), h("p", { class: "hint" }, "Name, ticker, image. Socials optional. Make it loud."), field("Name", name), field("Ticker", ticker, "letters and numbers"), h("div", { class: "field" }, h("label", { for: "f-img" }, h("span", null, "Image"), h("span", { class: "muted" }, "cropped to a circle")), h("label", { class: "upload", for: "f-img" }, circ, h("span", { class: "btn sm" }, "Choose image"), file)), field("Description", desc), h("div", { class: "twocol" }, field("X link", txt("f-x", "x", "https://x.com/…")), field("Website", txt("f-web", "website", "https://…")), field("Telegram", txt("f-tg", "telegram", "https://t.me/…"))), err, h("div", { class: "wnav" }, h("span"), h("button", { class: "btn primary", onclick: () => { if (!d.name.trim() || d.ticker.length < 2) {
                    err.textContent = "Add a name and a ticker of at least 2 characters to continue.";
                    name.focus();
                    return;
                } err.textContent = ""; go(1); } }, "PICK A COMMODITY", svg(UI.arrow))));
        },
        // 2 — pair
        () => {
            const disc = h("div", { class: "disc-box", style: d.commodityId && byId(d.commodityId)?.tier === "house" ? "" : "display:none" }, h("b", null, "House pair · "), houseDisclaimer);
            const allBoards = boardCommodities();
            const tiles = allBoards.map((c) => {
                const locked = c.status !== "live";
                const b = h("button", { class: `pick ${d.commodityId === c.id ? "active" : ""}`, style: `--c:${c.color}`, disabled: locked, "aria-pressed": d.commodityId === c.id ? "true" : "false",
                    onclick: () => { d.commodityId = c.id; tiles.forEach((t, i) => { const on = allBoards[i].id === c.id; t.classList.toggle("active", on); t.setAttribute("aria-pressed", on ? "true" : "false"); }); disc.style.display = c.tier === "house" ? "" : "none"; renderPreview(); materialBurst(b, c); } }, svg(commodityIcon(c.icon), "ico"), h("div", { class: "nm" }, c.name, tierBadge(c, { tooltip: false })), h("div", { class: "st" }, locked ? `Locked · $${c.symbol} curve ${Math.round(c.unlockProgress * 100)}%` : `Shown as ${(d.ticker || "TICKER")} / ${c.symbol}`));
                return b;
            });
            const err = h("div", { class: "err" });
            return h("div", { class: "card wstep" }, h("div", { class: "loud-step" }, "STEP 2/4"), h("h2", null, "PICK YOUR COMMODITY."), h("p", { class: "hint" }, "Your coin lives on this board and gets priced in this commodity here. On pump.fun it trades in SOL like any coin."), pickerSearch(allBoards, tiles), Object.keys(categoryLabel).map((cat) => {
                const idx = allBoards.map((c, i) => (c.category === cat ? i : -1)).filter((i) => i >= 0);
                return idx.length ? h("div", { class: "pick-group" }, h("h3", { class: "group-title" }, categoryLabel[cat]), h("div", { class: "picker" }, idx.map((i) => tiles[i]))) : null;
            }), h("p", { class: "hint" }, pairNote), disc, err, h("div", { class: "wnav" }, h("button", { class: "btn", onclick: () => go(0) }, svg(UI.back), "Back"), h("button", { class: "btn primary", onclick: () => { if (!d.commodityId) {
                    err.textContent = "Choose a commodity to continue.";
                    return;
                } go(2); } }, "SETTINGS", svg(UI.arrow))));
        },
        // 3 — settings
        () => {
            const com = byId(d.commodityId);
            const dev = h("input", { type: "number", id: "f-dev", inputmode: "decimal", min: "0", step: "any", placeholder: "0", value: d.devBuy });
            dev.addEventListener("input", () => { d.devBuy = dev.value; });
            const tog = h("button", { class: `toggle ${d.rewards ? "on" : ""}`, role: "switch", "aria-checked": d.rewards ? "true" : "false", "aria-label": "Holder rewards", disabled: !fees.holderRewardsAvailable, onclick: () => { d.rewards = !d.rewards; tog.classList.toggle("on", d.rewards); tog.setAttribute("aria-checked", d.rewards ? "true" : "false"); renderPreview(); } });
            return h("div", { class: "card wstep" }, h("div", { class: "loud-step" }, "STEP 3/4"), h("h2", null, "LOAD IT UP."), h("p", { class: "hint" }, "Shares are placeholders until the owner sets them (TBD). pump.fun charges its own trading fee; this is how the coin's creator fees get split."), h("div", { class: "field" }, h("label", { for: "f-dev" }, h("span", null, "Dev buy (optional)"), h("span", { class: "muted" }, "in SOL")), h("div", { class: "inp" }, dev, h("span", { class: "unit" }, "SOL"))), h("p", { class: "hint" }, "A dev buy goes in the same transaction as the launch, so snipers can't buy before you."), h("div", { class: "feegrid" }, h("div", null, h("span", null, "Creator fees → launchpad wallet"), h("b", null, fmtFee(fees.launchpadSharePct))), h("div", null, h("span", null, "Creator fees → your wallet"), h("b", null, fmtFee(fees.creatorSharePct))), h("div", null, h("span", null, `Holder rewards → fees buy ${com.symbol} for holders (${fmtFee(fees.holderRewardsPct)})`), tog)), com.tier === "house" ? h("div", { class: "disc-box" }, h("b", null, "House pair · "), houseDisclaimer) : null, h("div", { class: "wnav" }, h("button", { class: "btn", onclick: () => go(1) }, svg(UI.back), "Back"), h("button", { class: "btn primary", onclick: () => go(3) }, "REVIEW", svg(UI.arrow))));
        },
        // 4 — review & launch
        () => {
            const com = byId(d.commodityId);
            const btn = h("button", { class: "btn primary block", onclick: async () => {
                    if (!wallet.get().address) {
                        openWalletModal();
                        return;
                    }
                    btn.setAttribute("disabled", "");
                    btn.textContent = "SENDING IT…";
                    try {
                        const coin = await launchCoin(d);
                        stage.replaceChildren(successScreen(coin, com));
                        steps.querySelectorAll("div").forEach((s) => (s.className = "done"));
                    }
                    catch (e) {
                        toast(e.message, { color: "#ff8a5c" });
                        btn.removeAttribute("disabled");
                        btn.textContent = "SEND IT";
                    }
                } }, svg(UI.rocket), isDemo() ? "SEND IT (DEMO)" : "SEND IT ON PUMP.FUN");
            return h("div", { class: "card wstep" }, h("div", { class: "loud-step" }, "STEP 4/4"), h("h2", null, "LAST LOOK. THEN SEND IT."), h("p", { class: "hint" }, isDemo() ? "Demo mode: this creates a simulated coin on this site only. Nothing is sent to pump.fun." : "This launches your coin on pump.fun and lists it on the board you picked."), h("div", { class: "kv" }, h("div", null, h("span", null, "Name"), h("span", null, d.name)), h("div", null, h("span", null, "Ticker"), h("span", null, `$${d.ticker}`)), h("div", null, h("span", null, "Launches on"), h("span", null, "pump.fun (trades in SOL)")), h("div", null, h("span", null, "Shown here as"), h("span", null, `${d.ticker} / ${com.symbol} (${com.tier})`)), h("div", null, h("span", null, "Dev buy"), h("span", null, d.devBuy ? `${d.devBuy} SOL` : "None")), h("div", null, h("span", null, "Holder rewards"), h("span", null, d.rewards ? "On" : "Off")), h("div", null, h("span", null, "Site fee"), h("span", null, fees.launchCostSol === null ? "TBD" : `${fees.launchCostSol} SOL`))), isDemo() ? h("span", { class: "demo-tag" }, "DEMO") : null, btn, h("div", { class: "wnav" }, h("button", { class: "btn", onclick: () => go(2) }, svg(UI.back), "Back"), h("span")));
        },
    ];
    const successScreen = (coin, com) => {
        const canvas = h("canvas");
        const text = encodeURIComponent(`Just launched $${coin.ticker} on the ${com.name} board on ${brand.name}. ${brand.siteUrl}/#/coin/${coin.mint}`);
        const el = h("div", { class: "card success" }, canvas, isDemo() ? h("span", { class: "demo-tag" }, "DEMO · simulated coin") : null, h("h2", null, `$${coin.ticker} is live on the ${com.name} board`), h("p", { style: "color:var(--text-2)" }, `Trading on pump.fun in SOL. Priced in ${com.symbol} here.`), h("div", { style: "display:flex;gap:10px;flex-wrap:wrap;justify-content:center" }, h("a", { class: "btn primary", href: href(`/coin/${coin.mint}`) }, svg(UI.chart), "Open coin page"), isDemo() ? null : h("a", { class: "btn", href: `https://pump.fun/coin/${coin.mint}`, target: "_blank", rel: "noopener" }, "View on pump.fun", svg(UI.external)), h("a", { class: "btn", href: `https://x.com/intent/post?text=${text}`, target: "_blank", rel: "noopener" }, "Share on X")));
        confetti(canvas, com);
        return el;
    };
    renderPreview();
    go(0);
    return el;
}
function pickerSearch(boards, tiles) {
    const i = h("input", { type: "search", id: "f-board-search", class: "board-search", placeholder: `Search ${boards.length} commodities…`, "aria-label": "Search commodities" });
    i.addEventListener("input", () => {
        const q = i.value.trim().toLowerCase();
        boards.forEach((c, n) => { tiles[n].style.display = !q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q) ? "" : "none"; });
        document.querySelectorAll(".pick-group").forEach((g) => { g.style.display = [...g.querySelectorAll(".pick")].some((t) => t.style.display !== "none") ? "" : "none"; });
    });
    return i;
}
function placeholderImage(color) {
    return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${color}" opacity=".35"/><circle cx="32" cy="32" r="14" fill="none" stroke="${color}" stroke-width="3"/></svg>`);
}
/** Short material burst inside a picker tile (gold dust, oil drip, uranium pulse…). */
function materialBurst(tile, c) {
    if (reducedMotion())
        return;
    for (let i = 0; i < 14; i++) {
        const p = h("i", { style: `position:absolute;left:${50 + (Math.random() - 0.5) * 40}%;top:50%;width:${c.material === "oilslick" ? 4 : 5}px;height:${c.material === "oilslick" ? 9 : 5}px;border-radius:${c.material === "oilslick" ? "40% 40% 50% 50%" : "50%"};background:${c.color};pointer-events:none` });
        tile.appendChild(p);
        const dx = (Math.random() - 0.5) * 90, dy = c.material === "oilslick" ? 60 + Math.random() * 30 : -40 - Math.random() * 50;
        p.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${c.material === "glow" ? 2.4 : 0.4})`, opacity: 0 }], { duration: 650 + Math.random() * 300, easing: "cubic-bezier(.16,1,.3,1)" }).onfinish = () => p.remove();
    }
}
/** Confetti made of the commodity's own particles. */
function confetti(canvas, c) {
    if (reducedMotion())
        return;
    const w = canvas.clientWidth || 600, hgt = canvas.clientHeight || 300;
    canvas.width = w;
    canvas.height = hgt;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return;
    const ps = Array.from({ length: 140 }, () => ({ x: w / 2 + (Math.random() - 0.5) * 60, y: hgt * 0.6, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 11 - 3, r: 2 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, a: 1 }));
    const shape = c.material === "oilslick" ? "drop" : c.material === "glow" ? "glow" : c.id === "coffee" || c.id === "cocoa" ? "bean" : "flake";
    let frames = 0;
    const loop = () => {
        if (!document.contains(canvas) || frames++ > 180)
            return;
        ctx.clearRect(0, 0, w, hgt);
        for (const p of ps) {
            p.vy += 0.22;
            p.x += p.vx;
            p.y += p.vy;
            p.rot += p.vr;
            p.a -= 0.005;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.globalAlpha = Math.max(0, p.a);
            ctx.fillStyle = c.color;
            if (shape === "glow") {
                ctx.shadowColor = c.color;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.arc(0, 0, p.r * 0.8, 0, 7);
                ctx.fill();
            }
            else if (shape === "drop") {
                ctx.beginPath();
                ctx.ellipse(0, 0, p.r * 0.6, p.r, 0, 0, 7);
                ctx.fill();
            }
            else if (shape === "bean") {
                ctx.beginPath();
                ctx.ellipse(0, 0, p.r * 0.7, p.r * 1.1, 0, 0, 7);
                ctx.fill();
                ctx.strokeStyle = "#120607";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, -p.r);
                ctx.lineTo(0, p.r);
                ctx.stroke();
            }
            else {
                ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
            }
            ctx.restore();
        }
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
}
