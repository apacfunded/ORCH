// Blox data feed: Roblox's Top Playing Now chart and game search, fetched server-side
// so the site never depends on the visitor's browser reaching Roblox.
//   GET /api/roblox          -> top 12 games
//   GET /api/roblox?q=obby   -> up to 8 games matching the search
const HOSTS = ['roblox.com', 'roproxy.com'];

async function get(sub, path) {
  let last;
  for (const host of HOSTS) {
    try {
      const r = await fetch(`https://${sub}.${host}${path}`, {
        headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; BloxSite/1.0)' },
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) return await r.json();
      last = new Error(`${host} ${r.status}`);
    } catch (e) { last = e; }
  }
  throw last || new Error('unreachable');
}

function sid() {
  return 'b10c0000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0').slice(-12);
}

async function enrich(list) {
  if (!list.length) return [];
  const ids = list.map(g => g.id).join(',');
  const [det, ico] = await Promise.all([
    get('games', `/v1/games?universeIds=${ids}`).catch(() => null),
    get('thumbnails', `/v1/games/icons?universeIds=${ids}&size=256x256&format=Png&isCircular=false`).catch(() => null),
  ]);
  const dm = new Map(((det && det.data) || []).map(d => [String(d.id), d]));
  const im = new Map(((ico && ico.data) || []).filter(d => d.state === 'Completed' && d.imageUrl).map(d => [String(d.targetId), d.imageUrl]));
  return list.map(g => {
    const d = dm.get(String(g.id));
    return {
      id: g.id, place: String(g.place), name: g.name, playing: g.playing || 0,
      by: (d && d.creator && d.creator.name) || g.by || '',
      visits: d ? d.visits : 0,
      g1: d ? d.genre_l1 || '' : '', g2: d ? d.genre_l2 || '' : '',
      icon: im.get(String(g.id)) || '',
    };
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }
  const q = String((req.query && req.query.q) || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 50);
  try {
    let list;
    if (q) {
      const s = await get('apis', `/search-api/omni-search?searchQuery=${encodeURIComponent(q)}&pageToken=&sessionId=${sid()}&pageType=all`);
      list = [];
      for (const grp of s.searchResults || []) {
        if (grp.contentGroupType !== 'Game') continue;
        for (const c of grp.contents || []) {
          if (!c.universeId || !c.rootPlaceId || c.isSponsored) continue;
          list.push({ id: c.universeId, place: c.rootPlaceId, name: c.name, playing: c.playerCount, by: c.creatorName });
        }
      }
      list = list.slice(0, 8);
    } else {
      const t = await get('apis', `/explore-api/v1/get-sort-content?sessionId=${sid()}&sortId=top-playing-now`);
      list = (t.games || []).slice(0, 12).map(g => ({ id: g.universeId, place: g.rootPlaceId, name: g.name, playing: g.playerCount }));
      if (list.length < 6) throw new Error('short chart');
    }
    const games = await enrich(list);
    res.setHeader('Cache-Control', q ? 'public, s-maxage=300, stale-while-revalidate=600' : 'public, s-maxage=60, stale-while-revalidate=600');
    res.status(200).json({ games, at: Date.now() });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: 'Roblox could not be reached' });
  }
};
