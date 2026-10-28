import { wrap, param, clientError } from '../../lib/http.js';
import { readAll } from '../../lib/store.js';

export default wrap(async (req) => {
  const wallet = param(req, 'wallet');
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) throw clientError('Bad wallet.');
  const links = (await readAll<{ chain: string; address: string; signed_at: number }>(`links/${wallet}/`)).map((l) => l.data);
  return { links, owed: [] };
});
