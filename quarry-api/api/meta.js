// GET /m/:id  (rewritten to /api/meta?id=:id) — the on-chain metadata URI for every Quarry coin.
const store = require("../lib/store");
const { cors } = require("../lib/http");

module.exports = async (req, res) => {
  cors(req, res);
  res.setHeader("Access-Control-Allow-Origin", "*");
  const id = String(req.query.id || "").replace(/\.json$/, "");
  if (!/^[1-9A-HJ-NP-Za-km-z]{6,20}$/.test(id)) return res.status(404).json({ error: "not found" });
  const meta = await store.getJson(`meta/${id}.json`);
  if (!meta) return res.status(404).json({ error: "not found" });
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.status(200).json(meta);
};
