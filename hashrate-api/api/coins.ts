import { wrap } from '../lib/http.js';
import { allCoins } from '../lib/launches.js';
import { TARGETS } from '../lib/targets.js';

export default wrap(async () => (await allCoins()).map((c) => ({
  mint: c.mint, ticker: c.ticker, name: c.name, target: c.target, rent_share: c.rent_share, created_at: c.created_at,
  creator: c.creator, socials: c.socials ?? {}, mines: TARGETS[c.target]?.label, pots: {},
})));
