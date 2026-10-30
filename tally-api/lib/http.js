import { HttpError } from './auth.js';

// Wraps a handler so errors come back as { error } with the right status.
// CORS: the site can live on another domain (e.g. orch.lol/tally) — set ALLOW_ORIGIN.
export function route(methods, fn) {
  return async (req, res) => {
    const allowed = (process.env.ALLOW_ORIGIN || '*').split(',').map(s => s.trim());
    const origin = req.headers?.origin;
    res.setHeader('Access-Control-Allow-Origin', allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : allowed[0]));
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
    if (!methods.includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
    try {
      const out = await fn(req, res);
      if (!res.writableEnded) res.status(200).json(out);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      res.status(status).json({ error: status === 500 ? 'Something went wrong on our side. Try again in a moment.' : e.message });
    }
  };
}

export const body = req => (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {});
