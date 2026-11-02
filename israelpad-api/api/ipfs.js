// POST { image: dataURL, name, symbol, description, twitter, telegram, website } -> { metadataUri, image }
// Hosts the coin image + metadata JSON for orch.lol/israelpad's launches. pump.fun's own IPFS upload
// blocks server and cross-site requests, so we store them on this project's public Vercel Blob store
// (same approach as cauldron-api). Holds no keys: the launch is still signed in the browser.
const BLOB = 'https://blob.vercel-storage.com';
async function putFile(pathname, data, contentType) {
  const t = process.env.BLOB_READ_WRITE_TOKEN; if (!t) throw new Error('BLOB_READ_WRITE_TOKEN is not set.');
  const r = await fetch(`${BLOB}/${pathname}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${t}`, 'x-api-version': '7', 'x-content-type': contentType, 'x-add-random-suffix': '1', 'x-cache-control-max-age': '31536000' },
    body: data,
  });
  if (!r.ok) throw new Error(`Blob upload failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).url;
}
export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const m = /^data:(image\/(png|jpeg|gif|webp));base64,(.+)$/.exec(String(b.image || ''));
    if (!m) return res.status(400).json({ error: 'Add a PNG, JPG, GIF or WebP image.' });
    const bytes = Buffer.from(m[3], 'base64');
    if (bytes.length > 3.5e6) return res.status(400).json({ error: 'That image is over 3.5 MB. Use a smaller one.' });
    const s = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
    const name = s(b.name, 32), symbol = s(b.symbol, 10).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!name || !symbol) return res.status(400).json({ error: 'Add a name and ticker.' });
    const slug = `${symbol.toLowerCase()}-${Date.now().toString(36)}`;
    const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
    const image = await putFile(`media/${slug}.${ext}`, bytes, m[1]);
    const meta = { name, symbol, description: s(b.description, 500), image, showName: true, createdOn: 'https://orch.lol/israelpad',
      twitter: s(b.twitter, 200), telegram: s(b.telegram, 200), website: s(b.website, 200) };
    const metadataUri = await putFile(`meta/${slug}.json`, JSON.stringify(meta), 'application/json');
    return res.status(200).json({ metadataUri, image });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Upload failed on our side. Try again in a minute.' });
  }
}
