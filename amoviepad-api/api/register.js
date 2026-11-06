// POST { signature, mint, creator, name, ticker, idea, genre, minutes, image, uri }
// Verifies the create transaction on-chain, then records the movie coin.
import { wrap, body, bad, pubkey, clean, ticker } from '../lib/http.js';
import { putJson, list } from '../lib/store.js';
import { getTx, PUMP_PROGRAM } from '../lib/solana.js';
import { RUNTIMES } from '../lib/movie.js';
const GENRES = new Set(['Action', 'Comedy', 'Horror', 'Sci-Fi', 'Drama', 'Thriller', 'Animated', 'Documentary']);
export default wrap(async (req) => {
  const b = body(req);
  const sig = clean(b.signature, 100); if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(sig)) throw bad('Missing transaction signature.');
  const mint = pubkey(b.mint, 'The mint');
  const creator = pubkey(b.creator, 'Your wallet');
  if ((await list(`coins/${mint}.json`)).length) return { ok: true, already: true };

  const tx = await getTx(sig);
  if (!tx) throw bad('The launch transaction was not found yet. Your coin may still be landing; it will show once confirmed.');
  if (tx.meta?.err) throw bad('The launch transaction failed on-chain, so no coin was created.');
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
  const signers = keys.slice(0, tx.transaction.message.header.numRequiredSignatures);
  if (!signers.includes(creator) || !signers.includes(mint)) throw bad('That transaction was not signed by this wallet and mint.');
  if (!keys.includes(PUMP_PROGRAM)) throw bad('That transaction is not a pump.fun launch.');

  const symbol = ticker(b.ticker);
  const minutes = RUNTIMES.includes(Number(b.minutes)) ? Number(b.minutes) : 3;
  const coin = {
    mint, creator, signature: sig, ticker: symbol,
    name: clean(b.name, 32), idea: clean(b.idea, 400),
    genre: GENRES.has(b.genre) ? b.genre : 'Action', minutes,
    image: clean(b.image, 300), uri: clean(b.uri, 300),
    at: (tx.blockTime ? tx.blockTime * 1000 : Date.now()),
  };
  await putJson(`coins/${mint}.json`, coin);
  await putJson(`tickers/${symbol}.json`, { mint }, true).catch(() => {});
  return { ok: true, coin };
});
