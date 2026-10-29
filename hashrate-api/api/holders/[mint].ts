// Payout sheet: every holder's share of a coin plus the payout addresses they linked.
// GET /api/holders/:mint            → JSON
// GET /api/holders/:mint?chain=DOGE&amount=1000&format=csv → CSV of address,amount for that chain
import { wrap, param, clientError, type Res } from '../../lib/http.js';
import { CFG } from '../../lib/config.js';
import { SolanaRpc } from '../../lib/rpc.js';
import { list, getJson } from '../../lib/store.js';
import { allCoins } from '../../lib/launches.js';

export default wrap(async (req, res: Res) => {
  const mint = param(req, 'mint');
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) throw clientError('Bad mint.');
  const coin = (await allCoins()).find((c) => c.mint === mint);
  const rpc = new SolanaRpc(CFG.rpc);
  const bags = await rpc.holders(mint);
  if (coin) bags.delete(coin.creator); // the coin's own creator wallet is never paid
  const total = [...bags.values()].reduce((a, b) => a + b, 0) || 1;

  const linkMetas = (await list('links/')).filter((m) => bags.has(m.pathname.split('/')[1]));
  const links = await Promise.all(linkMetas.map((m) => getJson<{ wallet: string; chain: string; address: string }>(m.url)));
  const byWallet = new Map<string, Record<string, string>>();
  for (const l of links) byWallet.set(l.wallet, { ...(byWallet.get(l.wallet) ?? {}), [l.chain]: l.address });

  const rows = [...bags.entries()].sort((a, b) => b[1] - a[1]).map(([wallet, tokens]) => ({ wallet, tokens, share: tokens / total, addresses: byWallet.get(wallet) ?? {} }));

  const chain = param(req, 'chain').toUpperCase();
  const amount = Number(param(req, 'amount'));
  if (chain) {
    // Only linked holders on that chain are paid; their shares are re-normalised among themselves.
    const linked = rows.filter((r) => r.addresses[chain]);
    const linkedTotal = linked.reduce((a, r) => a + r.tokens, 0) || 1;
    const pay = linked.map((r) => ({ wallet: r.wallet, address: r.addresses[chain], share: r.tokens / linkedTotal, amount: amount > 0 ? (r.tokens / linkedTotal) * amount : undefined }));
    if (param(req, 'format') === 'csv') {
      res.setHeader('content-type', 'text/csv');
      res.setHeader('content-disposition', `attachment; filename="${coin?.ticker ?? mint.slice(0, 6)}-${chain}-payout.csv"`);
      res.status(200).end('address,amount,share,wallet\n' + pay.map((p) => `${p.address},${p.amount?.toFixed(8) ?? ''},${p.share.toFixed(6)},${p.wallet}`).join('\n') + '\n');
      return;
    }
    return { mint, ticker: coin?.ticker, chain, holders: rows.length, linked: pay.length, pay };
  }
  return { mint, ticker: coin?.ticker, target: coin?.target, holders: rows.length, rows };
});
