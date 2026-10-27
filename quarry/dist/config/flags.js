// ============================================================
// FEATURE FLAGS — switch the data source and demo behaviour here.
// There is no bundler, so VITE_DATA_SOURCE is read from a <meta> tag or
// window.PIT_CONFIG in index.html instead of import.meta.env.
// ============================================================
const w = globalThis.PIT_CONFIG ?? {};
export const flags = {
    /** "mock" = simulated coins (default). "codex" = live data via the proxy. */
    dataSource: (w.dataSource ?? "mock"),
    /** CONFIG: URL of the deployed /proxy worker, e.g. https://pit-proxy.yourname.workers.dev */
    proxyUrl: w.proxyUrl ?? "",
    /** CONFIG: Solana RPC used only for the connected wallet's SOL balance. */
    rpcUrl: w.rpcUrl ?? "https://api.mainnet-beta.solana.com",
    /** Fake coins are launched this often in mock mode (ms range). */
    mockLaunchEveryMs: [8000, 20000],
    /** Fake trades stream this often in mock mode (ms range). */
    mockTradeEveryMs: [300, 2000],
};
export const isDemo = () => flags.dataSource === "mock";
