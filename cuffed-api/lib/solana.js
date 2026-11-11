// Minimal Solana JSON-RPC client.
export const RPC_URL = () => process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const RPCS = () => [process.env.SOLANA_RPC_URL, 'https://api.mainnet-beta.solana.com'].filter(Boolean);
export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const STREAMFLOW_PROGRAM = 'strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m';
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
/** Account keys of a fetched tx, including address-table lookups. */
export function txKeys(tx) {
  const m = tx.transaction.message;
  const keys = m.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
  const la = tx.meta?.loadedAddresses; if (la) keys.push(...(la.writable || []), ...(la.readonly || []));
  return { keys, signers: keys.slice(0, m.header.numRequiredSignatures) };
}
/** Total raw balance + decimals the owner holds of a mint (SPL or Token-2022). */
export async function tokenBalance(owner, mint) {
  const r = await rpc('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  let raw = 0n, decimals = 6;
  for (const a of r?.value || []) { const t = a.account.data.parsed.info.tokenAmount; raw += BigInt(t.amount); decimals = t.decimals; }
  return { raw, decimals };
}
