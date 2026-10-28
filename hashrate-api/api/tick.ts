// Public, idempotent worker tick: creates funded launches and claims/forwards fees.
// Anyone may call it; a 60s lock keeps it from running more than once a minute.
import { wrap, param } from '../lib/http';
import { processLaunches } from '../lib/launches';
import { claimAll, takeTickLock } from '../lib/claims';

export default wrap(async (req) => {
  const force = process.env.CRON_SECRET && param(req, 'secret') === process.env.CRON_SECRET;
  if (!force && !(await takeTickLock())) return { ran: false, reason: 'ran recently' };
  const launches = await processLaunches();
  const claims = param(req, 'claims') === '0' ? [] : await claimAll();
  return { ran: true, launches, claims };
});
