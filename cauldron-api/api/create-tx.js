// POST { creator, mint, name, ticker, uri, devBuySol } -> { tx: base64 }
// Builds the pump.fun create transaction with PumpPortal. The browser signs it with the
// mint keypair and the creator's wallet, so the server never holds a key.
import { wrap, body, bad, pubkey, clean, ticker } from '../lib/http.js';
import { list } from '../lib/store.js';
export default wrap(async (req) => {
  const b = body(req);
  const creator = pubkey(b.creator, 'Your wallet');
  const mint = pubkey(b.mint, 'The mint');
  const name = clean(b.name, 32); if (!name) throw bad('Add a coin name.');
  const symbol = ticker(b.ticker);
  const uri = clean(b.uri, 300); if (!/^https:\/\//.test(uri)) throw bad('Upload the coin image first.');
  const dev = Math.max(0, Math.min(Number(b.devBuySol) || 0, 85));
  const taken = (await list(`tickers/${symbol}.json`)).length > 0;
  if (taken) throw bad(`$${symbol} was already brewed on Cauldron. Pick another ticker.`);
  const r = await fetch('https://pumpportal.fun/api/trade-local', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ publicKey: creator, action: 'create', tokenMetadata: { name, symbol, uri }, mint, denominatedInSol: 'true', amount: dev, slippage: 10, priorityFee: Number(process.env.PRIORITY_FEE_SOL || 0.0005), pool: 'pump' }),
  });
  if (r.status !== 200) { const t = await r.text(); console.error('pumpportal', r.status, t.slice(0, 300)); throw new Error(`PumpPortal ${r.status}`); }
  const tx = Buffer.from(await r.arrayBuffer()).toString('base64');
  return { tx };
});
