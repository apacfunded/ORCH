// Tiny JSON/file store on Vercel Blob. Every object is public-read (metadata and images must be public
// for pump.fun anyway); writes need BLOB_READ_WRITE_TOKEN, which Vercel injects when the store is linked.
const { put, head, list } = require("@vercel/blob");

async function putJson(path, value, { cache = 60 } = {}) {
  const r = await put(path, JSON.stringify(value), { access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: cache });
  return r.url;
}

async function putFile(path, buf, contentType) {
  const r = await put(path, buf, { access: "public", contentType, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000 });
  return r.url;
}

async function urlOf(path) {
  try { return (await head(path)).url; } catch { return null; }
}

async function getJson(path) {
  const url = await urlOf(path);
  if (!url) return null;
  const r = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  return r.ok ? r.json() : null;
}

async function listJson(prefix) {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

module.exports = { putJson, putFile, getJson, urlOf, listJson };
