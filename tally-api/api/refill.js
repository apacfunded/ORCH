import { route } from '../lib/http.js';
import { readWallet } from '../lib/auth.js';
import { refill } from '../lib/engine.js';
export default route(['POST'], req => refill(readWallet(req)));
