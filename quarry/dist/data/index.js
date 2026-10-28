import { flags } from "../config/flags.js";
import { CodexMarketData } from "./CodexMarketData.js";
import { LiveMarketData } from "./LiveMarketData.js";
import { MockMarketData } from "./MockMarketData.js";
let instance = null;
export function market() {
    if (!instance)
        instance = flags.dataSource === "live" ? new LiveMarketData() : flags.dataSource === "codex" ? new CodexMarketData() : new MockMarketData();
    return instance;
}
/** Mock-only helpers (demo launch, live list). Returns null in live mode. */
export function mockMarket() {
    const m = market();
    return m instanceof MockMarketData ? m : null;
}
