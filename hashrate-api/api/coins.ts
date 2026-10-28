import { wrap } from '../lib/http';
import { allCoins } from '../lib/launches';
import { TARGETS } from '../lib/targets';

export default wrap(async () => (await allCoins()).map((c) => ({
  mint: c.mint, ticker: c.ticker, name: c.name, target: c.target, rent_share: c.rent_share, created_at: c.created_at,
  creator: c.creator, socials: c.socials ?? {}, mines: TARGETS[c.target]?.label, pots: {},
})));
