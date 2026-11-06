const cors = require('../lib/cors');
module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const r = await fetch('https://pumpportal.fun/api/trade-local', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: Buffer.concat(chunks).toString()
    });
    res.statusCode = r.status;
    res.setHeader('content-type', r.headers.get('content-type') || 'application/octet-stream');
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'create failed' }));
  }
};
