// POST { tx: base64 } -> { signature }
// Relays a fully signed transaction to Solana. Only pump.fun launches and Streamflow locks are accepted.
import { wrap, body, bad } from '../lib/http.js';
import { rpc, PUMP_PROGRAM, STREAMFLOW_PROGRAM } from '../lib/solana.js';
const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58decode(s) { let n = 0n; for (const c of s) n = n * 58n + BigInt(A.indexOf(c)); const out = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; } for (const c of s) { if (c === '1') out.unshift(0); else break; } return Buffer.from(out); }
const ALLOWED = [b58decode(PUMP_PROGRAM), b58decode(STREAMFLOW_PROGRAM)];
export default wrap(async (req) => {
  const b = body(req);
  const raw = Buffer.from(String(b.tx || ''), 'base64');
  if (raw.length < 100 || raw.length > 1232) throw bad('That transaction is not valid.');
  if (!ALLOWED.some((p) => raw.indexOf(p) >= 0)) throw bad('Only Cuffed launches and locks can be sent here.');
  try {
    const signature = await rpc('sendTransaction', [raw.toString('base64'), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 5 }]);
    return { signature };
  } catch (e) {
    const m = String(e.message || '');
    if (/insufficient|lamports|0x1\b/i.test(m)) throw bad('Your wallet does not have enough SOL for this. Add SOL and try again.');
    if (/blockhash/i.test(m)) throw bad('That took too long to approve. Try again.');
    throw bad(`Solana rejected the transaction: ${m.slice(0, 160)}`);
  }
});
