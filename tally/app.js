(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const H = 3600e3, MIN = 6e4;
  const TF_ORDER = ['5m', '15m', '1h', '4h', '1d'];
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
  };

  let S = null;              // server state
  let curId = null, side = 'yes', filter = 'all', query = '';
  let token = ls.get('tally:token'), wallet = ls.get('tally:wallet'), me = null, busy = false;

  // ---------- helpers ----------
  const f2 = v => Number(v).toFixed(2);
  const mcS = v => !v ? '—' : v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : Math.round(v / 1e3) + 'K';
  const mcFine = v => !v ? '—' : v >= 1e9 ? (v / 1e9).toFixed(3) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : (v / 1e3).toFixed(1) + 'K';
  const short = w => w ? w.slice(0, 4) + '…' + w.slice(-4) : '';
  const hhmm = t => new Date(t).toUTCString().slice(17, 22);
  const utc = t => new Date(t).toUTCString().slice(5, 22) + ' UTC';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const left = t => {
    const ms = Math.max(0, t - Date.now()), h = Math.floor(ms / H), mi = Math.floor(ms % H / MIN), s = Math.floor(ms % MIN / 1e3);
    if (h === 0) return `${mi}:${String(s).padStart(2, '0')}`;
    return h >= 48 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${String(mi).padStart(2, '0')}m`;
  };
  const coin = sym => S?.coins.find(c => c.sym === sym);
  const mk = id => S?.markets.find(m => m.id === id);
  const cur = () => mk(curId);
  const isR = m => m.kind === 'updown';
  const yesW = m => isR(m) ? 'Up' : 'Yes', noW = m => isR(m) ? 'Down' : 'No';
  const locked = m => Date.now() >= m.lockAt;
  const pct = m => (m.y + m.n) ? Math.round(m.y / (m.y + m.n) * 100) : 50;
  const mult = (m, s) => { const mine = s === 'yes' ? m.y : m.n, oth = s === 'yes' ? m.n : m.y; return mine > 0 && oth > 0 ? 1 + oth / mine * (1 - S.fee) : null; };
  const multS = (m, s) => { const x = mult(m, s); return x ? x.toFixed(2) + 'x' : '—'; };
  const perf = (sym, base) => { const c = coin(sym); return c?.mc && base ? (c.mc / base - 1) * 100 : 0; };
  const avatar = (sym, size = 40) => { const c = coin(sym); return `<span class="av" style="background:${c?.color || '#2563eb'};${size !== 40 ? `width:${size}px;height:${size}px;font-size:${Math.round(size * .38)}px;border-radius:${Math.round(size / 3.4)}px` : ''}">${esc(sym.slice(0, 2))}</span>`; };

  function rowLabel(m, forSym) {
    if (isR(m)) return `${m.tf} round`;
    if (m.kind === 'ladder') return `Above $${mcS(m.line)}`;
    return forSym === m.vs ? `vs $${m.coin}` : `Beats $${m.vs}`;
  }

  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = await fetch((window.TALLY_API || '') + path, { ...opts, headers });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Something went wrong. Try again.'); e.status = r.status; throw e; }
    return j;
  }
  function toast(t) { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.i); toast.i = setTimeout(() => e.hidden = true, 3200); }

  // ---------- data ----------
  async function load() {
    try {
      S = await api('/api/state');
      if (!cur()) {
        const pick = S.markets.find(m => isR(m) && m.tf === '5m' && !locked(m)) || S.markets.find(m => !locked(m)) || S.markets[0];
        curId = pick ? pick.id : null;
      }
      const stale = S.coins.every(c => c.stale);
      $('banner').hidden = !(S.pxErr || stale);
      $('banner-txt').textContent = S.pxErr || stale ? 'Live prices are delayed. New rounds pause until they come back; open bets are safe.' : '';
      renderAll();
    } catch (e) {
      $('banner').hidden = false;
      $('banner-txt').textContent = "Can't reach Tally right now. Retrying…";
    }
  }
  async function loadMe() {
    if (!token) { me = null; renderWallet(); renderMine(); return; }
    try { me = await api('/api/me'); }
    catch (e) { if (e.status === 401) return signOut(true); }
    renderWallet(); renderMine(); calc();
  }

  // ---------- wallets ----------
  const WALLETS = [
    { id: 'phantom', name: 'Phantom', color: '#ab9ff2', url: 'https://phantom.app/', get: () => window.phantom?.solana?.isPhantom ? window.phantom.solana : (window.solana?.isPhantom ? window.solana : null) },
    { id: 'solflare', name: 'Solflare', color: '#fc7227', url: 'https://solflare.com/', get: () => window.solflare?.isSolflare ? window.solflare : null },
    { id: 'backpack', name: 'Backpack', color: '#e33e3f', url: 'https://backpack.app/', get: () => window.backpack?.isBackpack ? window.backpack : (window.backpack || null) }
  ];
  function openModal() {
    $('wallet-list').innerHTML = WALLETS.map(w => `<button type="button" class="wopt" data-w="${w.id}"><span class="wi" style="background:${w.color}">${w.name[0]}</span>${w.name}<small>${w.get() ? 'Detected' : 'Install'}</small></button>`).join('');
    $('wallet-modal').hidden = false;
    $('wallet-list').querySelector('button')?.focus();
  }
  const closeModal = () => { $('wallet-modal').hidden = true; };
  async function connect(id) {
    const w = WALLETS.find(x => x.id === id), p = w.get();
    if (!p) { window.open(w.url, '_blank', 'noopener'); return; }
    try {
      const r = await p.connect();
      const pk = (r?.publicKey || p.publicKey).toString();
      const { message, issuedAt } = await api('/api/login?wallet=' + encodeURIComponent(pk));
      const sr = await p.signMessage(new TextEncoder().encode(message), 'utf8');
      const sig = sr?.signature || sr;
      const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
      const res = await api('/api/login', { method: 'POST', body: JSON.stringify({ wallet: pk, issuedAt, signature: b64 }) });
      token = res.token; wallet = pk;
      ls.set('tally:token', token); ls.set('tally:wallet', pk); ls.set('tally:provider', id);
      closeModal(); await loadMe();
      toast(`Connected. You have ${f2(me?.bal || 0)} play SOL.`);
    } catch (e) {
      toast(e?.code === 4001 ? 'You cancelled the request in your wallet.' : (e?.message || 'Could not connect. Try again.'));
    }
  }
  function signOut(expired) {
    const p = WALLETS.find(x => x.id === ls.get('tally:provider'))?.get();
    try { p?.disconnect?.(); } catch {}
    token = wallet = me = null;
    ['tally:token', 'tally:wallet', 'tally:provider'].forEach(k => ls.set(k, null));
    $('wallet-menu').hidden = true;
    renderWallet(); renderMine(); calc();
    if (expired) toast('Your session expired. Connect again to keep betting.');
  }

  // ---------- render ----------
  function renderAll() { renderRibbon(); renderFeature(); renderGrid(); renderSettled(); renderLeaders(); renderWallet(); renderMine(); calc(); }

  function renderRibbon() {
    const r5 = S.markets.filter(m => isR(m) && m.tf === '5m');
    $('h-next').textContent = r5.length ? left(Math.min(...r5.map(m => m.close))) : '—';
    $('h-vol').textContent = f2(S.markets.reduce((s, m) => s + m.y + m.n, 0)) + ' SOL';
    $('h-open').textContent = S.markets.length;
    $('feed').innerHTML = S.settled.slice(0, 10).map(x => `<span>${esc(x.title)} <span class="${x.result === 'yes' ? 'y' : x.result === 'no' ? 'n' : ''}">${x.result === 'void' ? 'VOID' : (x.kind === 'updown' ? (x.result === 'yes' ? 'UP' : 'DOWN') : x.result.toUpperCase())}</span> · ${f2(x.pool)} SOL</span>`).join('') || '<span>Results show here as rounds settle.</span>';
  }

  function flaps(el, str) {
    const old = el.dataset.v || '';
    el.innerHTML = [...str].map((d, i) => `<div class="flap${/[.$%+\-]/.test(d) ? ' thin' : ''}${old && old[i] !== d ? ' flip' : ''}"><span>${esc(d)}</span></div>`).join('');
    el.dataset.v = str;
  }

  function chart(m) {
    const svg = $('f-chart'), c = coin(m.coin);
    const W = 300, Hh = 84;
    const longRound = m.kind !== 'updown' || ['4h', '1d'].includes(m.tf);
    const src = (longRound ? c?.histDay : c?.hist) || [];
    const draw = (pts, lv) => {
      if (pts.length < 2) return { d: '', last: null, Y: () => Hh / 2 };
      const vals = pts.map(p => p[1]).concat(lv != null ? [lv] : []);
      const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * .12 || Math.abs(lo) * .01 || 1;
      const a = lo - pad, b = hi + pad;
      const t0 = pts[0][0], t1 = pts[pts.length - 1][0] || t0 + 1;
      const X = t => (t - t0) / (t1 - t0 || 1) * W, Y = v => Hh - (v - a) / (b - a) * (Hh - 4) - 2;
      return { d: pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(''), last: pts[pts.length - 1][1], Y };
    };
    if (m.kind === 'vs') {
      const a = coin(m.coin), b = coin(m.vs);
      const pa = (a?.histDay || []).filter(p => p[0] >= m.start - 60e3).map(p => [p[0], (p[1] / m.base - 1) * 100]);
      const pb = (b?.histDay || []).filter(p => p[0] >= m.start - 60e3).map(p => [p[0], (p[1] / m.vsBase - 1) * 100]);
      const all = pa.concat(pb); const g = draw(all.length > 1 ? all : [[0, 0], [1, 0]], 0);
      const ga = draw(pa.length > 1 ? pa : [[0, 0], [1, 0]], null), gb = draw(pb.length > 1 ? pb : [[0, 0], [1, 0]], null);
      // redraw both on a shared scale
      const vals = all.map(p => p[1]).concat([0]); const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * .15 || .5;
      const tAll = all.map(p => p[0]); const t0 = Math.min(...tAll, Date.now() - 1), t1 = Math.max(...tAll, t0 + 1);
      const X = t => (t - t0) / (t1 - t0) * W, Y = v => Hh - (v - (lo - pad)) / ((hi + pad) - (lo - pad)) * (Hh - 4) - 2;
      const path = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('');
      svg.innerHTML = `<line x1="0" x2="300" y1="${Y(0)}" y2="${Y(0)}" stroke="#f0bd4a" stroke-width="1.5" stroke-dasharray="5 5" vector-effect="non-scaling-stroke"/>
        <path d="${path(pa)}" fill="none" stroke="#5b8cff" stroke-width="2" vector-effect="non-scaling-stroke"/>
        <path d="${path(pb)}" fill="none" stroke="#ffffff" stroke-width="2" opacity=".7" vector-effect="non-scaling-stroke"/>`;
      void g; void ga; void gb;
      return;
    }
    let pts = src;
    if (isR(m) && !longRound) pts = src.filter(p => p[0] >= m.start - (m.close - m.start) * .5);
    if (pts.length < 2) pts = src;
    const g = draw(pts, m.line);
    const up = g.last != null && g.last > m.line;
    svg.innerHTML = g.d ? `<path d="${g.d} L300 84 L0 84Z" fill="#5b8cff" opacity=".16"/>
      <path d="${g.d}" fill="none" stroke="#5b8cff" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <line x1="0" x2="300" y1="${g.Y(m.line)}" y2="${g.Y(m.line)}" stroke="#f0bd4a" stroke-width="2" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"/>
      <circle cx="300" cy="${g.Y(g.last)}" r="3.5" fill="${up ? '#2fd39a' : '#ff6178'}"/>`
      : '';
    if (!g.d) $('f-chartlbl').textContent = 'Chart fills in as prices are recorded';
  }

  const oddBtns = m => `<button type="button" class="odd y num" data-id="${esc(m.id)}" data-s="yes" aria-pressed="${m.id === curId && side === 'yes'}"${locked(m) ? ' disabled' : ''}>${yesW(m)} <b>${multS(m, 'yes')}</b></button><button type="button" class="odd n num" data-id="${esc(m.id)}" data-s="no" aria-pressed="${m.id === curId && side === 'no'}"${locked(m) ? ' disabled' : ''}>${noW(m)} <b>${multS(m, 'no')}</b></button>`;

  function renderFeature() {
    const m = cur();
    $('feature-empty').hidden = !!m; $('feature-body').hidden = !m;
    if (!m) {
      $('feature-empty').innerHTML = S.coins.every(c => c.stale)
        ? '<b>Waiting for live prices</b>Markets open as soon as the first prices come in.'
        : '<b>No open markets right now</b>New rounds open on the clock. Check back in a minute.';
      return;
    }
    const c = coin(m.coin);
    $('f-kind').textContent = isR(m) ? `${m.tf} round · ${hhmm(m.start)}–${hhmm(m.close)} UTC` : m.kind === 'ladder' ? 'Price ladder · daily close' : 'Head to head · daily close';
    $('f-q').textContent = m.title;
    const chip = sym => { const k = coin(sym); return `${avatar(sym)}<div><strong>$${esc(sym)}</strong><small>${esc(k?.name || '')}</small></div>${k?.url ? `<a class="dex num" href="${esc(k.url)}" target="_blank" rel="noopener">${esc(k.mint.slice(0, 4))}…pump · chart</a>` : ''}`; };
    $('f-who').innerHTML = m.vs ? chip(m.coin) + '<span class="vs">vs</span>' + chip(m.vs) : chip(m.coin);

    const rounds = S.markets.filter(x => x.coin === m.coin && isR(x)).sort((a, b) => TF_ORDER.indexOf(a.tf) - TF_ORDER.indexOf(b.tf));
    $('f-tf').innerHTML = rounds.length ? '<span class="lbl">Up / Down</span>' + rounds.map(x => `<button type="button" class="tfb num" data-id="${esc(x.id)}" aria-pressed="${x.id === m.id}">${x.tf}<small data-close="${esc(x.id)}">${left(x.close)}</small></button>`).join('') : '';

    if (m.kind === 'vs') {
      const pa = perf(m.coin, m.base), pb = perf(m.vs, m.vsBase);
      $('f-nowlbl').textContent = `$${m.coin} since start`; $('f-linelbl').textContent = `$${m.vs}`;
      flaps($('f-now'), (pa >= 0 ? '+' : '') + pa.toFixed(1) + '%'); flaps($('f-line'), (pb >= 0 ? '+' : '') + pb.toFixed(1) + '%');
      $('f-chartlbl').innerHTML = `<span class="lg"><span><i style="background:#5b8cff"></i>$${esc(m.coin)}</span><span><i style="background:#fff"></i>$${esc(m.vs)}</span></span>`;
      $('f-chg').innerHTML = `Gap <b>${(pa - pb >= 0 ? '+' : '') + (pa - pb).toFixed(2)} pts</b>`;
      $('f-need').innerHTML = `<b>${pa > pb ? `$${esc(m.coin)} is ahead` : `$${esc(m.vs)} is ahead`}</b>`;
    } else {
      $('f-nowlbl').textContent = `$${m.coin} ${isR(m) ? 'now' : 'market cap'}`;
      $('f-linelbl').textContent = isR(m) ? 'Price to beat' : 'Strike';
      flaps($('f-now'), '$' + (isR(m) ? mcFine(c?.mc) : mcS(c?.mc)));
      flaps($('f-line'), '$' + (isR(m) ? mcFine(m.line) : mcS(m.line)));
      $('f-chartlbl').textContent = isR(m) && !['4h', '1d'].includes(m.tf) ? 'This round' : 'Last 24h';
      const d = c?.mc ? (c.mc / m.line - 1) * 100 : 0;
      $('f-chg').innerHTML = isR(m) ? `This round <b class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d.toFixed(2)}%</b>` : `24h <b class="${(c?.chg24 || 0) >= 0 ? 'up' : 'down'}">${(c?.chg24 || 0) >= 0 ? '+' : ''}${(c?.chg24 || 0).toFixed(1)}%</b>`;
      $('f-need').innerHTML = `<b>${isR(m) ? (d > 0 ? 'Up is winning' : 'Down is winning') : (d > 0 ? `Above the strike by ${d.toFixed(1)}%` : `Needs +${(-d).toFixed(1)}%`)}</b>`;
    }
    chart(m);
    const p = pct(m);
    $('f-bar').style.width = p + '%';
    $('f-y').textContent = `${yesW(m).toUpperCase()} ${p}%`;
    $('f-n').textContent = `${100 - p}% ${noW(m).toUpperCase()}`;
    $('f-pool').textContent = (m.y + m.n) ? `${f2(m.y + m.n)} SOL pool` : 'No bets yet';

    const others = S.markets.filter(x => (x.coin === m.coin || x.vs === m.coin) && !isR(x)).sort((a, b) => (a.kind > b.kind ? 1 : -1) || (a.line || 0) - (b.line || 0));
    $('f-ladder').innerHTML = others.length ? `<h3>More $${esc(m.coin)} markets</h3>` + others.map(x => `<div class="lrow ${x.id === m.id ? 'cur' : ''}"><span class="lbl">${esc(rowLabel(x, m.coin))}<small class="num">${x.kind === 'ladder' ? (c?.mc >= x.line ? 'Above now' : `Needs +${((x.line / c?.mc - 1) * 100).toFixed(0)}%`) : 'Head to head'} · <span data-close="${esc(x.id)}">${left(x.close)}</span></small></span>${oddBtns(x)}</div>`).join('') : '';

    $('r-close').textContent = utc(m.close);
    $('r-rule').textContent = isR(m) ? `$${m.coin} market cap at ${hhmm(m.close)} UTC is above the price to beat ($${mcFine(m.line)}, recorded at ${hhmm(m.start)} UTC). Equal or lower resolves Down.`
      : m.kind === 'ladder' ? `$${m.coin} market cap at the daily close (00:00 UTC) is above $${mcS(m.line)}.`
      : `$${m.coin} gains more (in %) than $${m.vs} from ${hhmm(m.start)} UTC to the daily close. A tie resolves NO.`;
    $('pick-yes').querySelector('b').textContent = yesW(m);
    $('pick-no').querySelector('b').textContent = noW(m);
    $('slip-mkt').textContent = m.title;
    $('m-yes').textContent = multS(m, 'yes'); $('m-no').textContent = multS(m, 'no');
    $('s-yes').textContent = f2(m.y) + ' SOL in'; $('s-no').textContent = f2(m.n) + ' SOL in';
    tick();
  }

  function renderGrid() {
    const qq = query.trim().toLowerCase().replace(/^\$/, '');
    const cards = S.coins.filter(c => !qq || c.sym.toLowerCase().includes(qq) || c.name.toLowerCase().includes(qq) || c.mint.toLowerCase().includes(qq)).map(c => {
      const all = S.markets.filter(m => m.coin === c.sym || m.vs === c.sym);
      const list = all.filter(m => filter === 'all' || m.kind === filter).sort((a, b) => (isR(b) - isR(a)) || (TF_ORDER.indexOf(a.tf) - TF_ORDER.indexOf(b.tf)) || ((a.line || 0) - (b.line || 0)));
      if (!list.length && (filter !== 'all' || qq === '')) { if (filter !== 'all') return ''; }
      const pool = all.reduce((s, m) => s + m.y + m.n, 0), ch = c.chg24 || 0;
      return `<article class="card coin ${cur()?.coin === c.sym || cur()?.vs === c.sym ? 'cur' : ''}">
        <button type="button" class="coin-head" data-coin="${esc(c.sym)}">${avatar(c.sym, 36)}<span><strong>$${esc(c.sym)}</strong><small>${esc(c.name)}</small></span>
          <span class="px num">${c.mc ? '$' + mcS(c.mc) : '—'}<small class="${ch >= 0 ? 'up' : 'down'}">${c.mc ? (ch >= 0 ? '+' : '') + ch.toFixed(1) + '%' : ''}</small></span></button>
        <div class="coin-meta num"><span>${all.length} markets · vol $${mcS(c.vol24)}</span><span>${f2(pool)} SOL in pools</span></div>
        ${list.length ? `<ul class="rows">${list.map(m => `<li class="row ${m.id === curId ? 'cur' : ''}"><span class="lbl num">${esc(rowLabel(m, c.sym))}<small>${locked(m) ? 'Locked · ' : ''}<span data-close="${esc(m.id)}">${left(m.close)}</span></small></span>${oddBtns(m)}</li>`).join('')}</ul>`
          : `<p class="fine">${c.stale ? 'Waiting for price data.' : c.vol24 < 1e6 ? 'Not enough trading volume for markets right now.' : 'Next rounds open shortly.'}</p>`}
      </article>`;
    }).join('');
    if (cards.trim()) $('grid').innerHTML = cards;
    else { $('grid').innerHTML = '<p class="empty card"></p>'; $('grid').firstChild.textContent = qq ? `No coins match "${query.trim()}". Check the ticker or paste the full CA.` : 'No markets of this type right now.'; }
  }

  function renderSettled() {
    const rows = S.settled.slice(0, 10).map(x => {
      const lab = x.result === 'void' ? 'Void' : x.kind === 'updown' ? (x.result === 'yes' ? 'Up' : 'Down') : (x.result === 'yes' ? 'Yes' : 'No');
      const cv = x.kind === 'vs' ? '—' : x.closeVal ? '$' + mcFine(x.closeVal) : '—';
      return `<tr><td>${esc(x.title)}<div class="proof num">${hhmm(x.start)}–${hhmm(x.close)} UTC</div></td><td><span class="pill ${x.result === 'yes' ? 'y' : x.result === 'no' ? 'n' : 'v'}">${lab}</span></td><td class="num">${f2(x.pool)} SOL</td><td class="num">${cv}</td></tr>`;
    }).join('');
    $('settled').innerHTML = rows || '<tr><td colspan="4" class="proof">Results show here as rounds settle.</td></tr>';
  }
  function renderLeaders() {
    $('board').innerHTML = S.leaders.map((l, i) => `<tr class="${i === 0 ? 'top1' : ''}"><td class="rank">${i + 1}</td><td class="num">${esc(short(l.wallet))}${l.wallet === wallet ? ' (you)' : ''}</td><td class="num">${Math.round(l.hit * 100)}%</td><td class="won num" style="color:${l.pnl >= 0 ? 'var(--yes)' : 'var(--no)'}">${l.pnl >= 0 ? '+' : ''}${f2(l.pnl)}</td></tr>`).join('')
      || '<tr><td colspan="4" class="proof">No settled bets yet. Be the first on the board.</td></tr>';
  }
  function renderWallet() {
    const on = !!(token && wallet);
    $('connect').hidden = on; $('wallet-pill').hidden = !on;
    if (on) {
      $('wp-ic').textContent = wallet.slice(0, 2);
      $('wp-addr').textContent = short(wallet);
      $('wp-bal').textContent = me ? `${f2(me.bal)} play SOL` : '…';
    }
    $('bal-line').hidden = !on;
    if (on && me) { $('bal').textContent = f2(me.bal); $('refill').hidden = me.bal >= 1; }
  }
  function renderMine() {
    if (!token || !me) {
      $('mine-sum').textContent = '';
      $('mine-rows').innerHTML = '<tr><td colspan="5" class="proof">Connect a wallet to see your bets.</td></tr>';
      return;
    }
    const open = me.bets.filter(b => b.status === 'open');
    $('mine-sum').textContent = `${open.length} open · P&L ${me.pnl >= 0 ? '+' : ''}${f2(me.pnl)}`;
    $('mine-rows').innerHTML = me.bets.map(b => {
      const m = mk(b.marketId);
      const sideW = b.kind === 'updown' ? (b.side === 'yes' ? 'Up' : 'Down') : (b.side === 'yes' ? 'Yes' : 'No');
      const st = b.status === 'open' ? `<span class="pill o">${m && locked(m) ? 'Locked' : 'Open'} · ${left(b.close)}</span>` : `<span class="pill ${b.status === 'won' ? 'y' : b.status === 'lost' ? 'n' : 'v'}">${b.status === 'won' ? 'Won' : b.status === 'lost' ? 'Lost' : 'Refunded'}</span>`;
      return `<tr><td>${esc(b.title)}</td><td>${sideW}</td><td class="num">${f2(b.amt)}</td><td>${st}</td><td class="num" style="text-align:right">${b.status === 'open' ? '—' : f2(b.payout || 0)}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="proof">No bets yet. Pick a market and place your first one.</td></tr>';
  }

  function calc() {
    const m = S && cur();
    if (!m) { $('place').disabled = true; return; }
    const raw = $('amount').value.trim(), a = Number(raw);
    let err = '';
    if (raw === '' || !isFinite(a) || a <= 0) err = 'Enter a stake above 0 SOL.';
    else if (a < 0.01) err = 'The smallest stake is 0.01 SOL.';
    else if (a > 25) err = 'The largest stake is 25 SOL per bet.';
    else if (me && a > me.bal) err = `You have ${f2(me.bal)} play SOL. Lower your stake.`;
    $('err').textContent = token ? err : '';
    const amt = err ? 0 : a;
    const mine = (side === 'yes' ? m.y : m.n) + amt, oth = side === 'yes' ? m.n : m.y;
    const share = mine ? amt / mine : 0, pay = amt + share * oth * (1 - S.fee);
    $('e-share').textContent = (share * 100).toFixed(1) + '%';
    $('e-pay').textContent = amt ? (oth > 0 ? `${pay.toFixed(3)} SOL` : 'Refund for now') : '—';
    const word = (side === 'yes' ? yesW(m) : noW(m)).toUpperCase();
    const btn = $('place');
    if (!token) { btn.textContent = 'Connect wallet to bet'; btn.disabled = false; }
    else if (locked(m)) { btn.textContent = `Locked · closes in ${left(m.close)}`; btn.disabled = true; }
    else { btn.textContent = busy ? 'Placing bet…' : `Bet ${word}` + (amt ? ` · ${f2(amt)} SOL` : ''); btn.disabled = !!err || busy; }
  }

  function tick() {
    if (!S) return;
    document.querySelectorAll('[data-close]').forEach(e => { const m = mk(e.dataset.close); if (m) e.textContent = left(m.close); });
    const m = cur();
    if (m) {
      $('f-leftlbl').textContent = locked(m) ? 'Locked, closes in' : (isR(m) ? 'Round ends in' : 'Betting closes in');
      $('f-left').textContent = left(locked(m) ? m.close : m.lockAt);
    }
    const r5 = S.markets.filter(x => isR(x) && x.tf === '5m');
    $('h-next').textContent = r5.length ? left(Math.min(...r5.map(x => x.close))) : '—';
    calc();
  }

  function select(id, s) {
    if (!mk(id)) return;
    const moved = id !== curId;
    curId = id; if (s) side = s;
    $('pick-yes').setAttribute('aria-pressed', side === 'yes'); $('pick-no').setAttribute('aria-pressed', side === 'no');
    if (moved) { $('f-now').dataset.v = ''; $('f-line').dataset.v = ''; }
    renderFeature(); renderGrid(); calc();
    return moved;
  }

  // ---------- events ----------
  document.addEventListener('click', e => {
    const o = e.target.closest('.odd');
    if (o) { if (select(o.dataset.id, o.dataset.s) && o.closest('#grid')) document.querySelector('.hero').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const t = e.target.closest('.tfb'); if (t) { select(t.dataset.id); return; }
    const h = e.target.closest('.coin-head');
    if (h) { const m = S.markets.find(x => x.coin === h.dataset.coin && isR(x)) || S.markets.find(x => x.coin === h.dataset.coin); if (m) { select(m.id); document.querySelector('.hero').scrollIntoView({ behavior: 'smooth', block: 'start' }); } return; }
    const w = e.target.closest('.wopt'); if (w) { connect(w.dataset.w); return; }
    if (!e.target.closest('#wallet-wrap')) { $('wallet-menu').hidden = true; $('wallet-pill').setAttribute('aria-expanded', 'false'); }
  });
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => { filter = t.dataset.f; document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-pressed', x === t)); renderGrid(); });
  $('pick-yes').onclick = () => { side = 'yes'; $('pick-yes').setAttribute('aria-pressed', true); $('pick-no').setAttribute('aria-pressed', false); calc(); renderGrid(); };
  $('pick-no').onclick = () => { side = 'no'; $('pick-no').setAttribute('aria-pressed', true); $('pick-yes').setAttribute('aria-pressed', false); calc(); renderGrid(); };
  $('amount').addEventListener('input', calc);
  document.querySelectorAll('.quick button').forEach(b => b.onclick = () => { $('amount').value = b.dataset.a; calc(); });
  $('connect').onclick = openModal;
  $('wm-close').onclick = closeModal;
  $('wallet-modal').addEventListener('click', e => { if (e.target.id === 'wallet-modal') closeModal(); });
  $('wallet-pill').onclick = () => { const h = !$('wallet-menu').hidden; $('wallet-menu').hidden = h; $('wallet-pill').setAttribute('aria-expanded', String(!h)); };
  $('disconnect').onclick = () => signOut(false);
  $('copy-addr').onclick = () => { navigator.clipboard?.writeText(wallet).then(() => toast('Address copied.'), () => toast(wallet)); $('wallet-menu').hidden = true; };
  $('refill').onclick = async () => { try { const r = await api('/api/refill', { method: 'POST' }); me.bal = r.bal; renderWallet(); calc(); toast('Added 10 play SOL.'); } catch (e) { toast(e.message); } };

  $('slip').addEventListener('submit', async e => {
    e.preventDefault();
    if (!token) return openModal();
    const m = cur(); if (!m || busy) return;
    calc(); if ($('place').disabled) return;
    busy = true; calc();
    try {
      const amount = Number($('amount').value);
      const r = await api('/api/bet', { method: 'POST', body: JSON.stringify({ marketId: m.id, side, amount }) });
      const mm = mk(r.market.id); if (mm) { mm.y = r.market.y; mm.n = r.market.n; }
      if (me) me.bal = r.bal;
      toast(`Bet placed: ${(side === 'yes' ? yesW(m) : noW(m)).toUpperCase()} ${f2(amount)} play SOL on ${m.title}.`);
      await loadMe(); renderFeature(); renderGrid();
    } catch (err) {
      if (err.status === 401) signOut(true); else toast(err.message);
    } finally { busy = false; calc(); }
  });

  // header: menu, search, active nav
  const drawer = $('drawer'), mBtn = $('menu-btn');
  const setMenu = open => { drawer.hidden = !open; mBtn.setAttribute('aria-expanded', open); mBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); };
  mBtn.onclick = () => setMenu(drawer.hidden);
  drawer.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  ['q', 'q2'].forEach(id => {
    const el = $(id);
    el.addEventListener('input', () => { query = el.value; $('q').value = $('q2').value = el.value; if (S) renderGrid(); });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); setMenu(false); $('markets').scrollIntoView({ behavior: 'smooth' }); } });
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $('q').offsetParent ? $('q').focus() : (setMenu(true), $('q2').focus()); }
    if (e.key === 'Escape') { closeModal(); setMenu(false); $('wallet-menu').hidden = true; }
  });
  const secs = ['top', 'markets', 'mine', 'results', 'how'].map(id => $(id));
  addEventListener('scroll', () => {
    let a = 'top'; secs.forEach(s => { if (s && s.getBoundingClientRect().top <= 140) a = s.id; });
    document.querySelectorAll('#mainnav a[data-sec]').forEach(x => x.setAttribute('aria-current', x.dataset.sec === a));
  }, { passive: true });

  // ---------- go ----------
  load(); loadMe();
  setInterval(load, 5000);
  setInterval(() => { if (token) loadMe(); }, 15000);
  setInterval(tick, 1000);
})();
