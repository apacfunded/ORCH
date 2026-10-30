import { route } from '../lib/http.js';
import { tick } from '../lib/engine.js';
import { HttpError } from '../lib/auth.js';

// Hit this every minute (Vercel Cron on Pro, or a free pinger like cron-job.org):
//   GET /api/cron?key=<CRON_SECRET>   or   Authorization: Bearer <CRON_SECRET>
export default route(['GET', 'POST'], async req => {
  const secret = process.env.CRON_SECRET;
  const given = req.query?.key || (req.headers?.authorization || '').replace(/^Bearer /, '');
  if (!secret || given !== secret) throw new HttpError(401, 'Bad or missing cron key.');
  return tick({ force: true });
});
