// Shared request plumbing: CORS (the site is also served from orch.lol/quarry), JSON body, errors.
const ALLOWED = new Set(["https://quary.lol", "https://www.quary.lol", "https://orch.lol", "http://localhost:5173", "http://localhost:8080"]);

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED.has(origin) || /\.vercel\.app$/.test(new URL(origin).hostname))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

/** Wraps a handler: CORS, OPTIONS, method check, JSON errors. */
function route(methods, fn) {
  return async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.status(204).end();
    if (!methods.includes(req.method)) return res.status(405).json({ error: "Method not allowed" });
    try {
      const out = await fn(req, res);
      if (out !== undefined && !res.headersSent) res.status(200).json(out);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      if (!res.headersSent) res.status(status).json({ error: e.message || "Server error", code: e.code });
    }
  };
}

module.exports = { route, body, cors };
