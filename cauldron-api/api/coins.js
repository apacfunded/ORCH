// GET -> { coins: [...] } newest first
import { wrap } from '../lib/http.js';
import { readAll } from '../lib/store.js';
export default wrap(async (req, res) => {
  res.setHeader('cache-control', 'public, s-maxage=10, stale-while-revalidate=30');
  const coins = (await readAll('coins/')).sort((a, b) => b.at - a.at);
  return { coins };
});
