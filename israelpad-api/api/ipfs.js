// POST { image: dataURL, name, symbol, description, twitter, telegram, website } -> pump.fun's { metadataUri, ... }
// Relays orch.lol/israelpad's coin image + metadata to pump.fun's IPFS upload when the browser can't call it directly.
// Holds no keys: the launch itself is still signed in the browser.
export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  try {
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const m = /^data:(image\/(png|jpeg|gif|webp));base64,(.+)$/.exec(String(b.image || ''));
    if (!m) return res.status(400).json({ error: 'Add a PNG, JPG, GIF or WebP image.' });
    const bytes = Buffer.from(m[3], 'base64');
    if (bytes.length > 4e6) return res.status(400).json({ error: 'That image is over 4 MB.' });
    const s = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
    const fd = new FormData();
    fd.append('file', new Blob([bytes], { type: m[1] }), 'coin.' + (m[2] === 'jpeg' ? 'jpg' : m[2]));
    fd.append('name', s(b.name, 32)); fd.append('symbol', s(b.symbol, 10)); fd.append('description', s(b.description, 500));
    fd.append('twitter', s(b.twitter, 200)); fd.append('telegram', s(b.telegram, 200)); fd.append('website', s(b.website, 200));
    fd.append('showName', 'true');
    const r = await fetch('https://pump.fun/api/ipfs', { method: 'POST', body: fd });
    const text = await r.text();
    if (!r.ok) { console.error('pump.fun ipfs', r.status, text.slice(0, 300)); return res.status(502).json({ error: `pump.fun upload returned ${r.status}` }); }
    res.setHeader('content-type', 'application/json');
    return res.status(200).send(text);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Upload failed on our side. Try again in a minute.' });
  }
}
