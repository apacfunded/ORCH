// POST /api/upload  { name, symbol, description, image (data URL), twitter, telegram, website, board }
// Stores the image and the token metadata JSON, returns the short metadata URI used on-chain.
const crypto = require("crypto");
const { route, body } = require("../lib/http");
const store = require("../lib/store");
const { httpError } = require("../lib/env");

const SITE = process.env.SITE_URL || "https://quary.lol";
const MAX_IMAGE = 3 * 1024 * 1024;
const TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const newId = () => Array.from(crypto.randomBytes(10), (b) => B58[b % 58]).join("");

const link = (v) => {
  if (!v) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  try { const u = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`); return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 200) : undefined; } catch { return undefined; }
};

module.exports = route(["POST"], async (req) => {
  const b = await body(req);
  const name = String(b.name || "").trim();
  const symbol = String(b.symbol || "").trim().toUpperCase();
  if (name.length < 1 || name.length > 32) throw httpError(400, "Name must be 1 to 32 characters.");
  if (!/^[A-Z0-9]{2,10}$/.test(symbol)) throw httpError(400, "Ticker must be 2 to 10 letters or numbers.");
  if (!/^[a-z0-9-]{2,32}$/.test(String(b.board || ""))) throw httpError(400, "Pick a commodity board.");
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(String(b.image || ""));
  if (!m || !TYPES[m[1]]) throw httpError(400, "Add a PNG, JPG, GIF or WEBP image.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > MAX_IMAGE) throw httpError(413, "Image must be under 3 MB.");

  const id = newId();
  const imageUrl = await store.putFile(`img/${id}.${TYPES[m[1]]}`, buf, m[1]);
  const meta = {
    name, symbol,
    description: String(b.description || "").slice(0, 500),
    image: imageUrl,
    showName: true,
    createdOn: SITE,
    twitter: link(b.twitter), telegram: link(b.telegram), website: link(b.website) || `${SITE}`,
    quarry: { board: b.board },
  };
  await store.putJson(`meta/${id}.json`, meta, { cache: 31536000 });
  return { id, uri: `${SITE}/m/${id}`, image: imageUrl };
});
