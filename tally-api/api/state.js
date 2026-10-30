import { route } from '../lib/http.js';
import { getState } from '../lib/engine.js';
export default route(['GET'], () => getState());
