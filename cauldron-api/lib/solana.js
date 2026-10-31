// Minimal Solana JSON-RPC client.
const RPCS = () => [process.env.SOLANA_RPC_URL, 'https://api.mainnet-beta.solana.com'].filter(Boolean);
export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export async function rpc(method, params) {
  let last;
  for (const url of RPCS()) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(`${method}: ${j.error.message}`);
      return j.result;
    } catch (e) { last = e; }
  }
  throw last;
}
/** Fetch a confirmed transaction, retrying while it propagates. */
export async function getTx(sig, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const tx = await rpc('getTransaction', [sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0, encoding: 'json' }]).catch(() => null);
    if (tx) return tx;
    await new Promise((r) => setTimeout(r, 2500));
  }
  return null;
}
