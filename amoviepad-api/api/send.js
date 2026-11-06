// POST { tx: base64 } -> { signature }
// Relays a fully signed pump.fun create transaction to Solana. Only pump.fun transactions are accepted.
import { wrap, body, bad } from '../lib/http.js';
import { rpc, PUMP_PROGRAM, b58decode } from '../lib/solana.js';
const PUMP = b58decode(PUMP_PROGRAM);
export default wrap(async (req) => {
  const b = body(req);
  const raw = Buffer.from(String(b.tx || ''), 'base64');
  if (raw.length < 100 || raw.length > 1232) throw bad('That transaction is not valid.');
  if (raw.indexOf(PUMP) < 0) throw bad('Only pump.fun launches can be sent here.');
  try {
    const signature = await rpc('sendTransaction', [raw.toString('base64'), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 5 }]);
    return { signature };
  } catch (e) {
    const m = String(e.message || '');
    if (/insufficient|lamports|0x1\b/i.test(m)) throw bad('Your wallet does not have enough SOL for the launch. Add SOL and try again.');
    if (/blockhash/i.test(m)) throw bad('The launch took too long to approve. Try the launch again.');
    throw bad(`Solana rejected the launch: ${m.slice(0, 160)}`);
  }
});
