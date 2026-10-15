"use strict";
// Hoist: the launch and wallet code (app.js) still comes from the Lever deployment on Vercel, and a few of its
// messages say "Lever". This swaps those exact phrases for "Hoist" as they appear. Coin names and tickers are never
// touched. Delete this file once app.js on Vercel says Hoist itself.
(function () {
  const SWAP = [
    ["Open Lever in", "Open Hoist in"],
    ["Lever coins", "Hoist coins"],
    ["Lever never holds", "Hoist never holds"],
    ["Buy $LEVER on pump.fun", "Buy $HOIST on pump.fun"],
    ["Copy $LEVER contract address", "Copy $HOIST contract address"]
  ];
  const EXACT = { "On Lever": "On Hoist", "The lever": "The balance" };
  const fixText = s => { let t = s; for (const [a, b] of SWAP) if (t.includes(a)) t = t.split(a).join(b); const k = t.trim(); return EXACT[k] ? t.replace(k, EXACT[k]) : t; };
  function fix(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const v = fixText(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; }
    if (root.querySelectorAll) root.querySelectorAll("[aria-label]").forEach(el => { const v = fixText(el.getAttribute("aria-label")); if (v !== el.getAttribute("aria-label")) el.setAttribute("aria-label", v); });
  }
  const start = () => {
    fix(document.body);
    new MutationObserver(ms => { for (const m of ms) { if (m.type === "characterData") { const v = fixText(m.target.nodeValue); if (v !== m.target.nodeValue) m.target.nodeValue = v; } else m.addedNodes.forEach(n => n.nodeType === 1 ? fix(n) : n.nodeType === 3 && fix(n.parentNode || document.body)); } })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
