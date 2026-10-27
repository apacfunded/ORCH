// ============================================================
// MARKET DATA INTERFACE — every component reads from this.
// Implementations: MockMarketData (simulated) and CodexMarketData (live via proxy).
// ============================================================
export const RESOLUTION_SECONDS = {
    "1s": 1,
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "4h": 14400,
    "1D": 86400,
};
