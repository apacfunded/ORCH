// Tiny append-only store on Vercel Blob (REST, no SDK).
// Every record is an immutable file; state is derived from listings, which are never cached.
const API = 'https://blob.vercel-storage.com';

function token(): string {
  const t = process.env.BLOB_READ_WRITE_TOKEN;
  if (!t) throw new Error('BLOB_READ_WRITE_TOKEN is not set.');
  return t;
}

export interface BlobMeta { url: string; downloadUrl?: string; pathname: string; size: number; uploadedAt: string }

/** Write a JSON file. Overwrites only when `overwrite` is true. */
export async function putJson(pathname: string, value: unknown, overwrite = false): Promise<BlobMeta> {
  const r = await fetch(`${API}/${pathname}`, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token()}`,
      'x-api-version': '7',
      'x-content-type': 'application/json',
      'x-add-random-suffix': '0',
      'x-allow-overwrite': overwrite ? '1' : '0',
      'x-cache-control-max-age': '60',
    },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`Blob write failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as BlobMeta;
}

/** List files under a prefix (authoritative, uncached). */
export async function list(prefix: string): Promise<BlobMeta[]> {
  const out: BlobMeta[] = [];
  let cursor = '';
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ prefix, limit: '1000', mode: 'expanded' });
    if (cursor) q.set('cursor', cursor);
    const r = await fetch(`${API}/?${q}`, { headers: { authorization: `Bearer ${token()}`, 'x-api-version': '7' } });
    if (!r.ok) throw new Error(`Blob list failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { blobs: BlobMeta[]; cursor?: string; hasMore?: boolean };
    out.push(...(j.blobs ?? []));
    if (!j.hasMore || !j.cursor) break;
    cursor = j.cursor;
  }
  return out;
}

/** Read one JSON file by its blob URL. Immutable files, so CDN caching is harmless. */
export async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { authorization: `Bearer ${token()}` } });
  if (!r.ok) throw new Error(`Blob read failed (${r.status}) for ${url}`);
  return (await r.json()) as T;
}

/** Read every JSON file under a prefix, newest path last. */
export async function readAll<T>(prefix: string): Promise<{ meta: BlobMeta; data: T }[]> {
  const metas = (await list(prefix)).sort((a, b) => a.pathname.localeCompare(b.pathname));
  const data = await Promise.all(metas.map((m) => getJson<T>(m.url)));
  return metas.map((meta, i) => ({ meta, data: data[i] }));
}

/** Append a public ledger line. */
export async function logLine(e: { mint?: string; kind: string; chain?: string; amount: number; unit: string; ref?: string; status: 'done' | 'pending' | 'failed' | 'dry'; note?: string }) {
  const ts = Date.now();
  const id = Math.random().toString(36).slice(2, 8);
  await putJson(`log/${String(ts).padStart(14, '0')}-${id}.json`, { ts, ...e });
}
