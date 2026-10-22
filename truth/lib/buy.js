// Builds an unsigned buy (X SOL) or sell (X% of the wallet's tokens) transaction for one wallet.
// Routes: PumpPortal (works on brand-new pump.fun coins and bonded ones; PumpPortal takes a small fee)
// or Jupiter (no extra fee; may not see a coin in its first minutes). "auto" tries Jupiter first.
const WSOL = 'So11111111111111111111111111111111111111112';

async function viaPumpPortal({ side = 'buy', wallet, mint, lamports, pct, slippagePct, priorityFeeSol }) {
  const res = await fetch('https://pumpportal.fun/api/trade-local', {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: wallet, action: side, mint,
      ...(side === 'sell' ? { amount: `${pct}%`, denominatedInSol: 'false' } : { amount: Number(lamports) / 1e9, denominatedInSol: 'true' }),
      slippage: slippagePct, priorityFee: priorityFeeSol, pool: 'auto',
    }),
  });
  if (res.status !== 200) throw new Error('PumpPortal: ' + ((await res.text()).slice(0, 160) || `HTTP ${res.status}`));
  return new Uint8Array(await res.arrayBuffer());
}

async function viaJupiter({ side = 'buy', wallet, mint, lamports, tokenRaw, slippagePct, priorityFeeSol, jupKey }) {
  const base = jupKey ? 'https://api.jup.ag/swap/v1' : 'https://lite-api.jup.ag/swap/v1';
  const headers = { 'Content-Type': 'application/json', ...(jupKey ? { 'x-api-key': jupKey } : {}) };
  const sell = side === 'sell';
  const q = new URLSearchParams({ inputMint: sell ? mint : WSOL, outputMint: sell ? WSOL : mint, amount: String(sell ? tokenRaw : lamports), slippageBps: String(Math.round(slippagePct * 100)) });
  const qr = await fetch(`${base}/quote?${q}`, { headers, signal: AbortSignal.timeout(6000) });
  const quote = await qr.json().catch(() => ({}));
  if (!qr.ok || quote.error || !quote.outAmount) throw new Error('Jupiter: ' + (quote.error || `no route (HTTP ${qr.status})`));
  const sr = await fetch(`${base}/swap`, {
    method: 'POST', headers, signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      quoteResponse: quote, userPublicKey: wallet, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: Math.round(priorityFeeSol * 1e9), priorityLevel: 'veryHigh' } },
    }),
  });
  const swap = await sr.json().catch(() => ({}));
  if (!sr.ok || !swap.swapTransaction) throw new Error('Jupiter: ' + (swap.error || `swap failed (HTTP ${sr.status})`));
  return Uint8Array.from(atob(swap.swapTransaction), c => c.charCodeAt(0));
}

export async function buildBuyTx(opts) {
  if (opts.route === 'pumpportal') return { tx: await viaPumpPortal(opts), route: 'PumpPortal' };
  if (opts.route === 'jupiter') return { tx: await viaJupiter(opts), route: 'Jupiter' };
  // Auto: ask both at the same time. Jupiter still wins when it has a route (no extra fee), but when it
  // doesn't (new bonding-curve coins) the PumpPortal tx is already built instead of starting from scratch.
  // Building a PumpPortal tx costs nothing unless it's actually sent.
  const pp = viaPumpPortal(opts);
  pp.catch(() => {}); // handled below; stops an "unhandled rejection" if Jupiter wins
  try { return { tx: await viaJupiter(opts), route: 'Jupiter' }; }
  catch (je) {
    try { return { tx: await pp, route: 'PumpPortal' }; }
    catch (pe) { throw new Error(`${je.message} · ${pe.message}`); }
  }
}
