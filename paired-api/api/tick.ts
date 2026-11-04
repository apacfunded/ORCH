// Public, idempotent worker tick: creates funded launches (at most every 15s) and claims/forwards fees (at most every 60s).
import { wrap, param } from '../lib/http.js';
import { processLaunches } from '../lib/launches.js';
import { claimAll, takeLock } from '../lib/claims.js';

export default wrap(async (req) => {
  const force = !!process.env.CRON_SECRET && param(req, 'secret') === process.env.CRON_SECRET;
  const doLaunches = force || (await takeLock('launch', 15_000));
  const doClaims = param(req, 'claims') !== '0' && (force || (await takeLock('claim', 60_000)));
  if (!doLaunches && !doClaims) return { ran: false, reason: 'ran recently' };
  const launches = doLaunches ? await processLaunches() : [];
  const claims = doClaims ? await claimAll() : [];
  return { ran: true, launches, claims };
});
