// POST { name, ticker, description, image (data URL), twitter, telegram, website } -> { uri, image }
// Hosts the coin image + metadata on this project's public Blob store (or Pinata when PINATA_JWT is set).
import { wrap, body, bad, clean, ticker } from '../lib/http.js';
import { putFile } from '../lib/store.js';
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

function decodeImage(dataUrl) {
  const m = /^data:(image\/(png|jpeg|jpg|gif|webp));base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw bad('Add a coin image (PNG, JPG, GIF or WEBP).');
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length > 3 * 1024 * 1024) throw bad('The image is over 3 MB. Use a smaller picture.');
  return { buf, type: m[1], ext: m[2] === 'jpeg' ? 'jpg' : m[2] };
}
async function pinata(blob, filename) {
  const fd = new FormData(); fd.append('network', 'public'); fd.append('file', blob, filename);
  const r = await fetch('https://uploads.pinata.cloud/v3/files', { method: 'POST', headers: { authorization: `Bearer ${process.env.PINATA_JWT}` }, body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.data?.cid) throw new Error(`Pinata upload failed (${r.status})`);
  return `https://ipfs.io/ipfs/${j.data.cid}`;
}
export default wrap(async (req) => {
  const b = body(req);
  const name = clean(b.name, 32); if (!name) throw bad('Add a coin name.');
  const symbol = ticker(b.ticker);
  const description = clean(b.description, 500);
  const twitter = clean(b.twitter, 200), telegram = clean(b.telegram, 200), website = clean(b.website, 200);
  const img = decodeImage(b.image);
  const file = new Blob([img.buf], { type: img.type });

  if (process.env.PINATA_JWT) {
    const image = await pinata(file, `image.${img.ext}`);
    const meta = { name, symbol, description, image, twitter, telegram, website, showName: true, createdOn: 'https://orch.lol/amoviepad' };
    const uri = await pinata(new Blob([JSON.stringify(meta)], { type: 'application/json' }), 'metadata.json');
    return { uri, image };
  }
  // Default: host image + metadata on this project's public Blob store (pump.fun's IPFS blocks server uploads).
  const slug = `${symbol.toLowerCase()}-${Date.now().toString(36)}`;
  const image = await putFile(`media/${slug}.${img.ext}`, img.buf, img.type);
  const meta = { name, symbol, description, image, twitter, telegram, website, showName: true, createdOn: 'https://orch.lol/amoviepad' };
  const uri = await putFile(`meta/${slug}.json`, JSON.stringify(meta), 'application/json');
  return { uri, image };
});
