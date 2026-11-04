// Shared helpers for the Node-style Vercel function handlers.
import { CFG } from './config.js';

export type Req = { method?: string; url?: string; query: Record<string, string | string[] | undefined>; body?: unknown; headers: Record<string, string | string[] | undefined> };
export type Res = { status: (n: number) => Res; setHeader: (k: string, v: string) => void; json: (b: unknown) => void; end: (s?: string) => void };

export function cors(res: Res) {
  res.setHeader('access-control-allow-origin', CFG.allowOrigin);
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('cache-control', 'no-store');
}

export function wrap(fn: (req: Req, res: Res) => Promise<unknown>) {
  return async (req: Req, res: Res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    try {
      const out = await fn(req, res);
      if (out !== undefined) res.status(200).json(out);
    } catch (e) {
      const msg = (e as Error).message || 'Something went wrong on our side. Try again in a minute.';
      const client = (e as { client?: boolean }).client;
      console.error(e);
      res.status(client ? 400 : 500).json({ error: client ? msg : 'Something went wrong on our side. Try again in a minute.' });
    }
  };
}

export function clientError(msg: string): Error { const e = new Error(msg); (e as { client?: boolean }).client = true; return e; }
export function param(req: Req, k: string): string { const v = req.query[k]; return Array.isArray(v) ? v[0] ?? '' : v ?? ''; }
