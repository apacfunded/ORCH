import { route, body } from '../lib/http.js';
import { loginMessage, verifyLogin, b58decode, HttpError } from '../lib/auth.js';

// GET  /api/login?wallet=<address>  -> { message, issuedAt } to sign
// POST /api/login { wallet, issuedAt, signature(base64) } -> { token }
export default route(['GET', 'POST'], req => {
  if (req.method === 'GET') {
    const wallet = String(req.query?.wallet || '');
    const pk = b58decode(wallet);
    if (!pk || pk.length !== 32) throw new HttpError(400, 'That wallet address is not valid.');
    const issuedAt = new Date().toISOString();
    return { message: loginMessage(wallet, issuedAt), issuedAt };
  }
  const b = body(req);
  return { token: verifyLogin(b), wallet: b.wallet };
});
