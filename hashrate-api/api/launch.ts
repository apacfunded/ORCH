import { wrap, clientError } from '../lib/http';
import { createLaunch } from '../lib/launches';

export default wrap(async (req) => {
  if (req.method !== 'POST') throw clientError('POST a launch request.');
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!body || typeof body !== 'object') throw clientError('Send JSON in the request body.');
  try { return await createLaunch(body as Record<string, unknown>); }
  catch (e) { throw clientError((e as Error).message); }
});
