// Minimal Solana JSON-RPC client + pump.fun trade-event reader.
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
const TX_OPTS = { commitment: 'confirmed', maxSupportedTransactionVersion: 1, encoding: 'json' };
/** Fetch a confirmed transaction, retrying while it propagates. */
export async function getTx(sig, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const tx = await rpc('getTransaction', [sig, TX_OPTS]).catch(() => null);
    if (tx) return tx;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 2500));
  }
  return null;
}
export const fetchTx = (sig) => rpc('getTransaction', [sig, TX_OPTS]);

const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58decode(s) { let n = 0n; for (const c of s) { const i = A.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); } const out = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; } for (const c of s) { if (c === '1') out.unshift(0); else break; } return Buffer.from(out); }
export function b58encode(buf) { let n = BigInt('0x' + (Buffer.from(buf).toString('hex') || '0')); let s = ''; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; } for (const b of buf) { if (b === 0) s = '1' + s; else break; } return s; }

const TRADE_EVENT = Buffer.from('bddb7fd34ee661ee', 'hex');
const EMIT_CPI = Buffer.from('e445a52e51cb9a1d', 'hex');
// pump.fun TradeEvent: mint(32) sol(8) token(8) is_buy(1) user(32) ts(8) 4x reserves(32)
// fee_recipient(32) fee_bps(8) fee(8) creator(32) creator_fee_bps(8) creator_fee(8) ...
function readTrade(d) {
  if (d.length < 225 || !d.subarray(0, 8).equals(TRADE_EVENT)) return null;
  return {
    mint: b58encode(d.subarray(8, 40)),
    sol: d.readBigUInt64LE(40),
    isBuy: d[56] === 1,
    creator: b58encode(d.subarray(177, 209)),
    creatorFee: d.readBigUInt64LE(217),
  };
}
/** All pump.fun trade events in a transaction (self-CPI events first, program logs as a fallback). */
export function tradesIn(tx) {
  const out = [];
  const keys = [...tx.transaction.message.accountKeys, ...(tx.meta?.loadedAddresses?.writable || []), ...(tx.meta?.loadedAddresses?.readonly || [])]
    .map((k) => (typeof k === 'string' ? k : k.pubkey));
  for (const group of tx.meta?.innerInstructions || []) {
    for (const ix of group.instructions) {
      if (keys[ix.programIdIndex] !== PUMP_PROGRAM) continue;
      let d; try { d = b58decode(ix.data); } catch { continue; }
      if (d.length > 16 && d.subarray(0, 8).equals(EMIT_CPI)) { const t = readTrade(d.subarray(8)); if (t) out.push(t); }
    }
  }
  if (out.length) return out;
  for (const line of tx.meta?.logMessages || []) {
    if (!line.startsWith('Program data: ')) continue;
    const t = readTrade(Buffer.from(line.slice(14), 'base64'));
    if (t) out.push(t);
  }
  return out;
}
