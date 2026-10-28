import { wrap, clientError } from '../lib/http.js';
import { verifyLink } from '../lib/link.js';
import { putJson } from '../lib/store.js';

export default wrap(async (req) => {
  if (req.method !== 'POST') throw clientError('POST a signed link.');
  const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Record<string, unknown>;
  const saved = verifyLink(body);
  await putJson(`links/${saved.wallet}/${saved.chain}.json`, { ...saved, signed_at: Date.now() }, true);
  return { ok: true, ...saved };
});
