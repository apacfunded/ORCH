import { route, body } from '../lib/http.js';
import { readWallet } from '../lib/auth.js';
import { placeBet } from '../lib/engine.js';
export default route(['POST'], req => placeBet(readWallet(req), body(req)));
