// Admin: record mining activity you ran by hand so it shows on the site.
// POST { secret, mint?, kind: 'rent'|'mined'|'buy'|'payout', chain?, amount, unit, ref?, note? }
import { wrap, clientError } from '../../lib/http.js';
import { logLine } from '../../lib/store.js';

const KINDS = ['rent', 'mined', 'buy', 'payout', 'claim', 'split'];

export default wrap(async (req) => {
  if (req.method !== 'POST') throw clientError('POST a ledger entry.');
  const b = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Record<string, unknown>;
  if (!process.env.CRON_SECRET || b.secret !== process.env.CRON_SECRET) throw clientError('Wrong secret.');
  const kind = String(b.kind ?? '');
  if (!KINDS.includes(kind)) throw clientError(`kind must be one of ${KINDS.join(', ')}`);
  const amount = Number(b.amount);
  if (!(amount >= 0)) throw clientError('amount must be a number.');
  const entry = {
    mint: b.mint ? String(b.mint) : undefined, kind, chain: b.chain ? String(b.chain).toUpperCase() : undefined,
    amount, unit: String(b.unit ?? b.chain ?? 'USD').toUpperCase(), ref: b.ref ? String(b.ref) : undefined,
    status: 'done' as const, note: b.note ? String(b.note).slice(0, 200) : undefined,
  };
  await logLine(entry);
  return { ok: true, entry };
});
