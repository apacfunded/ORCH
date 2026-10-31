// Tiny store on Vercel Blob (REST, no SDK). Same pattern as hashrate-api.
const API = 'https://blob.vercel-storage.com';
function token() { const t = process.env.BLOB_READ_WRITE_TOKEN; if (!t) throw new Error('BLOB_READ_WRITE_TOKEN is not set.'); return t; }
export async function putJson(pathname, value, overwrite = false) {
  const r = await fetch(`${API}/${pathname}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token()}`, 'x-api-version': '7', 'x-content-type': 'application/json', 'x-add-random-suffix': '0', 'x-allow-overwrite': overwrite ? '1' : '0', 'x-cache-control-max-age': '60' },
    body: JSON.stringify(value),
  });
  if (!r.ok) { const t = await r.text(); const e = new Error(`Blob write failed (${r.status}): ${t.slice(0, 200)}`); e.status = r.status; throw e; }
  return r.json();
}
export async function list(prefix) {
  const out = []; let cursor = '';
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ prefix, limit: '1000', mode: 'expanded' }); if (cursor) q.set('cursor', cursor);
    const r = await fetch(`${API}/?${q}`, { headers: { authorization: `Bearer ${token()}`, 'x-api-version': '7' } });
    if (!r.ok) throw new Error(`Blob list failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
    const j = await r.json(); out.push(...(j.blobs ?? [])); if (!j.hasMore || !j.cursor) break; cursor = j.cursor;
  }
  return out;
}
export async function getJson(url) {
  const r = await fetch(url, { headers: { authorization: `Bearer ${token()}` } });
  if (!r.ok) throw new Error(`Blob read failed (${r.status})`);
  return r.json();
}
export async function readAll(prefix) {
  const metas = await list(prefix);
  return Promise.all(metas.map((m) => getJson(m.url)));
}
/** Upload a public file (image or metadata) and return its permanent URL. */
export async function putFile(pathname, data, contentType) {
  const r = await fetch(`${API}/${pathname}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token()}`, 'x-api-version': '7', 'x-content-type': contentType, 'x-add-random-suffix': '1', 'x-cache-control-max-age': '31536000' },
    body: data,
  });
  if (!r.ok) throw new Error(`Blob upload failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).url;
}
