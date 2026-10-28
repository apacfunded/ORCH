import { wrap, param } from '../lib/http.js';
import { linkMessage } from '../lib/link.js';

export default wrap(async (req) => {
  const issuedAt = Date.now();
  return { message: linkMessage(param(req, 'wallet'), param(req, 'chain').toUpperCase(), param(req, 'address'), issuedAt), issuedAt };
});
