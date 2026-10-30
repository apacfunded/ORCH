import { store } from './store.js';
import { fetchPrices } from './prices.js';
import { HttpError } from './auth.js';
import {
  COINS, TF, TF_ORDER, LADDER, PAIRS, FEE, START_BAL, REFILL, MIN_BET, MAX_BET,
  MIN_VOL_24H, MIN_VOL_24H_FAST, lockMs, TICK_MIN_MS, PRICE_STALE_MS
} from './config.js';

const r6 = x => Math.round(x * 1e6) / 1e6;
const DAY = TF['1d'];
const dayStart = t => Math.floor(t / DAY) * DAY;
const FINE_EVERY = 20_000, FINE_MAX = 400;      // ~2.2h of 20s points
const COARSE_EVERY = 300_000, COARSE_MAX = 320; // ~26h of 5m points

export const fmtMc = v => (v >= 1e9 ? (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B'
  : v >= 1e6 ? (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M'
  : Math.round(v / 1e3) + 'K');

export function title(m) {
  if (m.kind === 'updown') return `$${m.coin} up or down · ${m.tf}`;
  if (m.kind === 'ladder') return `$${m.coin} above $${fmtMc(m.line)} at close`;
  return `$${m.coin} beats $${m.vs} today`;
}

function nice(v) {
  const e = 10 ** Math.floor(Math.log10(v));
  const steps = [1, 1.2, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];
  return steps.map(s => s * e).reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
}

function points(h) { return h ? [...(h.c || []), ...(h.f || [])] : []; }
function nearest(h, t, tol) {
  let best = null, bd = Infinity;
  for (const [ts, v] of points(h)) { const d = Math.abs(ts - t); if (d < bd) { bd = d; best = v; } }
  return bd <= tol ? best : null;
}

// ---------------- tick: prices -> settle -> open -> cache ----------------
export async function tick({ now = Date.now(), force = false } = {}) {
  const s = store();
  const last = Number((await s.get('tick:last')) || 0);
  if (!force && now - last < TICK_MIN_MS && now >= last) return { skipped: true };
  if (!(await s.set('lock:tick', now, { nx: true, px: 25_000 }))) return { skipped: true, locked: true };
  try {
    let px = null, pxErr = '';
    try { px = await fetchPrices(now); } catch (e) { pxErr = String(e?.message || e); }

    const latest = (await s.get('px:latest')) || {};
    const hist = (await s.get('px:hist')) || {};
    if (px) {
      for (const [sym, q] of Object.entries(px.coins)) {
        if (!q.mc) continue;
        latest[sym] = { ...q, ts: now };
        const h = hist[sym] || (hist[sym] = { f: [], c: [] });
        if (!h.f.length || now - h.f[h.f.length - 1][0] >= FINE_EVERY) h.f.push([now, q.mc]);
        if (!h.c.length || now - h.c[h.c.length - 1][0] >= COARSE_EVERY) h.c.push([now, q.mc]);
        if (h.f.length > FINE_MAX) h.f.splice(0, h.f.length - FINE_MAX);
        if (h.c.length > COARSE_MAX) h.c.splice(0, h.c.length - COARSE_MAX);
      }
      await s.set('px:latest', latest);
      await s.set('px:hist', hist);
    }

    let markets = (await s.get('markets')) || [];
    let pools = (await s.hgetall('pools')) || {};
    const keep = []; let settled = 0;
    for (const m of markets) {
      if (now < m.close) { keep.push(m); continue; }
      const res = resolve(m, hist, now);
      if (!res) { keep.push(m); continue; }
      await settle(s, m, res, pools, now);
      settled++;
    }
    markets = keep;
    if (px) openMarkets(markets, latest, hist, now);
    await s.set('markets', markets);
    await s.set('tick:last', now);
    pools = (await s.hgetall('pools')) || {};
    await buildState(s, { now, markets, latest, hist, pools, pxErr });
    return { ok: true, settled, open: markets.length, pxErr };
  } finally {
    await s.del('lock:tick');
  }
}

// Returns 'yes' | 'no' | 'void' | null (null = wait for data)
function resolve(m, hist, now) {
  const late = now - m.close;
  const tol = 90_000;
  if (m.kind === 'vs') {
    const a = nearest(hist[m.coin], m.close, tol), b = nearest(hist[m.vs], m.close, tol);
    if (a == null || b == null) return late > 15 * 60_000 ? 'void' : null;
    m.closeVal = [a, b];
    return a / m.base > b / m.vsBase ? 'yes' : 'no';
  }
  const v = nearest(hist[m.coin], m.close, tol);
  if (v == null) return late > 15 * 60_000 ? 'void' : null;
  m.closeVal = v;
  return v > m.line ? 'yes' : 'no';
}

async function settle(s, m, res, pools, now) {
  if (!(await s.set('done:' + m.id, now, { nx: true, px: 30 * 24 * 3600_000 }))) return; // already paid
  const y = Number(pools[m.id + ':y'] || 0), n = Number(pools[m.id + ':n'] || 0);
  let result = res;
  if (result !== 'void' && (y <= 0 || n <= 0)) result = 'void';
  const W = result === 'yes' ? y : n, L = result === 'yes' ? n : y;
  const bets = (await s.lrange('bets:' + m.id, 0, -1)) || [];
  for (const b of bets) {
    let payout = 0, status;
    if (result === 'void') { payout = b.amt; status = 'void'; }
    else if (b.side === result) { payout = b.amt + (b.amt / W) * L * (1 - FEE); status = 'won'; }
    else status = 'lost';
    payout = r6(payout);
    if (payout > 0) await s.hincr('bal', b.wallet, payout);
    if (status !== 'void') {
      await s.hincr('pnl', b.wallet, r6(payout - b.amt));
      await s.hincr('nset', b.wallet, 1);
      if (status === 'won') await s.hincr('wins', b.wallet, 1);
    }
    const rec = await s.hget('ub:' + b.wallet, b.id);
    if (rec) await s.hset('ub:' + b.wallet, { [b.id]: { ...rec, status, payout, result } });
  }
  if (result !== 'void' && L > 0) await s.hincr('house', 'fees', r6(L * FEE));
  await s.hdel('pools', m.id + ':y', m.id + ':n');
  await s.lpush('settled', {
    id: m.id, kind: m.kind, coin: m.coin, vs: m.vs || null, tf: m.tf || null,
    title: title(m), result, pool: r6(y + n), line: m.line ?? null, closeVal: m.closeVal ?? null,
    start: m.start, close: m.close, bets: bets.length, ts: now
  });
  await s.ltrim('settled', 0, 49);
}

function openMarkets(markets, latest, hist, now) {
  const have = new Set(markets.map(m => m.id));
  const ds = dayStart(now), de = ds + DAY;
  const dayLock = lockMs(DAY);
  const fresh = sym => { const q = latest[sym]; return q && q.mc && now - q.ts < PRICE_STALE_MS ? q : null; };

  for (const c of COINS) {
    const q = fresh(c.sym);
    if (!q || q.vol24 < MIN_VOL_24H) continue;
    for (const tf of c.tfs) {
      if ((tf === '5m' || tf === '15m') && q.vol24 < MIN_VOL_24H_FAST) continue;
      const dur = TF[tf], start = Math.floor(now / dur) * dur, id = `ud:${c.sym}:${tf}:${start}`;
      if (have.has(id)) continue;
      let line = nearest(hist[c.sym], start, 30_000), st = start;
      if (line == null) {
        if (now - start > dur * 0.25) continue;        // too late to open this round fairly
        line = q.mc; st = now;                          // opened late: price to beat = now
      }
      markets.push({ id, kind: 'updown', coin: c.sym, tf, start: st, close: start + dur, lockAt: start + dur - lockMs(dur), line });
      have.add(id);
    }
    // daily ladder (one set of strikes per coin per day)
    if (de - now > dayLock + 60_000 && !markets.some(m => m.kind === 'ladder' && m.coin === c.sym && m.close === de)) {
      const ref = nearest(hist[c.sym], ds, 120_000) ?? q.mc;
      for (const S of [...new Set(LADDER.map(f => nice(ref * f)))]) {
        const id = `lad:${c.sym}:${ds}:${S}`;
        if (have.has(id)) continue;
        markets.push({ id, kind: 'ladder', coin: c.sym, start: now, close: de, lockAt: de - dayLock, line: S, ref });
        have.add(id);
      }
    }
  }
  for (const [a, b] of PAIRS) {
    const qa = fresh(a), qb = fresh(b);
    if (!qa || !qb || qa.vol24 < MIN_VOL_24H || qb.vol24 < MIN_VOL_24H) continue;
    const id = `vs:${a}:${b}:${ds}`;
    if (have.has(id) || de - now < dayLock + 60_000) continue;
    markets.push({ id, kind: 'vs', coin: a, vs: b, start: now, close: de, lockAt: de - dayLock, base: qa.mc, vsBase: qb.mc });
    have.add(id);
  }
  markets.sort((x, y) => x.close - y.close);
}

async function buildState(s, { now, markets, latest, hist, pools, pxErr }) {
  const [settled, pnl, wins, nset] = await Promise.all([
    s.lrange('settled', 0, 24), s.hgetall('pnl'), s.hgetall('wins'), s.hgetall('nset')
  ]);
  const leaders = Object.entries(pnl || {})
    .map(([w, v]) => ({ wallet: w, pnl: r6(Number(v)), bets: Number(nset?.[w] || 0), hit: nset?.[w] ? Number(wins?.[w] || 0) / Number(nset[w]) : 0 }))
    .filter(x => x.bets > 0).sort((a, b) => b.pnl - a.pnl).slice(0, 10);
  const coins = COINS.map(c => {
    const q = latest[c.sym] || null;
    const f = hist[c.sym]?.f || [];
    return {
      sym: c.sym, name: c.name, mint: c.mint, color: c.color,
      ...(q || {}), stale: !q || now - q.ts > PRICE_STALE_MS,
      hist: f.slice(-90), histDay: (hist[c.sym]?.c || []).slice(-290)
    };
  });
  const state = {
    now, fee: FEE, play: true, pxErr,
    coins,
    markets: markets.map(m => ({ ...m, title: title(m), y: r6(Number(pools[m.id + ':y'] || 0)), n: r6(Number(pools[m.id + ':n'] || 0)) })),
    settled: settled || [],
    leaders
  };
  await s.set('state:cache', state);
  return state;
}

export async function getState() {
  const s = store();
  await tick().catch(() => {});
  let st = await s.get('state:cache');
  if (!st) { await tick({ force: true }); st = await s.get('state:cache'); }
  return st;
}

// ---------------- player actions ----------------
async function withWalletLock(wallet, fn) {
  const s = store();
  if (!(await s.set('lock:w:' + wallet, 1, { nx: true, px: 8_000 }))) throw new HttpError(429, 'Your last action is still going through. Try again in a second.');
  try { return await fn(s); } finally { await s.del('lock:w:' + wallet); }
}

export async function placeBet(wallet, { marketId, side, amount }, now = Date.now()) {
  if (side !== 'yes' && side !== 'no') throw new HttpError(400, 'Pick a side first.');
  const amt = Math.round(Number(amount) * 1e4) / 1e4;
  if (!isFinite(amt) || amt < MIN_BET) throw new HttpError(400, `The smallest stake is ${MIN_BET} SOL.`);
  if (amt > MAX_BET) throw new HttpError(400, `The largest stake is ${MAX_BET} SOL per bet.`);
  return withWalletLock(wallet, async s => {
    const markets = (await s.get('markets')) || [];
    const m = markets.find(x => x.id === marketId);
    if (!m) throw new HttpError(404, 'This market has closed. Pick another one.');
    if (now >= m.lockAt) throw new HttpError(409, 'Betting is locked for this round.');
    await s.hsetnx('bal', wallet, START_BAL);
    const bal = Number(await s.hget('bal', wallet));
    if (bal < amt) throw new HttpError(400, `You have ${bal.toFixed(2)} play SOL. Lower your stake.`);
    const nb = await s.hincr('bal', wallet, -amt);
    const id = `${m.id}|${now}|${Math.random().toString(36).slice(2, 8)}`;
    await s.lpush('bets:' + m.id, { id, wallet, side, amt, ts: now });
    await s.hincr('pools', `${m.id}:${side === 'yes' ? 'y' : 'n'}`, amt);
    await s.hset('ub:' + wallet, { [id]: { id, marketId: m.id, kind: m.kind, title: title(m), side, amt, ts: now, close: m.close, status: 'open' } });
    await s.hincr('wagered', wallet, amt);
    const y = Number((await s.hget('pools', m.id + ':y')) || 0), n = Number((await s.hget('pools', m.id + ':n')) || 0);
    return { ok: true, bal: r6(nb), market: { id: m.id, y: r6(y), n: r6(n) } };
  });
}

export async function getMe(wallet) {
  const s = store();
  await s.hsetnx('bal', wallet, START_BAL);
  const [bal, ub, pnl, wins, nset] = await Promise.all([
    s.hget('bal', wallet), s.hgetall('ub:' + wallet), s.hget('pnl', wallet), s.hget('wins', wallet), s.hget('nset', wallet)
  ]);
  const bets = Object.values(ub || {}).sort((a, b) => b.ts - a.ts).slice(0, 40);
  return { wallet, bal: r6(Number(bal || 0)), pnl: r6(Number(pnl || 0)), wins: Number(wins || 0), settled: Number(nset || 0), bets };
}

export async function refill(wallet) {
  return withWalletLock(wallet, async s => {
    await s.hsetnx('bal', wallet, START_BAL);
    const bal = Number(await s.hget('bal', wallet));
    if (bal >= 1) throw new HttpError(400, 'You can claim more once you have under 1 play SOL.');
    if (!(await s.set('refill:' + wallet, 1, { nx: true, px: 24 * 3600_000 }))) throw new HttpError(429, 'You already claimed today. Come back tomorrow.');
    return { ok: true, bal: r6(await s.hincr('bal', wallet, REFILL)) };
  });
}

export { TF_ORDER };
