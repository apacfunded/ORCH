import { route } from '../lib/http.js';
import { readWallet } from '../lib/auth.js';
import { getMe } from '../lib/engine.js';
export default route(['GET'], req => getMe(readWallet(req)));
