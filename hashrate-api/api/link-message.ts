import { wrap, param } from '../lib/http';
import { linkMessage } from '../lib/link';

export default wrap(async (req) => {
  const issuedAt = Date.now();
  return { message: linkMessage(param(req, 'wallet'), param(req, 'chain').toUpperCase(), param(req, 'address'), issuedAt), issuedAt };
});
