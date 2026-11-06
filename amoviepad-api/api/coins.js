// GET -> { coins: [...movie coins with clip progress], log: [...latest clip events] }
import { wrap } from '../lib/http.js';
import { readAll, list, getJson } from '../lib/store.js';
import { progress, CLIP_SOL } from '../lib/movie.js';
export default wrap(async (req, res) => {
  res.setHeader('cache-control', 'public, s-maxage=15, stale-while-revalidate=30');
  const [coins, states, logMetas] = await Promise.all([readAll('coins/'), list('state/'), list('log/')]);
  const stateUrl = Object.fromEntries(states.map((m) => [m.pathname.slice(6, -5), m.url]));
  const out = await Promise.all(coins.map(async (c) => {
    const s = stateUrl[c.mint] ? await getJson(`${stateUrl[c.mint]}?t=${Date.now()}`).catch(() => null) : null;
    return { ...c, ...progress(c, s), trades: s?.trades || 0 };
  }));
  const recent = logMetas.sort((a, b) => b.pathname.localeCompare(a.pathname)).slice(0, 20);
  const log = await Promise.all(recent.map((m) => getJson(m.url).catch(() => null)));
  return { clipSol: CLIP_SOL, coins: out.sort((a, b) => b.at - a.at), log: log.filter(Boolean) };
});
