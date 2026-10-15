"use strict";
// Hoist: hides old coins (launched under the Lever name) from this site. The coins still exist on pump.fun and in the
// database; this only keeps them off the Hoist pages, their activity and the totals. Add a mint to HIDE to hide another
// coin; remove one to show it again. Runs after app.js, the same way demo.js does.
(function () {
  const HIDE = new Set([
    "2s38vSoxAJiNSaLQjaUWex4QAbXH8e6KzMwgE8xzg95m", // Lever ($LEVER)
    "4rroHuUdWrQTtzNJnXdhQDSdnt3u2zZS6yFsmiwTdWiT"  // test ($TEST)
  ]);
  const clean = () => {
    const coins = (S.coins || []).filter(c => !HIDE.has(c.mint));
    if (coins.length === (S.coins || []).length && !(S.activity || []).some(a => HIDE.has(a.mint))) return;
    S.coins = coins;
    S.activity = (S.activity || []).filter(a => !HIDE.has(a.mint));
    S.totals = {
      ...S.totals,
      coins: coins.length,
      pools: +coins.reduce((s, c) => s + (+c.pool || 0), 0).toFixed(4),
      reserved: +coins.reduce((s, c) => s + (+c.reserved || 0), 0).toFixed(4),
      unlocked: coins.filter(c => c.unlocked).length
    };
    if (HIDE.has(S.leverMint)) S.leverMint = "";
    if (!S.activity.length) S.lastClaimAt = 0;
  };
  const realRenderHome = renderHome;
  renderHome = function () { clean(); realRenderHome(); };
  const realRenderCoin = renderCoin;
  renderCoin = function () { clean(); realRenderCoin(); };
  const realRenderMe = renderMe;
  renderMe = function () {
    if (MEDATA) {
      if (Array.isArray(MEDATA.launched)) MEDATA.launched = MEDATA.launched.filter(c => !HIDE.has(c.mint));
      if (Array.isArray(MEDATA.holdings)) MEDATA.holdings = MEDATA.holdings.filter(h => !HIDE.has(h.mint));
    }
    realRenderMe();
  };
  clean(); renderHome(); if (current.coin) renderCoin();
})();
