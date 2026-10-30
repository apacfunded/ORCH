// Runs the engine through simulated time with mock prices and an in-memory store.
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { tick, placeBet, getMe, getState } from '../lib/engine.js';
import { loginMessage, verifyLogin, readWallet } from '../lib/auth.js';
import { store } from '../lib/store.js';
import { FEE, START_BAL } from '../lib/config.js';

const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = buf => { let n = BigInt('0x' + buf.toString('hex')), s = ''; while (n > 0n) { s = ALPHA[Number(n % 58n)] + s; n /= 58n; } for (const b of buf) { if (b === 0) s = '1' + s; else break; } return s; };
function newWallet() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(12);
  return { address: b58(raw), privateKey };
}
function login(w) {
  const issuedAt = new Date().toISOString();
  const sig = crypto.sign(null, Buffer.from(loginMessage(w.address, issuedAt)), w.privateKey).toString('base64');
  const token = verifyLogin({ wallet: w.address, issuedAt, signature: sig });
  return readWallet({ headers: { authorization: 'Bearer ' + token } });
}
const near = (a, b) => Math.abs(a - b) < 1e-4;

const A = newWallet(), B = newWallet(), C = newWallet();
const a = login(A), b = login(B), c = login(C);
assert.equal(a, A.address); console.log('✓ wallet sign-in verifies ed25519 signatures');

// bad signature is rejected
assert.throws(() => verifyLogin({ wallet: A.address, issuedAt: new Date().toISOString(), signature: Buffer.alloc(64).toString('base64') }), /does not match/);
console.log('✓ forged signature rejected');

const P = 300_000;
const t0 = Math.floor(Date.now() / P) * P + P + 5_000; // 5s into a fresh 5m round
await tick({ now: t0 - 10_000, force: true });           // a price point just before the round
const r0 = await tick({ now: t0, force: true });
const st = (await store().get('state:cache'));
console.log(`✓ engine opened ${r0.open} markets:`, Object.entries(st.markets.reduce((o, m) => (o[m.kind] = (o[m.kind] || 0) + 1, o), {})).map(([k, v]) => `${v} ${k}`).join(', '));
const m5 = st.markets.find(m => m.kind === 'updown' && m.coin === 'FARTCOIN' && m.tf === '5m');
assert.ok(m5, '5m FARTCOIN round exists');
assert.equal(m5.start % P, 0, 'round starts on the 5m boundary');

await placeBet(a, { marketId: m5.id, side: 'yes', amount: 2 }, t0 + 1000);
await placeBet(b, { marketId: m5.id, side: 'no', amount: 3 }, t0 + 2000);
await placeBet(c, { marketId: m5.id, side: 'yes', amount: 1 }, t0 + 3000);
await assert.rejects(placeBet(a, { marketId: m5.id, side: 'yes', amount: 50 }, t0 + 4000), /largest stake/);
await assert.rejects(placeBet(a, { marketId: m5.id, side: 'yes', amount: 1 }, m5.lockAt + 1), /locked/);
console.log('✓ bets placed; oversize and locked bets rejected');

// single-sided market -> void + refund
const m15 = st.markets.find(m => m.kind === 'updown' && m.coin === 'MOODENG' && m.tf === '5m');
await placeBet(a, { marketId: m15.id, side: 'no', amount: 1 }, t0 + 5000);

// advance through the round with ticks every 20s, then settle
for (let t = t0 + 20_000; t <= m5.close + 5_000; t += 20_000) await tick({ now: t, force: true });
await tick({ now: m5.close + 10_000, force: true });

const settled = await store().lrange('settled', 0, -1);
const s5 = settled.find(x => x.id === m5.id), sv = settled.find(x => x.id === m15.id);
assert.ok(s5 && sv, 'both rounds settled');
console.log(`✓ round settled: line ${s5.line.toFixed(0)} -> close ${s5.closeVal.toFixed(0)} = ${s5.result.toUpperCase()}`);
assert.equal(sv.result, 'void'); console.log('✓ one-sided round voided');

const [ma, mb, mc] = await Promise.all([getMe(a), getMe(b), getMe(c)]);
const Y = 3, N = 3;
if (s5.result === 'yes') {
  assert.ok(near(ma.bal, START_BAL - 2 + 2 + (2 / Y) * N * (1 - FEE)), 'A payout');
  assert.ok(near(mb.bal, START_BAL - 3), 'B lost');
} else {
  assert.ok(near(mb.bal, START_BAL - 3 + 3 + Y * (1 - FEE)), 'B payout');
}
const total = ma.bal + mb.bal + mc.bal;
assert.ok(near(total, 3 * START_BAL - N * FEE * (s5.result === 'yes' ? 1 : 0) - (s5.result === 'no' ? Y * FEE : 0)), 'balances conserve minus fee');
console.log(`✓ payouts correct: A ${ma.bal.toFixed(4)}  B ${mb.bal.toFixed(4)}  C ${mc.bal.toFixed(4)} (fee ${(3 * START_BAL - total).toFixed(4)})`);
assert.equal(ma.bets.find(x => x.marketId === m15.id).status, 'void');

// settling again must not pay twice
await tick({ now: m5.close + 40_000, force: true });
const ma2 = await getMe(a); assert.ok(near(ma2.bal, ma.bal)); console.log('✓ no double payout on later ticks');

// next round opened with price to beat = price at boundary
const st2 = await store().get('state:cache');
const next = st2.markets.find(m => m.kind === 'updown' && m.coin === 'FARTCOIN' && m.tf === '5m');
assert.ok(next && next.start === m5.close); console.log('✓ next 5m round opened on time');
console.log('✓ leaderboard:', st2.leaders.map(l => `${l.wallet.slice(0, 4)}… ${l.pnl >= 0 ? '+' : ''}${l.pnl.toFixed(3)}`).join('  '));
console.log('\nAll engine tests passed.');
