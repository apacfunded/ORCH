const cors = require('../lib/cors');
module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const r = await fetch('https://pump.fun/api/ipfs', {
      method: 'POST',
      headers: { 'content-type': req.headers['content-type'] },
      body: Buffer.concat(chunks)
    });
    res.statusCode = r.status;
    res.setHeader('content-type', r.headers.get('content-type') || 'application/json');
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'upload failed' }));
  }
};
