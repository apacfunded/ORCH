// Shared helpers for Vercel Node functions.
export function cors(res) {
  res.setHeader('access-control-allow-origin', process.env.ALLOW_ORIGIN || '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('cache-control', 'no-store');
}
export function wrap(fn) {
  return async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    try {
      const out = await fn(req, res);
      if (out !== undefined) res.status(200).json(out);
    } catch (e) {
      console.error(e);
      const client = e && e.client;
      res.status(client ? 400 : 500).json({ error: client ? e.message : 'Something went wrong on our side. Try again in a minute.' });
    }
  };
}
export function bad(msg) { const e = new Error(msg); e.client = true; return e; }
export function body(req) {
  if (req.method !== 'POST') throw bad('Use POST.');
  const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  return b;
}
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export function pubkey(v, label) { if (typeof v !== 'string' || !B58.test(v)) throw bad(`${label} is not a valid Solana address.`); return v; }
export function clean(v, max) { return String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
export function ticker(v) {
  const t = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.length < 2 || t.length > 10) throw bad('Ticker must be 2 to 10 letters or numbers.');
  return t;
}
