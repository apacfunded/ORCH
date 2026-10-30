// Tiny key-value layer. Uses Upstash Redis over its REST API when configured,
// otherwise an in-memory store (fine for local dev; NOT for production).

const enc = v => JSON.stringify(v);
const dec = v => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
};

function redisStore(url, token) {
  async function cmd(...args) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args.map(a => (typeof a === 'string' ? a : String(a))))
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error('Store error: ' + (j.error || r.status));
    return j.result;
  }
  return {
    kind: 'redis',
    async get(k) { return dec(await cmd('GET', k)); },
    async set(k, v, o = {}) {
      const a = ['SET', k, enc(v)];
      if (o.px) a.push('PX', o.px);
      if (o.nx) a.push('NX');
      return (await cmd(...a)) === 'OK';
    },
    async del(...k) { return cmd('DEL', ...k); },
    async hget(k, f) { return dec(await cmd('HGET', k, f)); },
    async hset(k, obj) {
      const a = ['HSET', k];
      for (const [f, v] of Object.entries(obj)) a.push(f, enc(v));
      return cmd(...a);
    },
    async hsetnx(k, f, v) { return (await cmd('HSETNX', k, f, enc(v))) === 1; },
    async hdel(k, ...f) { return f.length ? cmd('HDEL', k, ...f) : 0; },
    async hincr(k, f, n) { return Number(await cmd('HINCRBYFLOAT', k, f, n)); },
    async hgetall(k) {
      const arr = (await cmd('HGETALL', k)) || [];
      const o = {};
      for (let i = 0; i < arr.length; i += 2) o[arr[i]] = dec(arr[i + 1]);
      return o;
    },
    async lpush(k, v) { return cmd('LPUSH', k, enc(v)); },
    async lrange(k, a, b) { return ((await cmd('LRANGE', k, a, b)) || []).map(dec); },
    async ltrim(k, a, b) { return cmd('LTRIM', k, a, b); }
  };
}

function memStore() {
  const m = new Map(); const exp = new Map();
  const alive = k => { const e = exp.get(k); if (e && e < Date.now()) { m.delete(k); exp.delete(k); } return m.has(k); };
  const clone = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const hash = k => { if (!alive(k)) m.set(k, {}); return m.get(k); };
  const list = k => { if (!alive(k)) m.set(k, []); return m.get(k); };
  return {
    kind: 'memory',
    async get(k) { return alive(k) ? clone(m.get(k)) : null; },
    async set(k, v, o = {}) {
      if (o.nx && alive(k)) return false;
      m.set(k, clone(v)); if (o.px) exp.set(k, Date.now() + o.px); else exp.delete(k);
      return true;
    },
    async del(...ks) { ks.forEach(k => { m.delete(k); exp.delete(k); }); return ks.length; },
    async hget(k, f) { return alive(k) ? clone(m.get(k)[f]) ?? null : null; },
    async hset(k, obj) { const h = hash(k); for (const [f, v] of Object.entries(obj)) h[f] = clone(v); return 1; },
    async hsetnx(k, f, v) { const h = hash(k); if (f in h) return false; h[f] = clone(v); return true; },
    async hdel(k, ...f) { const h = hash(k); f.forEach(x => delete h[x]); return f.length; },
    async hincr(k, f, n) { const h = hash(k); h[f] = Number(h[f] || 0) + Number(n); return h[f]; },
    async hgetall(k) { return alive(k) ? clone(m.get(k)) : {}; },
    async lpush(k, v) { const l = list(k); l.unshift(clone(v)); return l.length; },
    async lrange(k, a, b) { const l = alive(k) ? m.get(k) : []; return clone(l.slice(a, b === -1 ? undefined : b + 1)); },
    async ltrim(k, a, b) { const l = list(k); m.set(k, l.slice(a, b === -1 ? undefined : b + 1)); return 'OK'; }
  };
}

// Postgres (Neon) over Neon's HTTP SQL endpoint. No driver needed.
function pgStore(connStr, prefix) {
  const u = new URL(connStr);
  const host = u.hostname.replace('-pooler.', '.');
  const endpoint = `https://${host}/sql`;
  const KV = `${prefix}_kv`, H = `${prefix}_h`, L = `${prefix}_l`;
  async function q(query, params = []) {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': connStr, 'Neon-Raw-Text-Output': 'true', 'Neon-Array-Mode': 'true' },
      body: JSON.stringify({ query, params: params.map(p => (p === null || p === undefined ? null : String(p))) })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('DB error: ' + (j.message || r.status));
    return j.rows || [];
  }
  let ready;
  const init = () => ready || (ready = (async () => {
    await q(`CREATE TABLE IF NOT EXISTS ${KV} (k text PRIMARY KEY, v jsonb, exp timestamptz)`);
    await q(`CREATE TABLE IF NOT EXISTS ${H} (k text, f text, v jsonb, PRIMARY KEY (k, f))`);
    await q(`CREATE TABLE IF NOT EXISTS ${L} (id bigserial PRIMARY KEY, k text NOT NULL, v jsonb)`);
    await q(`CREATE INDEX IF NOT EXISTS ${L}_k_id ON ${L} (k, id DESC)`);
  })().catch(e => { ready = null; throw e; }));
  const run = async (sql, p) => { await init(); return q(sql, p); };
  const exp = o => (o.px ? new Date(Date.now() + o.px).toISOString() : null);
  return {
    kind: 'postgres',
    async get(k) { const r = await run(`SELECT v FROM ${KV} WHERE k=$1 AND (exp IS NULL OR exp > now())`, [k]); return r.length ? dec(r[0][0]) : null; },
    async set(k, v, o = {}) {
      if (o.nx) {
        await run(`DELETE FROM ${KV} WHERE k=$1 AND exp IS NOT NULL AND exp <= now()`, [k]);
        const r = await run(`INSERT INTO ${KV} (k, v, exp) VALUES ($1, $2::jsonb, $3::timestamptz) ON CONFLICT (k) DO NOTHING RETURNING k`, [k, enc(v), exp(o)]);
        return r.length > 0;
      }
      await run(`INSERT INTO ${KV} (k, v, exp) VALUES ($1, $2::jsonb, $3::timestamptz) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, exp = EXCLUDED.exp`, [k, enc(v), exp(o)]);
      return true;
    },
    async del(...ks) {
      for (const k of ks) { await run(`DELETE FROM ${KV} WHERE k=$1`, [k]); }
      return ks.length;
    },
    async hget(k, f) { const r = await run(`SELECT v FROM ${H} WHERE k=$1 AND f=$2`, [k, f]); return r.length ? dec(r[0][0]) : null; },
    async hset(k, obj) {
      for (const [f, v] of Object.entries(obj)) await run(`INSERT INTO ${H} (k, f, v) VALUES ($1, $2, $3::jsonb) ON CONFLICT (k, f) DO UPDATE SET v = EXCLUDED.v`, [k, f, enc(v)]);
      return 1;
    },
    async hsetnx(k, f, v) { const r = await run(`INSERT INTO ${H} (k, f, v) VALUES ($1, $2, $3::jsonb) ON CONFLICT (k, f) DO NOTHING RETURNING f`, [k, f, enc(v)]); return r.length > 0; },
    async hdel(k, ...f) { for (const x of f) await run(`DELETE FROM ${H} WHERE k=$1 AND f=$2`, [k, x]); return f.length; },
    async hincr(k, f, n) {
      const r = await run(`INSERT INTO ${H} (k, f, v) VALUES ($1, $2, to_jsonb($3::numeric)) ON CONFLICT (k, f) DO UPDATE SET v = to_jsonb(COALESCE((${H}.v #>> '{}')::numeric, 0) + $3::numeric) RETURNING v`, [k, f, Number(n)]);
      return Number(dec(r[0][0]));
    },
    async hgetall(k) { const r = await run(`SELECT f, v FROM ${H} WHERE k=$1`, [k]); const o = {}; for (const [f, v] of r) o[f] = dec(v); return o; },
    async lpush(k, v) { await run(`INSERT INTO ${L} (k, v) VALUES ($1, $2::jsonb)`, [k, enc(v)]); return 1; },
    async lrange(k, a, b) {
      const lim = b === -1 ? 'ALL' : String(Math.max(0, b - a + 1));
      const r = await run(`SELECT v FROM ${L} WHERE k=$1 ORDER BY id DESC OFFSET $2 LIMIT ${lim}`, [k, a]);
      return r.map(x => dec(x[0]));
    },
    async ltrim(k, a, b) {
      await run(`DELETE FROM ${L} WHERE k=$1 AND id NOT IN (SELECT id FROM ${L} WHERE k=$1 ORDER BY id DESC OFFSET $2 LIMIT $3)`, [k, a, b - a + 1]);
      return 'OK';
    }
  };
}

let impl;
export function store() {
  if (impl) return impl;
  const db = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (db) return (impl = pgStore(db, (process.env.DB_PREFIX || 'tally').replace(/[^a-z0-9_]/gi, '')));
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  impl = url && token ? redisStore(url.replace(/\/$/, ''), token) : memStore();
  return impl;
}
