import { wrap } from '../lib/http.js';
import { allCoins } from '../lib/launches.js';

export default wrap(async () => (await allCoins()).map((c) => ({
  mint: c.mint, ticker: c.ticker, name: c.name, description: c.description, image: c.image,
  pairType: c.pairType, pairWith: c.pairWith, created_at: c.created_at, socials: c.socials ?? {},
})));
