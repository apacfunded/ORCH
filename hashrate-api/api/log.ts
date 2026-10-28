import { wrap, param } from '../lib/http';
import { list, getJson } from '../lib/store';

export default wrap(async (req) => {
  const limit = Math.min(200, Number(param(req, 'limit') || 50) || 50);
  const metas = (await list('log/')).sort((a, b) => b.pathname.localeCompare(a.pathname)).slice(0, limit);
  const rows = await Promise.all(metas.map((m) => getJson<Record<string, unknown>>(m.url)));
  return rows.filter((r) => r.status === 'done' || r.status === 'pending');
});
