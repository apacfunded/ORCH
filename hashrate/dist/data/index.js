import { MockMarketData } from './MockMarketData.js';
import { RigApiData } from './RigApiData.js';
let instance = null;
/** The site's single data source. window.RIG_CONFIG.dataSource = "live" + apiUrl switches to the backend. */
export function data() {
    if (instance)
        return instance;
    const cfg = window.RIG_CONFIG ?? {};
    instance = cfg.dataSource === 'live' && cfg.apiUrl ? new RigApiData(cfg.apiUrl) : new MockMarketData();
    return instance;
}
