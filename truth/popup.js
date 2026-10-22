import { toRaw, fromRaw, ATA_RENT_LAMPORTS } from './lib/solana.js';
import { isAddress } from './lib/base58.js';
import { qrSvg } from './lib/qr.js';
// The website (orch.lol/truth) has no pump.fun tab: callouts post through the Truth relay and the coin is pasted in.
const IS_WEB = /web/.test(chrome.runtime.getManifest().version);
const WEB_COIN_KEY = 'truthweb.coin';
const webCoin = { get: () => { try { return localStorage.getItem(WEB_COIN_KEY) || ''; } catch { return ''; } }, set: (ca) => { try { ca ? localStorage.setItem(WEB_COIN_KEY, ca) : localStorage.removeItem(WEB_COIN_KEY); } catch {} } };
// Accepts a bare CA or any pump.fun / dexscreener / solscan link that contains one.
function parseCoinInput(text) {
  const t = String(text || '').trim();
  const m = t.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) || [];
  return m.find(x => isAddress(x)) || null;
}
const NO_WEB_COIN = 'Paste the coin address (CA) or its pump.fun link.';

// ---------------- helpers ----------------
const root = document.getElementById('root');
const sheetHost = document.getElementById('sheet');
const send = (m) => new Promise((res, rej) => chrome.runtime.sendMessage(m, r => r?.ok ? res(r.result) : rej(new Error(r?.error || chrome.runtime.lastError?.message || 'No response from the extension'))));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (a) => a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '';
const $ = (sel) => (sheet && sheetHost.querySelector(sel)) || document.querySelector(sel);
const $$ = (sel) => [...root.querySelectorAll(sel)];
const S$ = (sel) => [...(sheet ? sheetHost : root).querySelectorAll(sel)];
const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); return el; };
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const fmtNum = (x, max = 4) => { const n = Number(x); if (!isFinite(n)) return '0'; return n.toLocaleString(undefined, { maximumFractionDigits: n >= 1000 ? 2 : max }); };
const fmtUsd = (x) => x == null || !isFinite(x) ? '' : '$' + Number(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: Math.abs(x) < 1 && x !== 0 ? 4 : 2 });
const fmtPrice = (x) => { if (x == null || !isFinite(x)) return ''; if (x >= 0.01) return fmtUsd(x); const s = Number(x).toPrecision(3); return '$' + (s.includes('e') ? Number(s).toFixed(12).replace(/0+$/, '') : s); };
const signed = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + '$' + Math.abs(x).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const tone = (x) => x > 0 ? 'pos' : x < 0 ? 'neg' : '';
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const enterTo = (sel, fn) => on(sel, 'keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); fn(); } });
const copy = async (text, label = 'Copied') => { try { await navigator.clipboard.writeText(text); toast(label); } catch { toast("Couldn't copy"); } };
const store = {
  get(k, d) { try { const v = localStorage.getItem('truth.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('truth.' + k, JSON.stringify(v)); } catch {} },
};

let toastTimer = null;
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

const I = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  callouts: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/></svg>',
  bundle: '<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5" opacity=".5"/></svg>',
  like: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  activity: '<svg viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  receive: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M7 4v15M3 15l4 4 4-4"/><path d="M17 20V5M13 9l4-4 4 4"/></svg>',
  wallets: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13 7l4 4"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
  stack: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="13" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3"/></svg>',
  sweep: '<svg viewBox="0 0 24 24"><path d="M4 5l5 5M20 5l-5 5M4 19l5-5M20 19l-5-5"/><circle cx="12" cy="12" r="3"/></svg>',
  mark: '<svg viewBox="0 0 64 64"><path d="M18 40 L32 16 L46 40 Z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><circle cx="32" cy="47" r="4.5" fill="currentColor"/></svg>',
};

const hue = (a) => { let h = 0; for (const c of String(a)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const initials = (name) => { const p = String(name || '?').trim().split(/\s+/); return ((p[0]?.[0] || '?') + (p.length > 1 ? p[p.length - 1][0] : (p[0]?.[1] || ''))).toUpperCase(); };
const avatar = (w, size = '') => w ? `<span class="av ${size}" style="--h:${hue(w.address)}" aria-hidden="true">${esc(initials(w.name))}</span>` : `<span class="av ${size}" aria-hidden="true">?</span>`;
const avatarFor = (address, label, size = '') => `<span class="av ${size}" style="--h:${hue(address)}" aria-hidden="true">${esc(initials(label))}</span>`;
const avatarAll = (size = '') => `<span class="av all ${size}" aria-hidden="true">${I.stack}</span>`;

// ---------------- state ----------------
let st = null;
const TABS = [
  ['Wallet', [['home', 'Portfolio', 'home'], ['wallets', 'Wallets', 'wallets'], ['receive', 'Receive', 'receive'], ['send', 'Send', 'send'], ['swap', 'Swap', 'swap'], ['sweep', 'Sweep', 'sweep']]],
  ['Bundle', [['bbuy', 'Bundle buy', 'receive'], ['bsell', 'Bundle sell', 'send']]],
  ['pump.fun', [['callouts', 'Callouts', 'callouts'], ['reply', 'Quick reply', 'edit'], ['templates', 'Templates', 'copy'], ['follow', 'Follow', 'stack'], ['like', 'Like', 'like']]],
  ['Insights', [['activity', 'Activity', 'activity'], ['pnl', 'PnL', 'bundle']]],
  ['', [['settings', 'Settings', 'settings']]],
];
const TAB_IDS = TABS.flatMap(([, items]) => items.map(([id]) => id));
const TAB_TITLE = Object.fromEntries(TABS.flatMap(([, items]) => items.map(([id, l]) => [id, l])));
const TAB_SUB = { home: 'Balances and coins across your wallets', wallets: 'Add, rename, group and remove wallets', receive: 'Addresses to fund your wallets', send: 'Send SOL or a coin to one wallet or many', swap: 'Buy or sell a coin from the active wallet', sweep: 'Pull SOL or a coin from many wallets into one', bbuy: 'Buy one coin from every wallet at once', bsell: 'Sell a share of the bag from every wallet', callouts: 'Post a different callout from each wallet', reply: 'Post one callout from the active wallet', templates: 'Saved callout text', follow: 'Have your wallets follow each other', like: 'Like a callout from every wallet', activity: 'Trades, sends and callouts', pnl: 'Profit and loss across your wallets', settings: 'RPC, trading defaults and look' };
const DOCKS = ['receive', 'send', 'swap', 'sweep'];
let navOpen = false;
let tab = store.get('tab', 'home');
if (!TAB_IDS.includes(tab)) tab = 'home';
let page = null;      // 'settings' | 'wallets' | 'reply'
let sheet = null;     // { kind, ...data }
let onb = null;       // 'done' right after the first wallet is added
const ui = { all: store.get('all', true) };
const holdings = {};  // address -> { sol, lamports, tokens, solUsd, error, loading }
let port = null, tlog = [], alog = [], pnl = null;
const meta = store.get('meta', {}); // mint -> { symbol, name, icon }
const callout = { info: null, text: '', error: '', status: '', autoSubmit: null };
const thesis = { stage: 'edit' };
const teach = { text: '', watching: false };
let drafts = null;
const bundle = { action: null }; // null = hub | 'buy' | 'sell'
const trade = { side: 'buy', mint: '', mode: 'sol', amount: '', sellPct: '', picked: null, bal: null, balErr: '', toks: null, toksMint: '', stage: 'form' };
const swap = { side: 'buy', mint: '', mode: 'sol', amount: '', sellPct: '', step: 'coin', bal: null, toks: null, toksMint: '', started: false };
const split = { asset: null, mode: 'total', amount: '', picked: null, extra: [], step: 'what', results: null, busy: false };
const wal = { mode: 'new', created: null, report: null, renaming: null, removing: null, moving: null, unfollowing: null, busy: false, select: false, sel: new Set(), confirm: false };
const act = { mode: 'activity', open: null, loaded: false };
const grp = { creating: false, renaming: false };
let followEx = new Set(); // wallets left out of 'follow each other'
chrome.storage.local.get('followExclude').then(r => { followEx = new Set(r.followExclude || []); if (st && (tab === 'wallets' || tab === 'follow')) render(); });
const saveFollowEx = () => chrome.storage.local.set({ followExclude: [...followEx] });
let followFocus = new Set(); // focus mode: the wallets everyone follows
chrome.storage.local.get('followFocus').then(r => { followFocus = new Set(r.followFocus || []); if (st && (tab === 'wallets' || tab === 'follow')) render(); });
const saveFollowFocus = () => chrome.storage.local.set({ followFocus: [...followFocus] });
let followExtra = []; // outside accounts to follow, pasted by the user
chrome.storage.local.get('followExtra').then(r => { followExtra = r.followExtra || []; if (st && (typeof tab !== 'undefined') && (tab === 'follow' || page === 'wallets')) render(); });
const saveFollowExtra = () => chrome.storage.local.set({ followExtra });
const fxDraft = { text: '', bad: [] };
// Pulls Solana addresses out of pasted text: plain addresses, pump.fun profile links, Solscan links, comma or line separated.
function parseAddrList(text) {
  const own = new Set(st.wallets.map(w => w.address));
  const good = [], bad = [], mine = [];
  for (const raw of String(text || '').split(/[\s,;]+/).filter(Boolean)) {
    const m = raw.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g);
    const a = m ? m[m.length - 1] : null;
    if (!a || !isAddress(a)) { bad.push(raw.length > 24 ? raw.slice(0, 22) + '…' : raw); continue; }
    if (own.has(a)) { mine.push(a); continue; }
    if (!good.includes(a)) good.push(a);
  }
  return { good, bad, mine };
}
let likeEx = null; // wallets left out of liking (null = not loaded yet: everyone but the callout's owner)
chrome.storage.local.get('likeExclude').then(r => { likeEx = r.likeExclude ? new Set(r.likeExclude) : null; if (st && tab === 'like' && !page) render(); });
const saveLikeEx = () => chrome.storage.local.set({ likeExclude: [...likeEx] });
const likeUi = { link: '', links: store.get('likeLinks', ''), open: new Set() };
const activeGroup = () => st.groups?.find(g => g.id === st.activeGroup) || { id: 'main', name: 'Main group', count: st.wallets.length };
function afterGroupChange() { resetData(); trade.picked = null; split.picked = null; split.extra = []; split.asset = null; bundle.action = null; trade.stage = 'form'; wal.select = false; wal.sel = new Set(); wal.moving = null; wal.renaming = null; wal.removing = null; act.loaded = false; }

const selectedWallet = () => st.wallets.find(w => w.address === st.selected) || st.wallets[0];
const walletOf = (a) => st.wallets.find(w => w.address === a);
const nameOf = (addr) => walletOf(addr)?.name || st.friends.find(f => f.address === addr)?.label || split.extra.find(e => e.address === addr)?.label || short(addr);
const isAll = () => ui.all && st.wallets.length > 1;
const applyTheme = () => {
  document.body.classList.toggle('photo', !!st?.settings?.showBackground);
  // 0 = photo barely visible, 100 = as clear as it gets while keeping text readable
  const vis = Math.min(100, Math.max(0, Number(st?.settings?.photoVis ?? 60)));
  const dim = .92 - vis * .006;
  document.body.style.setProperty('--dim', dim.toFixed(3));
  document.body.style.setProperty('--card-a', Math.max(.55, Math.min(.92, dim + .14)).toFixed(3));
};
const portReady = () => port && port !== 'loading' && !port.error;
const pnlReady = () => pnl && pnl !== 'loading' && !pnl.error;
let dataGen = 0, portBusy = false, pnlBusy = false;
function resetData() { dataGen++; portBusy = false; pnlBusy = false; port = null; pnl = null; trade.bal = null; trade.toks = null; for (const k of Object.keys(holdings)) delete holdings[k]; }

function noteMeta() {
  if (portReady()) for (const c of port.coins) meta[c.mint] = { symbol: c.symbol, name: c.name, icon: c.icon };
  const i = callout.info;
  if (i?.ca) meta[i.ca] = { symbol: meta[i.ca]?.symbol || i.ticker || null, name: meta[i.ca]?.name || i.name || null, icon: meta[i.ca]?.icon || null };
  store.set('meta', meta);
}
const coinLabel = (c) => c?.symbol ? '$' + c.symbol : c?.name || short(c?.mint);
const mintLabel = (m) => coinLabel({ mint: m, ...(meta[m] || {}) });
const coinIco = (c, size = '') => c.icon ? `<img class="ico img ${size}" src="${esc(c.icon)}" alt="" referrerpolicy="no-referrer">` : `<span class="ico ${size}">${esc((c.symbol || c.name || '?').slice(0, 2).toUpperCase())}</span>`;
const tokenLabel = (t) => t.symbol ? `$${t.symbol}` : t.name || meta[t.mint]?.symbol && '$' + meta[t.mint].symbol || short(t.mint);
const solIco = '<span class="ico sol" aria-hidden="true">◎</span>';

async function refresh() {
  st = await send({ type: 'getState' });
  if (st.unlocked && st.wallets.length && !st.wallets.some(w => w.address === st.selected)) st = await send({ type: 'select', address: st.wallets[0].address });
  render();
}

// ---------------- data ----------------
// Shows the last saved balances right away, then swaps in fresh ones when they arrive.
async function loadPort(force) {
  if (portBusy) return;
  portBusy = true; const gen = dataGen;
  const had = portReady() ? port : null;
  if (had) { had.refreshing = true; render(); }
  else {
    port = 'loading';
    try { const c = await send({ type: 'portfolioCached' }); if (gen !== dataGen) return; if (c) { port = { ...c, refreshing: true }; noteMeta(); } } catch {}
    render();
  }
  try {
    const [p, t, a] = await Promise.all([send({ type: 'portfolio', force: !!force }), send({ type: 'tradeLog' }).catch(() => []), send({ type: 'activityLog' }).catch(() => [])]);
    if (gen !== dataGen) return;
    port = p; tlog = t || []; alog = a || []; noteMeta();
  } catch (e) {
    if (gen !== dataGen) return;
    if (portReady()) { port.refreshing = false; toast("Couldn't refresh balances: " + e.message); }
    else port = { error: e.message };
  } finally { if (gen === dataGen) portBusy = false; }
  render();
}
async function loadLogs() {
  try { const [t, a] = await Promise.all([send({ type: 'tradeLog' }), send({ type: 'activityLog' }).catch(() => [])]); tlog = t || []; alog = a || []; } catch {}
  render();
}
async function loadPnl(force) {
  if (pnlBusy) return;
  pnlBusy = true; const gen = dataGen;
  if (!pnlReady()) {
    pnl = 'loading';
    try { const c = await send({ type: 'pnlCached' }); if (gen !== dataGen) return; if (c) pnl = c; } catch {}
    render();
  }
  try { const r = await send({ type: 'pnl', force: !!force }); if (gen !== dataGen) return; pnl = r; }
  catch (e) { if (gen !== dataGen) return; if (!pnlReady()) pnl = { error: e.message }; }
  finally { if (gen === dataGen) pnlBusy = false; }
  render();
}
async function loadHoldings(address, force) {
  if (!address) return;
  if (holdings[address] && !force && !holdings[address].error) return;
  holdings[address] = { loading: true }; render();
  try { holdings[address] = await send({ type: 'holdings', address }); }
  catch (e) { holdings[address] = { error: e.message }; }
  render();
}

// ---------------- rendering core ----------------
function withKeep(scope, fn) {
  const a = document.activeElement;
  const id = a && a.id && scope.contains(a) ? a.id : null;
  let sel = null;
  try { if (id && typeof a.selectionStart === 'number') sel = [a.selectionStart, a.selectionEnd]; } catch {}
  fn();
  if (id) {
    const b = document.getElementById(id);
    if (b && b !== document.activeElement) { b.focus({ preventScroll: true }); if (sel) try { b.setSelectionRange(sel[0], sel[1]); } catch {} }
  }
}

let rendering = false, renderAgain = false;
function render() {
  if (!st) return;
  if (rendering) { renderAgain = true; return; }
  rendering = true;
  try { do { renderAgain = false; renderMain(); if (sheet) renderSheet(); } while (renderAgain); }
  finally { rendering = false; }
}

let lastKey = '';
const NAV = [['home', 'Home', I.home], ['bundle', 'Bundle', I.bundle], ['callouts', 'Callouts', I.callouts], ['like', 'Like', I.like], ['activity', 'Activity', I.activity]];
const PAGE_TITLES = { settings: 'Settings', wallets: 'Wallets', reply: 'Quick reply', templates: 'Callout templates' };

function renderMain() {
  applyTheme();
  if (!st.hasVault) { closeSheet(); lastKey = ''; return renderSetup(); }
  if (!st.unlocked) { closeSheet(); lastKey = ''; return renderUnlock(); }
  if (!(st.allCount ?? st.wallets.length) || onb) { document.body.classList.remove('fullphoto'); lastKey = ''; return renderOnboard(); }
  if (!st.wallets.length) { document.body.classList.remove('fullphoto'); lastKey = ''; return renderEmptyGroup(); }
  const key = viewKey();
  const old = document.getElementById('view');
  const sc = old && lastKey === key ? old.scrollTop : 0;
  withKeep(root, () => {
    root.innerHTML = tabShell();
    wireShell();
    document.body.classList.toggle('fullphoto', !page && tab === 'activity' && act.mode === 'pnl' && !!st.settings.showBackground);
    (VIEWS[tab] || VIEWS.home)();
  });
  const v = document.getElementById('view'); if (v) v.scrollTop = sc;
  lastKey = key;
}

// Scroll position is kept while a screen re-renders, and reset when you move to a different screen or step.
function viewKey() {
  if (tab === 'wallets') return `wallets:${wal.select}:${wal.confirm}`;
  if (page) return page;
  if (DOCKS.includes(tab)) return tab + ':' + (SHEET_STEP[tab]?.() || '');
  if (tab === 'bbuy' || tab === 'bsell') return `${tab}:${bundle.action}:${trade.stage}:${st.jobs?.buy ? 'job' : ''}`;
  if (tab === 'callouts') return `callouts:${thesis.stage}:${st.jobs?.thesis ? 'job' : ''}`;
  if (tab === 'like') return `like:${st.jobs?.like ? 'job' : ''}`; // web like runs keep the scroll position while they update
  if (tab === 'activity') return 'activity:' + act.mode;
  return tab;
}

function acctBtn() {
  const w = selectedWallet(), all = isAll();
  return `<button class="acct" id="acctBtn" aria-label="Switch wallet or group" aria-haspopup="dialog">${all ? avatarAll('sm') : avatar(w, 'sm')}<span class="acct-txt">${st.groups?.length > 1 ? `<span class="acct-grp trunc">${esc(activeGroup().name)}</span>` : ''}<span class="trunc">${!st.wallets.length ? 'No wallets' : all ? 'All wallets' : esc(w?.name || 'Wallet')}</span></span>${I.chev}</button>`;
}
const runningJob = (id) => { const j = st.jobs && ({ bbuy: st.jobs.buy, bsell: st.jobs.buy, callouts: st.jobs.thesis, follow: st.jobs.follow, like: st.jobs.like })[id]; return !!(j && !j.done) || (id === 'like' && !!st.jobs?.likes?.some(r => !r.done)); };
const navHtml = () => TABS.map(([label, items]) => `<div class="sgrp">${label ? `<div class="sgl">${esc(label)}</div>` : ''}${items.map(([id, l, ico]) => `<button class="sitem${tab === id ? ' active' : ''}" data-tab="${id}" ${tab === id ? 'aria-current="page"' : ''}>${I[ico] || ''}<span>${esc(l)}</span>${runningJob(id) ? '<span class="sdot" title="Running"></span>' : ''}</button>`).join('')}</div>`).join('');
const tabShell = () => `<div class="app${navOpen ? ' nav-open' : ''}">
  <aside class="side" aria-label="Main">
    <div class="brand"><span class="logo">${I.mark}</span><b>Truth</b><span class="ver">web</span></div>
    ${acctBtn()}
    <nav class="snav">${navHtml()}</nav>
  </aside>
  <div class="scrim-nav" id="navScrim"></div>
  <div class="mainc">
    <header class="top">
      <button class="btn icon ghost menu" id="menuBtn" aria-label="Open menu">${I.stack}</button>
      <div class="ttl"><h1 class="ptitle">${esc(TAB_TITLE[tab] || 'Truth')}</h1><p class="psub">${esc(TAB_SUB[tab] || '')}</p></div>
      <div class="spacer"></div>
      ${tab === 'wallets' ? `<button class="btn sm primary" id="addW">${I.plus} Add wallet</button>` : ''}
      <button class="btn icon ghost" id="copyBtn" title="Copy ${esc(selectedWallet()?.name || '')}'s address" aria-label="Copy address">${I.copy}</button>
      <button class="btn icon ghost" id="lockBtn" title="Lock" aria-label="Lock">${I.lock}</button>
    </header>
    <main id="view" class="view" data-v="${tab}"></main>
  </div>
</div>`;

function wireShell() {
  on('#acctBtn', 'click', () => openSheet('accounts'));
  on('#copyBtn', 'click', () => { const w = selectedWallet(); if (w) copy(w.address, `${w.name}'s address copied`); });
  on('#lockBtn', 'click', async () => { closeSheet(); await send({ type: 'lock' }); refresh(); });
  on('#menuBtn', 'click', () => { navOpen = !navOpen; document.querySelector('.app')?.classList.toggle('nav-open', navOpen); });
  on('#navScrim', 'click', () => { navOpen = false; document.querySelector('.app')?.classList.remove('nav-open'); });
  on('#addW', 'click', () => openAdd());
  $$('.sitem').forEach(b => b.onclick = () => go({ tab: b.dataset.tab }));
}
function go({ tab: t, page: p }) {
  const n = p !== undefined ? (p || 'home') : t;
  if (n !== undefined) { tab = n; page = null; navOpen = false; store.set('tab', n); if (n === 'activity' || n === 'pnl') act.loaded = false; if (DOCK_INIT[n]) dockInit[n] = false; }
  closeSheet();
  renderMain();
}

// ---------------- sheets ----------------
let sheetKey = '';
const SHEET_STEP = { sweep: () => sw.step, send: () => split.step, swap: () => swap.step, add: () => wal.mode + (wal.created ? 'c' : '') + (wal.report ? 'r' : '') };
function openSheet(kind, data = {}) {
  if (DOCKS.includes(kind)) { dockInit[kind] = true; sheet = null; sheetHost.innerHTML = ''; sheetHost.classList.remove('open'); if (tab !== kind) { tab = kind; navOpen = false; store.set('tab', kind); } renderMain(); return; }
  sheet = { kind, ...data };
  sheetHost.innerHTML = `<div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="sheet-body" id="sbody"></div></div>`;
  sheetHost.classList.add('open');
  sheetHost.querySelector('.scrim').onclick = () => closeSheet();
  sheetKey = '';
  renderSheet();
}
function closeSheet() { if ((sheet?.kind === 'send' && split.busy) || (sheet?.kind === 'sweep' && sw.busy)) { toast('Sending… wait for it to finish'); return; } sheet = null; sheetHost.innerHTML = ''; sheetHost.classList.remove('open'); }
function renderSheet() {
  if (!sheet) { if (DOCKS.includes(tab) && st?.unlocked && st.wallets.length) renderMain(); return; }
  const b = document.getElementById('sbody'); if (!b) return;
  const key = sheet.kind + ':' + (SHEET_STEP[sheet.kind]?.() || '');
  const sc = key === sheetKey ? b.scrollTop : 0;
  withKeep(b, () => SHEETS[sheet.kind](b));
  b.scrollTop = sc; sheetKey = key;
}
const sheetHead = (title, back = false) => `<div class="shead">${back ? `<button class="btn icon ghost" id="sBack" aria-label="Back">${I.back}</button>` : '<span class="shead-pad"></span>'}<h2 class="trunc">${esc(title)}</h2><button class="btn icon ghost" id="sClose" aria-label="Close">${I.x}</button></div>`;
const wireHead = (onBack) => { on('#sClose', 'click', closeSheet); if (onBack) on('#sBack', 'click', onBack); };
const fromChip = (w) => `<div class="from">From ${avatar(w, 'sm')}<b>${esc(w.name)}</b></div>`;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet) { e.preventDefault(); closeSheet(); } });

// ---------------- setup / unlock / onboarding ----------------
const dots = (n) => `<div class="dots">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}<span>Step ${n} of 3</span></div>`;

function renderSetup() {
  root.innerHTML = `<div class="onb">${dots(1)}
    <div class="logo">${I.mark}</div>
    <h1>Create a password</h1>
    <p>It encrypts every key you add and never leaves this browser. There's no reset: if you forget it, you clear this site's data and import your keys again.</p>
    <label class="field"><span class="lbl">Password</span><input id="p1" type="password" autocomplete="new-password" placeholder="At least 8 characters"></label>
    <label class="field"><span class="lbl">Confirm password</span><input id="p2" type="password" autocomplete="new-password"></label>
    <p class="err" id="err"></p>
    <div class="grow-space"></div>
    <div class="actions"><button class="btn primary" id="go">Continue</button></div></div>`;
  const go = async () => {
    const p1 = $('#p1').value, p2 = $('#p2').value;
    if (p1.length < 8) return $('#err').textContent = 'Use at least 8 characters';
    if (p1 !== p2) return $('#err').textContent = "Passwords don't match";
    try { await send({ type: 'setup', password: p1 }); await refresh(); } catch (e) { $('#err').textContent = e.message; }
  };
  on('#go', 'click', go); enterTo('#p2', go); enterTo('#p1', () => $('#p2').focus());
  $('#p1').focus();
}

function renderUnlock() {
  root.innerHTML = `<div class="onb">
    <div class="logo">${I.mark}</div>
    <h1>Welcome back</h1>
    <p>${st.wallets.length ? `${plural(st.wallets.length, 'wallet')} in your vault.` : 'Your vault is empty. Unlock to add wallets.'}</p>
    <label class="field"><span class="lbl">Password</span><input id="pw" type="password" autocomplete="current-password"></label>
    <p class="err" id="err"></p>
    <div class="grow-space"></div>
    <div class="actions"><button class="btn primary" id="go">Unlock</button></div></div>`;
  const go = async () => {
    const b = $('#go'); b.disabled = true;
    try { await send({ type: 'unlock', password: $('#pw').value }); await refresh(); }
    catch (e) { $('#err').textContent = e.message; b.disabled = false; $('#pw').select(); }
  };
  on('#go', 'click', go); enterTo('#pw', go);
  $('#pw').focus();
}

function renderOnboard() {
  if (onb === 'done' && st.wallets.length) {
    const w = selectedWallet();
    root.innerHTML = `<div class="onb">${dots(3)}
      <div class="onb-ico ok">${I.check}</div>
      <h1>You're set</h1>
      <p><b>${esc(w.name)}</b> is ready. Send SOL to this address to start trading.</p>
      <div class="addr mono" style="margin-top:16px">${esc(w.address)}</div>
      <div class="grow-space"></div>
      <div class="actions col"><button class="btn primary" id="oGo">Open wallet</button><button class="btn" id="oCopy">${I.copy} Copy address</button></div></div>`;
    on('#oGo', 'click', () => { onb = null; tab = 'home'; closeSheet(); render(); });
    on('#oCopy', 'click', () => copy(w.address, 'Address copied'));
    return;
  }
  root.innerHTML = `<div class="onb">${dots(2)}
    <div class="logo">${I.mark}</div>
    <h1>Add your first wallet</h1>
    <p>Create a fresh wallet, or import keys you already have. You can add more later.</p>
    <div class="grow-space"></div>
    <div class="actions col">
      <button class="btn primary" id="oNew">${I.plus} Create a new wallet</button>
      <button class="btn" id="oOne">Import a private key</button>
      <button class="btn ghost" id="oMany">Import many at once</button>
    </div></div>`;
  on('#oNew', 'click', () => openAdd('new'));
  on('#oOne', 'click', () => openAdd('one'));
  on('#oMany', 'click', () => openAdd('many'));
}

// ---------------- job helpers ----------------
let pollTimer = null;
// While a job runs the popup re-checks its state. Rebuilding the screen mid-scroll makes scrolling jump,
// so: skip the rebuild when nothing changed, and hold it until the user has stopped scrolling.
let lastScrollAt = 0, pointerHeld = false, deferredRender = null;
const noteScroll = () => { lastScrollAt = Date.now(); };
for (const ev of ['scroll', 'wheel', 'touchmove', 'keydown']) document.addEventListener(ev, noteScroll, { capture: true, passive: true });
document.addEventListener('pointerdown', () => { pointerHeld = true; noteScroll(); }, { capture: true, passive: true });
document.addEventListener('pointerup', () => { pointerHeld = false; noteScroll(); }, { capture: true, passive: true });
const userScrolling = () => pointerHeld || Date.now() - lastScrollAt < 700;
function renderWhenIdle() {
  if (deferredRender) return;
  const tick = () => { if (userScrolling()) { deferredRender = setTimeout(tick, 200); return; } deferredRender = null; render(); };
  tick();
}
async function pollRefresh() {
  let next;
  try { next = await send({ type: 'getState' }); } catch { pollWhileRunning(); return; }
  const same = JSON.stringify(next) === JSON.stringify(st);
  st = next;
  if (same) { pollWhileRunning(); return; }
  if (userScrolling()) { renderWhenIdle(); pollWhileRunning(); return; }
  render();
}
function pollWhileRunning() {
  const running = Object.values(st.jobs || {}).flat().some(j => j && !j.done);
  if (running && !pollTimer) pollTimer = setTimeout(async () => { pollTimer = null; await pollRefresh(); }, 2000);
}
function statusDot(state) {
  const map = { waiting: ['', '·'], preparing: ['run', ''], posting: ['run', ''], buying: ['run', ''], selling: ['run', ''], posted: ['ok', '✓'], bought: ['ok', '✓'], sold: ['ok', '✓'], failed: ['bad', '!'], skipped: ['skip', '–'] };
  const [cls, ch] = map[state] || ['', '·'];
  return `<span class="status ${cls}" title="${esc(state)}">${ch}</span>`;
}
function jobBanner() {
  const out = [];
  const b = st.jobs?.buy, t = st.jobs?.thesis;
  if (b) {
    const ok = b.rows.filter(r => r.state === 'bought' || r.state === 'sold').length;
    const sell = b.side === 'sell';
    out.push(`<button class="banner" data-go="bundle">${statusDot(!b.done ? 'buying' : ok === b.rows.length ? 'bought' : 'failed')}<span class="grow"><span class="t">${b.done ? `${sell ? 'Sold' : 'Bought'} from ${ok} of ${b.rows.length}` : `${sell ? 'Selling' : 'Buying'} ${esc(mintLabel(b.mint))}`}</span><span class="d">${b.done ? 'Tap to review' : plural(b.rows.length, 'wallet') + ' · keeps running if you close this'}</span></span><span class="chev">${I.right}</span></button>`);
  }
  if (t && !t.done) {
    const n = t.rows.filter(r => r.state === 'posted').length;
    out.push(`<button class="banner" data-go="callouts">${statusDot('posting')}<span class="grow"><span class="t">Posting callouts · ${n}/${t.rows.length}</span><span class="d">Keep the pump.fun tab open</span></span><span class="chev">${I.right}</span></button>`);
  }
  if (out.length) pollWhileRunning();
  return out.join('');
}
const wireBanner = () => $$('[data-go]').forEach(b => b.onclick = () => go({ tab: b.dataset.go }));

function jobHtml(job, p = '') {
  const sell = job.side === 'sell';
  const okN = job.rows.filter(r => r.state === 'bought' || r.state === 'sold').length;
  const failN = job.rows.filter(r => r.state === 'failed').length;
  return `
    <div class="row"><h2 style="margin:0">${job.done ? (sell ? 'Sold' : 'Bought') + ` from ${okN} of ${job.rows.length}` : sell ? `Selling ${job.pct}%` : 'Buying'}</h2>${job.done ? '' : '<span class="badge on live"><span class="dot"></span>running</span>'}</div>
    <div class="coinline">${coinIco({ mint: job.mint, ...(meta[job.mint] || {}) })}<b>${esc(mintLabel(job.mint))}</b><span class="mono muted trunc">${short(job.mint)}</span></div>
    <div class="list" style="margin-top:12px">${job.rows.map(r => `<div class="item">${statusDot(r.state)}<div class="grow">
      <div class="name">${esc(nameOf(r.address))}</div>
      <div class="sub num">${sell ? `${fmtNum(fromRaw(BigInt(r.tokenRaw), r.decimals))} tokens${r.solChange != null ? ` → +${r.solChange.toFixed(4)} SOL` : ''}` : fromRaw(BigInt(r.lamports), 9) + ' SOL'}${r.route ? ` · ${esc(r.route)}` : ''}</div>
      ${r.error ? `<div class="sub" style="color:var(--loss)">${esc(r.error)}</div>` : ''}</div>
      ${r.signature ? `<a class="btn icon ghost" title="View on Solscan" target="_blank" rel="noopener" href="https://solscan.io/tx/${r.signature}">${I.ext}</a>` : ''}</div>`).join('')}</div>
    ${job.done && failN ? `<div class="note warn">${plural(failN, 'wallet')} failed. The others went through. Check Solscan before trying those again.</div>` : ''}
    ${job.done ? `<div class="actions"><button class="btn primary" id="${p}done">Done</button></div>` : '<p class="hint">You can close this popup. It keeps running.</p>'}`;
}

// ---------------- Home ----------------
const actsHtml = () => `<div class="acts">${[['send', 'Send', I.send], ['swap', 'Swap', I.swap], ['bundle', 'Bundle', I.bundle], ['receive', 'Receive', I.receive], ...(st.wallets.length > 1 ? [['sweep', 'Sweep', I.sweep]] : [])].map(([id, l, ico]) => `<button class="act" data-act="${id}"><span class="act-ico">${ico}</span><span>${l}</span></button>`).join('')}</div>`;
function wireActs() {
  $$('[data-act]').forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'send') openSend();
    else if (a === 'swap') openSwap();
    else if (a === 'bundle') go({ tab: 'bbuy' });
    else if (a === 'sweep') openSweep();
    else openSheet('receive');
  });
}

function viewHome() {
  const v = $('#view');
  if (port === null) loadPort();
  if (pnl === null) loadPnl();
  const all = isAll(), w = selectedWallet();
  const top = jobBanner();
  if (!portReady()) {
    v.innerHTML = top + (port?.error
      ? `<div class="note bad"><b>Couldn't load balances.</b> ${esc(port.error)}<br><span class="dim">${/api\.mainnet-beta\.solana\.com|publicnode\.com/.test(st.settings?.rpc || '') ? 'The free public RPC rate-limits often. Add a Helius or other RPC URL in Settings.' : 'Your RPC is limiting requests right now. Wait a few seconds and try again.'}</span><div class="actions end"><button class="btn sm" id="rl">Try again</button></div></div>`
      : '<div class="hero"><div class="sk" style="width:90px;margin:4px auto"></div><div class="sk big" style="margin:12px auto 6px"></div><div class="sk" style="width:120px;margin:0 auto"></div></div>'
        + (st.wallets.length > 5 ? `<p class="hint center" style="margin-top:8px">Loading balances for ${st.wallets.length} wallets. On a free RPC plan this can take up to ~20 seconds.</p>` : ''))
      + actsHtml() + '<div class="sec-row"></div><div class="sk row"></div><div class="sk row"></div><div class="sk row"></div>';
    wireActs(); wireBanner(); on('#rl', 'click', () => loadPort(true));
    return;
  }
  let usd, sol, solUsd, p = null;
  if (all) {
    usd = port.totals.usd; sol = port.totals.sol; solUsd = port.wallets.reduce((x, r) => x + (r.solUsd || 0), 0);
    if (pnlReady()) p = pnl.totals.pnl;
  } else {
    const x = port.wallets.find(r => r.address === w.address) || { sol: 0, solUsd: 0, tokenUsd: 0 };
    usd = (x.solUsd || 0) + (x.tokenUsd || 0); sol = x.sol; solUsd = x.solUsd;
    const pw = pnlReady() ? pnl.wallets.find(r => r.address === w.address) : null;
    if (pw && !pw.error) p = pw.realized + pw.unrealized;
  }
  const coins = (all ? port.coins.map(c => ({ ...c, amt: c.totalUi, usd: c.totalUsd, p: c.hasPnl ? c.pnlUsd : null }))
    : port.coins.filter(c => c.holders.some(h => h.address === w.address)).map(c => { const h = c.holders.find(x => x.address === w.address); return { ...c, amt: h.ui, usd: h.usd, p: h.pnlUsd }; }))
    .sort((a, b) => (b.usd || 0) - (a.usd || 0));
  const bad = all ? port.wallets.filter(x => x.error) : port.wallets.filter(x => x.error && x.address === w.address);
  const coinRow = (c) => `<button class="trow" data-coin="${c.mint}">${coinIco(c)}<span class="grow"><span class="name">${esc(coinLabel(c))}</span><span class="sub num">${fmtNum(c.amt)}${all && c.holders.length > 1 ? ` · ${c.holders.length} wallets` : ''}</span></span>
    <span class="right"><span class="v num">${c.usd ? fmtUsd(c.usd) : '—'}</span><span class="sub num ${c.p != null ? tone(c.p) : ''}">${c.p != null ? signed(c.p) : c.price != null ? fmtPrice(c.price) : ''}</span></span></button>`;

  v.innerHTML = `${top}
    <section class="hero">
      <div class="hero-label">${all ? `All ${plural(st.wallets.length, 'wallet')}` : esc(w.name)}</div>
      <div class="hero-usd num">${fmtUsd(usd) || '$0.00'}</div>
      <div class="hero-sub"><span class="num">${fmtNum(sol, 4)} SOL</span>${p != null ? `<span class="pill ${tone(p)} num" title="Profit and loss from pump.fun">${signed(p)} PnL</span>` : ''}</div>
    </section>
    ${actsHtml()}
    ${!sol && !coins.length ? `<div class="cta"><div class="grow"><div class="t">Fund ${all ? 'your wallets' : 'this wallet'}</div><div class="d">Send SOL to ${all ? 'a wallet' : 'it'} to start trading.</div></div><button class="btn sm primary" id="fund">Receive</button></div>` : ''}
    ${bad.length ? `<div class="note warn">Couldn't read ${bad.map(x => esc(nameOf(x.address))).join(', ')}. Balances may be low. <button class="link" id="rl">Retry</button></div>` : ''}
    <div class="row sec-row"><h3 class="sec">Tokens</h3><button class="btn icon ghost" id="rf" title="Refresh" aria-label="Refresh">${I.refresh}</button></div>
    <div class="list">
      <button class="trow" data-coin="SOL">${solIco}<span class="grow"><span class="name">Solana</span><span class="sub num">${fmtNum(sol, 4)} SOL</span></span><span class="right"><span class="v num">${solUsd != null ? fmtUsd(solUsd) : '—'}</span><span class="sub num">${port.solPrice ? fmtUsd(port.solPrice) : ''}</span></span></button>
      ${coins.map(coinRow).join('')}
    </div>
    ${coins.length ? '' : '<p class="hint center">No coins yet. Tap Swap to buy one.</p>'}
    <p class="hint center">Balances from your RPC, PnL from pump.fun · ${port.refreshing ? 'refreshing…' : `updated ${ago(port.at)}`}</p>`;

  wireActs(); wireBanner();
  on('#fund', 'click', () => openSheet('receive'));
  on('#rf', 'click', () => { loadPnl(true); loadPort(true); });
  on('#rl', 'click', () => loadPort(true));
  $$('[data-coin]').forEach(el => el.onclick = () => openSheet('token', { mint: el.dataset.coin }));
}

// ---------------- sheet: accounts ----------------
function sheetAccounts(b) {
  if (port === null) loadPort();
  const all = isAll();
  const bal = (a) => portReady() ? port.wallets.find(x => x.address === a) : null;
  b.innerHTML = sheetHead('Your wallets') + `
    <div class="label" style="margin-bottom:6px">Groups</div>
    <div class="gchips">${(st.groups || []).map(g => `<button class="gchip ${g.id === st.activeGroup ? 'active' : ''}" data-grp="${g.id}">${esc(g.name)}<span class="num">${g.count}</span></button>`).join('')}<button class="gchip add" id="sNewGrp">${I.plus} New group</button></div>
    ${grp.creating ? `<div style="display:flex;gap:8px;margin-top:10px"><input id="sGrpName" placeholder="Group name, e.g. Weekend crew" maxlength="30" autocomplete="off" aria-label="New group name"><button class="btn sm primary" id="sGrpCreate">Create</button></div><p class="err" id="sGrpErr"></p>` : ''}
    <div class="label" style="margin:16px 0 6px">Wallets in ${esc(activeGroup().name)}</div>
    <div class="list">
      ${!st.wallets.length ? '<div class="empty">No wallets in this group yet.</div>' : ''}
      ${st.wallets.length > 1 ? `<button class="row-btn ${all ? 'selected' : ''}" data-acct="__all">${avatarAll()}<span class="grow"><span class="name">All wallets</span><span class="sub">${plural(st.wallets.length, 'wallet')} combined</span></span><span class="right"><span class="v num">${portReady() ? fmtUsd(port.totals.usd) : ''}</span></span>${all ? `<span class="tick">${I.check}</span>` : ''}</button>` : ''}
      ${st.wallets.map(w => { const x = bal(w.address), cur = !all && w.address === st.selected; return `
        <button class="row-btn ${cur ? 'selected' : ''}" data-acct="${w.address}">${avatar(w)}<span class="grow"><span class="name">${esc(w.name)}</span><span class="sub mono">${short(w.address)}</span></span><span class="right"><span class="v num">${x ? fmtNum(x.sol, 3) + ' SOL' : ''}</span><span class="sub num">${x && (x.solUsd || x.tokenUsd) ? fmtUsd((x.solUsd || 0) + x.tokenUsd) : ''}</span></span>${cur ? `<span class="tick">${I.check}</span>` : ''}</button>`; }).join('')}
    </div>
    <div class="actions"><button class="btn" id="sManage">${I.wallets} Manage</button><button class="btn primary" id="sAdd">${I.plus} Add wallet</button></div>`;
  wireHead();
  S$('[data-acct]').forEach(el => el.onclick = async () => {
    const a = el.dataset.acct;
    if (a === '__all') { ui.all = true; store.set('all', true); closeSheet(); render(); return; }
    ui.all = false; store.set('all', false);
    if (a !== st.selected) { await send({ type: 'select', address: a }); split.picked = null; split.asset = null; }
    closeSheet(); await refresh();
  });
  on('#sManage', 'click', () => go({ page: 'wallets' }));
  on('#sAdd', 'click', () => openAdd());
  S$('[data-grp]').forEach(el => el.onclick = async () => {
    if (el.dataset.grp === st.activeGroup) return;
    st = await send({ type: 'groupSwitch', id: el.dataset.grp }); afterGroupChange(); grp.creating = false; render();
  });
  on('#sNewGrp', 'click', () => { grp.creating = !grp.creating; renderSheet(); setTimeout(() => $('#sGrpName')?.focus(), 0); });
  const mk = async () => {
    try { st = await send({ type: 'groupCreate', name: $('#sGrpName').value }); afterGroupChange(); grp.creating = false; closeSheet(); toast(`Made ${activeGroup().name}`); render(); }
    catch (e) { $('#sGrpErr').textContent = e.message; }
  };
  on('#sGrpCreate', 'click', mk); enterTo('#sGrpName', mk);
}

// ---------------- sheet: receive ----------------
function sheetReceive(b) {
  const w = selectedWallet();
  b.innerHTML = sheetHead('Receive') + `
    <div class="recv">
      <div class="recv-who">${avatar(w, 'sm')}<b>${esc(w.name)}</b></div>
      <div class="qr">${qrSvg(w.address)}</div>
      <div class="mono addr">${esc(w.address)}</div>
      <p class="hint center" style="margin:0">Send SOL or any Solana token to this address.${st.wallets.length > 1 ? ' To receive into another wallet, switch wallets at the top first.' : ''}</p>
    </div>
    <div class="actions"><button class="btn primary" id="sCopy">${I.copy} Copy address</button><a class="btn" href="https://solscan.io/account/${w.address}" target="_blank" rel="noopener">Solscan ${I.ext}</a></div>`;
  wireHead();
  on('#sCopy', 'click', () => copy(w.address, 'Address copied'));
}

// ---------------- sheet: token detail ----------------
function sheetToken(b) {
  const all = isAll(), w = selectedWallet();
  if (sheet.mint === 'SOL') {
    const x = portReady() ? (all ? { sol: port.totals.sol, usd: port.wallets.reduce((a, r) => a + (r.solUsd || 0), 0) } : (r => r ? { sol: r.sol, usd: r.solUsd } : null)(port.wallets.find(r => r.address === w.address))) : null;
    b.innerHTML = sheetHead('Solana') + `
      <div class="tok-hero"><span class="ico sol lg">◎</span><div class="big num">${x?.usd != null ? fmtUsd(x.usd) : '—'}</div><div class="sub num">${x ? fmtNum(x.sol, 4) : '0'} SOL${port?.solPrice ? ' · ' + fmtUsd(port.solPrice) : ''}</div></div>
      ${all ? `<h3 class="sec">By wallet</h3><div class="list">${port.wallets.map(r => `<div class="item">${avatar(walletOf(r.address), 'sm')}<div class="grow"><div class="name">${esc(nameOf(r.address))}</div></div><div class="right"><div class="v num">${fmtNum(r.sol, 4)} SOL</div><div class="sub num">${r.solUsd != null ? fmtUsd(r.solUsd) : ''}</div></div></div>`).join('')}</div>` : ''}
      <div class="actions"><button class="btn primary" id="sSend">${I.send} Send</button><button class="btn" id="sRecv">${I.receive} Receive</button></div>`;
    wireHead();
    on('#sSend', 'click', () => openSend('SOL'));
    on('#sRecv', 'click', () => openSheet('receive'));
    return;
  }
  const c = portReady() ? port.coins.find(x => x.mint === sheet.mint) : null;
  if (!c) { b.innerHTML = sheetHead(mintLabel(sheet.mint)) + '<div class="empty"><b>Not in your wallets</b>None of your wallets hold this coin right now.</div>'; wireHead(); return; }
  const mine = c.holders.find(h => h.address === st.selected);
  const amt = all ? c.totalUi : mine?.ui || 0, usd = all ? c.totalUsd : mine?.usd, p = all ? (c.hasPnl ? c.pnlUsd : null) : mine?.pnlUsd;
  const missing = st.wallets.filter(x => !c.holders.some(h => h.address === x.address));
  b.innerHTML = sheetHead(coinLabel(c)) + `
    <div class="tok-hero">${coinIco(c, 'lg')}<div class="big num">${usd ? fmtUsd(usd) : '—'}</div><div class="sub num">${fmtNum(amt)} ${esc(c.symbol || 'tokens')}${c.price != null ? ' · ' + fmtPrice(c.price) : ''}</div>${p != null ? `<span class="pill ${tone(p)} num">${signed(p)} PnL</span>` : ''}</div>
    ${all ? `<h3 class="sec">Held by ${c.holders.length} of ${st.wallets.length} wallets</h3>
      <div class="list">${c.holders.map(h => `<div class="item">${avatar(walletOf(h.address), 'sm')}<div class="grow"><div class="name">${esc(nameOf(h.address))}</div><div class="sub num">${fmtNum(h.ui)}</div></div><div class="right"><div class="v num">${h.usd != null ? fmtUsd(h.usd) : ''}</div><div class="sub num ${h.pnlUsd != null ? tone(h.pnlUsd) : ''}">${h.pnlUsd != null ? signed(h.pnlUsd) : ''}</div></div></div>`).join('')}</div>
      ${missing.length ? `<p class="hint">Not held by: ${missing.map(x => esc(x.name)).join(', ')}</p>` : ''}` : ''}
    <div class="actions">
      ${all ? '<button class="btn primary" id="sBB">Bundle buy</button><button class="btn" id="sBS">Bundle sell</button>'
        : `<button class="btn primary" id="sBuy">Buy</button><button class="btn" id="sSell" ${mine ? '' : 'disabled'}>Sell</button>`}
      <button class="btn" id="sSend" ${mine ? '' : 'disabled'} title="${mine ? '' : `${esc(w.name)} doesn't hold this`}">Send</button>
      ${st.wallets.length > 1 ? `<button class="btn" id="sSweep">${I.sweep} Sweep</button>` : ''}
    </div>
    <div class="links"><a href="https://pump.fun/coin/${c.mint}" target="_blank" rel="noopener">pump.fun ${I.ext}</a><a href="https://solscan.io/token/${c.mint}" target="_blank" rel="noopener">Solscan ${I.ext}</a><button class="link" id="sCa">${I.copy} Copy CA</button></div>`;
  wireHead();
  const toBundle = (side) => { trade.side = side; trade.mint = c.mint; trade.stage = 'form'; trade.toks = null; trade.picked = null; bundle.action = side; go({ tab: side === 'sell' ? 'bsell' : 'bbuy' }); };
  on('#sBB', 'click', () => toBundle('buy'));
  on('#sBS', 'click', () => toBundle('sell'));
  on('#sBuy', 'click', () => openSwap('buy', c.mint));
  on('#sSell', 'click', () => openSwap('sell', c.mint));
  on('#sSend', 'click', () => openSend(c.mint));
  on('#sCa', 'click', () => copy(c.mint, 'Coin address copied'));
  on('#sSweep', 'click', () => openSweep(c.mint));
}

// ---------------- sheet: send (one or many recipients) ----------------
function splitAsset(h) {
  if (split.asset === 'SOL') return { kind: 'SOL', label: 'SOL', decimals: 9, raw: BigInt(h.lamports) };
  const t = h.tokens.find(x => x.mint === split.asset);
  return t ? { kind: 'TOKEN', label: tokenLabel(t), decimals: t.decimals, raw: BigInt(t.raw), mint: t.mint, program: t.program, account: t.account } : null;
}
function splitCalc(h) {
  const asset = splitAsset(h);
  const recips = split.picked;
  const n = BigInt(recips.length);
  const out = { asset, n: recips.length, per: 0n, total: 0n, error: '', warn: '' };
  if (!asset) { out.error = 'Pick what to send'; return out; }
  if (!recips.length) { out.error = 'Pick at least one wallet to send to'; return out; }
  if (!split.amount) return out;
  let amt;
  try { amt = toRaw(split.amount, asset.decimals); } catch (e) { out.error = e.message; return out; }
  if (split.mode === 'total') { out.per = amt / n; out.total = out.per * n; } else { out.per = amt; out.total = amt * n; }
  if (out.per === 0n) { out.error = 'Too small to split that many ways'; return out; }
  const txs = BigInt(Math.ceil(recips.length / (asset.kind === 'SOL' ? 15 : 6)));
  const feeLamports = txs * 5000n + txs * 250000n * BigInt(st.settings.priorityMicroLamports || 0) / 1_000_000n;
  const rent = asset.kind === 'SOL' ? 0n : ATA_RENT_LAMPORTS * n;
  out.feeSol = fromRaw(feeLamports, 9); out.rentSol = fromRaw(rent, 9);
  const solNeeded = feeLamports + rent + (asset.kind === 'SOL' ? out.total : 0n);
  if (out.total > asset.raw) out.error = `Not enough ${asset.label} (you have ${fmtNum(fromRaw(asset.raw, asset.decimals))})`;
  else if (solNeeded > BigInt(h.lamports)) out.error = `Not enough SOL for fees${rent ? ' and token accounts' : ''}`;
  else if (asset.kind === 'SOL' && BigInt(h.lamports) - solNeeded < 5_000_000n) out.warn = 'This leaves the wallet with under 0.005 SOL for fees.';
  return out;
}
function recipients(w) {
  const own = st.wallets.filter(x => x.address !== w.address).map(x => ({ address: x.address, label: x.name, kind: 'mine' }));
  const friends = st.friends.filter(f => f.address !== w.address && !own.some(o => o.address === f.address)).map(f => ({ address: f.address, label: f.label, kind: 'friend' }));
  const extra = split.extra.filter(e => e.address !== w.address && !own.some(o => o.address === e.address) && !friends.some(f => f.address === e.address)).map(e => ({ ...e, kind: 'pasted' }));
  return [...own, ...friends, ...extra];
}
function openSend(asset = null) {
  if (split.busy) { openSheet('send'); return; }
  Object.assign(split, { asset, step: asset ? 'to' : 'what', amount: '', results: null });
  if (split.picked === null) split.picked = [];
  delete holdings[st.selected];
  openSheet('send');
}

function sheetSend(b) {
  const w = selectedWallet();
  const h = holdings[w.address];
  if (!h || h.loading) { if (!h) loadHoldings(w.address); b.innerHTML = sheetHead('Send') + fromChip(w) + '<div class="sk row"></div><div class="sk row"></div><div class="sk row"></div>'; wireHead(); return; }
  if (h.error) { b.innerHTML = sheetHead('Send') + `<div class="note bad"><b>Couldn't load balances.</b> ${esc(h.error)}<div class="actions end"><button class="btn sm" id="sRl">Try again</button></div></div>`; wireHead(); on('#sRl', 'click', () => loadHoldings(w.address, true)); return; }
  if (split.asset && split.step !== 'result' && !splitAsset(h)) { split.asset = null; split.step = 'what'; }
  const everyone = recipients(w);
  split.picked = split.picked.filter(a => everyone.some(e => e.address === a));

  if (split.step === 'what') {
    const rows = [{ key: 'SOL', label: 'Solana', ui: h.sol, usd: h.solUsd, icon: solIco }, ...h.tokens.map(t => ({ key: t.mint, label: tokenLabel(t), ui: t.ui, usd: t.usd, icon: coinIco({ ...t, symbol: t.symbol || meta[t.mint]?.symbol, name: t.name || meta[t.mint]?.name, icon: meta[t.mint]?.icon }) }))];
    b.innerHTML = sheetHead('Send') + fromChip(w) + `<h3 class="sec" style="margin-top:0">What do you want to send?</h3>
      <div class="list">${rows.map(r => `<button class="row-btn" data-asset="${r.key}">${r.icon}<span class="grow"><span class="name">${esc(r.label)}</span><span class="sub num">${fmtNum(r.ui)} available</span></span><span class="right"><span class="v num">${r.usd ? fmtUsd(r.usd) : ''}</span></span><span class="chev">${I.right}</span></button>`).join('')}</div>`;
    wireHead();
    S$('[data-asset]').forEach(el => el.onclick = () => { split.asset = el.dataset.asset; split.amount = ''; split.step = 'to'; renderSheet(); });
    return;
  }

  if (split.step === 'to') {
    b.innerHTML = sheetHead('Send to', true) + fromChip(w) + `
      <div class="row"><span class="muted small">${plural(split.picked.length, 'wallet')} picked</span><span class="inline"><button class="link muted" id="sAll">All</button><span class="muted">·</span><button class="link muted" id="sNone">None</button></span></div>
      <div class="list" style="margin-top:8px">${everyone.length ? everyone.map(e => { const on = split.picked.includes(e.address); return `
        <label class="item ${on ? 'selected' : ''}"><input type="checkbox" data-rcpt="${e.address}" ${on ? 'checked' : ''}>${avatarFor(e.address, e.label, 'sm')}<span class="grow"><span class="name">${esc(e.label)}</span><span class="sub mono">${short(e.address)}</span></span><span class="badge ${e.kind === 'mine' ? 'on' : ''}">${e.kind}</span></label>`; }).join('')
        : '<div class="empty"><b>Nobody saved yet</b>Paste an address below, or save friends in Settings.</div>'}</div>
      <label class="field"><span class="lbl">Or paste an address</span><div class="with"><input id="sPaste" class="mono" placeholder="Solana address" spellcheck="false" autocomplete="off"><button class="btn sm" id="sPasteAdd">Add</button></div></label>
      <p class="err" id="sPErr"></p>
      <p class="hint">Save friends' addresses in Settings so they show up here every time.</p>
      <div class="actions"><button class="btn primary" id="sNext" ${split.picked.length ? '' : 'disabled'}>Next${split.picked.length ? ` · ${plural(split.picked.length, 'wallet')}` : ''}</button></div>`;
    wireHead(() => { split.step = 'what'; renderSheet(); });
    S$('[data-rcpt]').forEach(cb => cb.onchange = () => { const a = cb.dataset.rcpt; split.picked = cb.checked ? [...new Set([...split.picked, a])] : split.picked.filter(x => x !== a); renderSheet(); });
    on('#sAll', 'click', () => { split.picked = everyone.map(e => e.address); renderSheet(); });
    on('#sNone', 'click', () => { split.picked = []; renderSheet(); });
    const paste = () => {
      const a = $('#sPaste').value.trim();
      if (!isAddress(a)) return $('#sPErr').textContent = "That isn't a valid Solana address";
      if (a === w.address) return $('#sPErr').textContent = "That's the wallet you're sending from";
      if (!everyone.some(e => e.address === a)) split.extra.push({ address: a, label: short(a) });
      split.picked = [...new Set([...split.picked, a])];
      renderSheet();
    };
    on('#sPasteAdd', 'click', paste); enterTo('#sPaste', paste);
    on('#sNext', 'click', () => { split.step = 'amount'; renderSheet(); });
    return;
  }

  const c = splitCalc(h);
  if (split.step === 'amount') {
    b.innerHTML = sheetHead(`Send ${c.asset.label}`, true) + fromChip(w) + `
      <div class="seg" style="margin-top:0"><button data-smode="total" class="${split.mode === 'total' ? 'active' : ''}">Total to split</button><button data-smode="each" class="${split.mode === 'each' ? 'active' : ''}">Each wallet gets</button></div>
      <div class="field"><div class="with"><input id="sAmt" class="amount" inputmode="decimal" placeholder="0" value="${esc(split.amount)}" autocomplete="off" aria-label="Amount"><span class="unit">${esc(c.asset.label)}</span></div></div>
      <div class="row" style="margin-top:8px"><span class="muted small num">Available: ${fmtNum(fromRaw(c.asset.raw, c.asset.decimals))} ${esc(c.asset.label)}</span><button class="link" id="sMax">Max</button></div>
      ${c.per > 0n && !c.error ? `<div class="summary"><div class="kv"><span class="k">Each wallet gets</span><span class="v num">${fmtNum(fromRaw(c.per, c.asset.decimals), 6)} ${esc(c.asset.label)}</span></div><div class="kv"><span class="k">Total</span><span class="v num">${fmtNum(fromRaw(c.total, c.asset.decimals), 6)} ${esc(c.asset.label)} · ${plural(c.n, 'wallet')}</span></div></div>` : ''}
      ${c.warn ? `<div class="note warn">${esc(c.warn)}</div>` : ''}
      <p class="err">${esc(split.amount ? c.error : '')}</p>
      <div class="actions"><button class="btn primary" id="sReview" ${c.error || !(c.per > 0n) ? 'disabled' : ''}>Review</button></div>`;
    wireHead(() => { split.step = 'to'; renderSheet(); });
    S$('[data-smode]').forEach(x => x.onclick = () => { split.mode = x.dataset.smode; renderSheet(); });
    on('#sAmt', 'input', (e) => { split.amount = e.target.value.trim(); renderSheet(); });
    on('#sMax', 'click', () => {
      let raw = c.asset.raw;
      if (c.asset.kind === 'SOL') raw = raw > 10_000_000n ? raw - 10_000_000n : 0n;
      if (split.mode === 'each' && split.picked.length) raw = raw / BigInt(split.picked.length);
      split.amount = fromRaw(raw, c.asset.decimals); renderSheet();
    });
    enterTo('#sAmt', () => $('#sReview')?.click());
    on('#sReview', 'click', () => { split.step = 'review'; renderSheet(); });
    return;
  }

  if (split.step === 'review') {
    if (c.error || !(c.per > 0n)) { split.step = 'amount'; return renderSheet(); }
    b.innerHTML = sheetHead('Review', true) + `
      <div class="summary">
        <div class="kv"><span class="k">From</span><span class="v">${esc(w.name)}</span></div>
        <div class="kv"><span class="k">Each wallet gets</span><span class="v num">${fmtNum(fromRaw(c.per, c.asset.decimals), 6)} ${esc(c.asset.label)}</span></div>
        <div class="kv"><span class="k">Wallets</span><span class="v">${c.n}</span></div>
        <div class="kv"><span class="k">Total</span><span class="v num">${fmtNum(fromRaw(c.total, c.asset.decimals), 6)} ${esc(c.asset.label)}</span></div>
        <div class="kv"><span class="k">Network fees</span><span class="v num">~${c.feeSol} SOL</span></div>
        ${c.asset.kind === 'TOKEN' ? `<div class="kv"><span class="k">Token accounts</span><span class="v num">up to ${c.rentSol} SOL</span></div>` : ''}
      </div>
      <div class="list">${split.picked.map(a => `<div class="item">${avatarFor(a, nameOf(a), 'sm')}<div class="grow"><div class="name">${esc(nameOf(a))}</div><div class="sub mono">${short(a)}</div></div></div>`).join('')}</div>
      ${c.asset.kind === 'TOKEN' ? '<p class="hint">Wallets that never held this coin get a token account opened (~0.002 SOL each, paid by you).</p>' : ''}
      <p class="err" id="sErr"></p>
      <div class="actions"><button class="btn primary" id="sSend" ${split.busy ? 'disabled' : ''}>${split.busy ? 'Sending…' : `Send to ${plural(c.n, 'wallet')}`}</button></div>`;
    wireHead(() => { if (!split.busy) { split.step = 'amount'; renderSheet(); } });
    on('#sSend', 'click', async () => {
      if (split.busy) return;
      split.busy = true; renderSheet();
      try {
        const asset = c.asset.kind === 'SOL' ? { kind: 'SOL' } : { kind: 'TOKEN', mint: c.asset.mint, program: c.asset.program, account: c.asset.account, decimals: c.asset.decimals };
        split.results = { ...(await send({ type: 'distribute', from: w.address, asset, recipients: split.picked, perRecipient: c.per.toString(), label: c.asset.label })), label: c.asset.label, per: fromRaw(c.per, c.asset.decimals) };
      } catch (e) { split.results = { results: [{ ok: false, error: e.message, recipients: split.picked }], notSent: split.picked, label: c.asset.label, unsure: true }; }
      split.busy = false; split.step = 'result';
      loadHoldings(w.address, true); port = null;
      renderSheet();
    });
    return;
  }

  // result
  const r = split.results;
  const okCount = r.results.filter(x => x.ok).reduce((a, x) => a + x.recipients.length, 0);
  b.innerHTML = sheetHead(r.notSent?.length ? 'Partly sent' : 'Sent') + `
    <div class="tok-hero">${statusDot(r.notSent?.length ? 'failed' : 'posted')}<div class="dim" style="margin-top:6px">${plural(okCount, 'wallet')} received ${esc(fmtNum(r.per || 0, 6))} ${esc(r.label)}.</div></div>
    <div class="list" style="margin-top:8px">${r.results.map((x, i) => `<div class="item">${statusDot(x.ok ? 'posted' : 'failed')}<div class="grow">
      <div class="name">Batch ${i + 1} · ${plural(x.recipients.length, 'wallet')}</div>
      ${x.ok ? `<div class="sub">${x.recipients.map(a => esc(nameOf(a))).join(', ')}</div>` : `<div class="sub" style="color:var(--loss)">${esc(x.error)}</div>`}</div>
      ${x.ok ? `<a class="btn icon ghost" title="View on Solscan" target="_blank" rel="noopener" href="https://solscan.io/tx/${x.signature}">${I.ext}</a>` : ''}</div>`).join('')}</div>
    ${r.unsure ? `<div class="note warn">Truth couldn't confirm what happened. Some of it may have gone through. Check ${esc(nameOf(w.address))} on Solscan before sending again.</div>`
      : r.notSent?.length ? `<div class="note warn">Not sent to: ${r.notSent.map(a => esc(nameOf(a))).join(', ')}. Check Solscan first so nobody gets paid twice.</div>` : ''}
    <div class="actions">${r.unsure ? `<a class="btn" href="https://solscan.io/account/${w.address}" target="_blank" rel="noopener">Solscan ${I.ext}</a>` : ''}${!r.unsure && r.notSent?.length ? `<button class="btn" id="sRest">Send to the rest</button>` : ''}<button class="btn primary" id="sDone">Done</button></div>`;
  wireHead();
  on('#sRest', 'click', () => { split.picked = r.notSent; split.mode = 'each'; split.amount = String(r.per); split.step = 'amount'; split.results = null; renderSheet(); });
  on('#sDone', 'click', () => { split.amount = ''; split.results = null; closeSheet(); resetData(); render(); });
}

// ---------------- sheet: sweep (consolidate SOL or any coin from many wallets into one) ----------------
const sw = { step: 'pick', to: null, toPaste: '', picked: null, close: true, plan: null, planErr: '', busy: false, results: null, asset: 'SOL', pct: 100 };
const lam = (x) => BigInt(x || 0);
const solOf = (x) => fmtNum(fromRaw(lam(x), 9), 6);
function openSweep(asset) {
  if (sw.busy) { openSheet('sweep'); return; }
  Object.assign(sw, { step: 'pick', toPaste: '', picked: null, plan: null, planErr: '', results: null, asset: asset || sw.asset || 'SOL' });
  if (!sw.to || !(walletOf(sw.to) || isAddress(sw.to))) sw.to = (!isAll() && st.selected) || st.wallets[0]?.address;
  openSheet('sweep');
  loadSweepPlan();
}
async function loadSweepPlan() {
  sw.plan = null; sw.planErr = ''; renderSheet();
  try {
    sw.plan = await send({ type: 'sweepPlan', addresses: st.wallets.map(w => w.address) });
    for (const [m, v] of Object.entries(sw.plan.meta || {})) if (v.symbol || v.name) meta[m] = { ...(meta[m] || {}), ...Object.fromEntries(Object.entries(v).filter(([, x]) => x)) };
    if (sw.asset !== 'SOL' && !sw.plan.wallets.some(w => w.toks.some(t => t.mint === sw.asset))) sw.asset = 'SOL';
  } catch (e) { sw.planErr = e.message; }
  renderSheet();
}
// Coins held across the group, biggest holder count first.
function sweepAssets() {
  const by = new Map();
  for (const w of sw.plan.wallets) for (const t of w.toks) {
    const a = by.get(t.mint) || { mint: t.mint, decimals: t.decimals, raw: 0n, wallets: new Set() };
    a.raw += lam(t.raw); a.wallets.add(w.address); by.set(t.mint, a);
  }
  return [...by.values()].sort((x, y) => y.wallets.size - x.wallets.size);
}
const pctOf = (raw) => sw.pct === 100 ? lam(raw) : lam(raw) * BigInt(sw.pct) / 100n;
function sweepCalc() {
  const coin = sw.asset !== 'SOL';
  const dec = coin ? (sweepAssets().find(a => a.mint === sw.asset)?.decimals ?? 0) : 9;
  const label = coin ? mintLabel(sw.asset) : 'SOL';
  const rows = sw.plan.wallets.filter(r => r.address !== sw.to).map(r => {
    const have = coin ? r.toks.filter(t => t.mint === sw.asset).reduce((x, t) => x + lam(t.raw), 0n) : lam(r.lamports);
    return { ...r, have };
  });
  if (sw.picked === null) sw.picked = new Set(rows.filter(r => r.have > 0n || (!coin && r.empty.length)).map(r => r.address));
  const picked = rows.filter(r => sw.picked.has(r.address));
  let amount = picked.reduce((x, r) => x + pctOf(r.have), 0n);
  const canClose = coin ? sw.pct === 100 : true;
  const closes = sw.close && canClose ? picked.reduce((n, r) => n + (coin ? (r.have > 0n ? r.toks.filter(t => t.mint === sw.asset).length : 0) : Math.min(r.empty.length, 12)), 0) : 0;
  const rent = coin ? 2_039_280n * BigInt(closes) : sw.close ? picked.reduce((x, r) => x + r.empty.slice(0, 12).reduce((y, e) => y + lam(e.lamports), 0n), 0n) : 0n;
  const prio = BigInt(Math.max(0, Number(st.settings.priorityMicroLamports) || 0));
  const fee = BigInt(picked.length) * 10000n + (prio * BigInt((coin ? 12000 : 2000) * picked.length + 6000 * closes + 35000)) / 1_000_000n + (coin ? 2_039_280n : 0n);
  if (!coin && sw.pct !== 100) { // wallets that aren't emptied keep enough SOL to stay open
    amount = picked.reduce((x, r) => { let a = pctOf(r.have); if (r.have - a < 890_880n) a = r.have > 890_880n ? r.have - 890_880n : 0n; return x + a; }, 0n);
  }
  return { coin, dec, label, rows, picked, amount, closes, rent, canClose, fee, solIn: coin ? rent : (amount + rent > fee ? amount + rent - fee : 0n) };
}
const amtOf = (raw, dec) => fmtNum(fromRaw(lam(raw), dec), dec > 6 ? 6 : dec);
function sheetSweep(b) {
  const toName = sw.to ? (walletOf(sw.to)?.name || short(sw.to)) : '';
  if (sw.step === 'result' && sw.results) {
    const r = sw.results;
    const label = r.mint === 'SOL' ? 'SOL' : mintLabel(r.mint);
    const bad = r.results.filter(x => !x.ok);
    const head = r.mint === 'SOL' ? `${solOf(lam(r.amount) + lam(r.rent))} SOL` : `${amtOf(r.amount, r.decimals)} ${esc(label)}`;
    b.innerHTML = sheetHead(bad.length ? 'Partly swept' : 'Swept') + `
      <div class="tok-hero">${statusDot(bad.length ? 'failed' : 'posted')}<div class="hero-usd num" style="font-size:26px;margin-top:6px">${head}</div>
        <div class="dim">moved into ${esc(toName)} from ${plural(r.wallets, 'wallet')}${r.pct !== 100 ? ` (${r.pct}% of each)` : ''}${r.closed ? ` · ${plural(r.closed, 'token account')} closed (+${solOf(r.rent)} SOL rent)` : ''}</div></div>
      <div class="list" style="margin-top:8px">${r.results.map((x, i) => `<div class="item">${statusDot(x.ok ? 'posted' : 'failed')}<div class="grow">
        <div class="name">Batch ${i + 1} · ${plural(x.addresses.length, 'wallet')}${x.ok ? ` · ${r.mint === 'SOL' ? solOf(x.amount) + ' SOL' : amtOf(x.amount, r.decimals) + ' ' + esc(label)}` : ''}</div>
        <div class="sub">${x.ok ? x.addresses.map(a => esc(nameOf(a))).join(', ') : `<span style="color:var(--loss)">${esc(x.error || 'Failed')}</span>`}${x.note ? `<br><span class="muted">${esc(x.note)}</span>` : ''}</div></div>
        ${x.signature ? `<a class="btn icon ghost" title="View on Solscan" target="_blank" rel="noopener" href="https://solscan.io/tx/${x.signature}">${I.ext}</a>` : ''}</div>`).join('')}</div>
      ${bad.length ? '<div class="note warn">Some batches didn\'t confirm. Check them on Solscan before sweeping again. A new sweep only moves what is still in each wallet, so nothing is sent twice.</div>' : ''}
      <div class="actions"><button class="btn primary" id="swDone">Done</button></div>`;
    wireHead();
    on('#swDone', 'click', () => { sw.results = null; sw.step = 'pick'; closeSheet(); resetData(); render(); });
    return;
  }
  if (!sw.plan) {
    b.innerHTML = sheetHead('Sweep') + (sw.planErr
      ? `<div class="note bad"><b>Couldn't check balances.</b> ${esc(sw.planErr)}<div class="actions end"><button class="btn sm" id="swRl">Try again</button></div></div>`
      : `<p class="hint">Checking balances in ${plural(st.wallets.length, 'wallet')}…</p><div class="sk row"></div><div class="sk row"></div><div class="sk row"></div>`);
    wireHead(); on('#swRl', 'click', loadSweepPlan); return;
  }
  const c = sweepCalc();
  const destOwn = !!walletOf(sw.to);
  const amtTxt = c.coin ? `${amtOf(c.amount, c.dec)} ${esc(c.label)}` : `${solOf(c.amount)} SOL`;

  if (sw.step === 'review') {
    if (!c.picked.length) { sw.step = 'pick'; return renderSheet(); }
    b.innerHTML = sheetHead('Review sweep', true) + `
      <div class="summary">
        <div class="kv"><span class="k">To</span><span class="v">${esc(toName)}</span></div>
        <div class="kv"><span class="k">Address</span><span class="v mono xs" style="word-break:break-all">${esc(sw.to)}</span></div>
        <div class="kv"><span class="k">From</span><span class="v">${plural(c.picked.length, 'wallet')}</span></div>
        <div class="kv"><span class="k">Sending</span><span class="v num">${sw.pct}% of each · <b>${amtTxt}</b></span></div>
        ${c.closes ? `<div class="kv"><span class="k">Rent back</span><span class="v num">+${solOf(c.rent)} SOL · ${plural(c.closes, 'token account')} closed</span></div>` : ''}
        <div class="kv"><span class="k">Network fees</span><span class="v num">~${solOf(c.fee)} SOL${c.coin ? ' (incl. opening the coin account if needed)' : ''}</span></div>
      </div>
      <div class="note warn">This moves ${sw.pct === 100 ? 'everything' : sw.pct + '%'}${c.coin ? ` of ${esc(c.label)}` : ' of the SOL'} from ${plural(c.picked.length, 'wallet')} into ${esc(toName)} and can't be undone. ${destOwn ? '' : '<b>The destination is not one of your Truth wallets.</b> Double-check the address.'}${c.coin ? ' Fees are paid in SOL by ' + (destOwn ? 'the destination wallet (or the source with the most SOL).' : 'the source wallet with the most SOL.') : ''}</div>
      <p class="err" id="swErr"></p>
      <div class="actions"><button class="btn primary" id="swGo" ${sw.busy ? 'disabled' : ''}>${sw.busy ? 'Sweeping…' : `Sweep ${plural(c.picked.length, 'wallet')}`}</button></div>`;
    wireHead(() => { if (!sw.busy) { sw.step = 'pick'; renderSheet(); } });
    on('#swGo', 'click', async () => {
      if (sw.busy) return;
      sw.busy = true; renderSheet();
      try { sw.results = await send({ type: 'sweepRun', to: sw.to, addresses: c.picked.map(r => r.address), closeEmpty: sw.close, mint: sw.asset, pct: sw.pct }); sw.step = 'result'; }
      catch (e) { sw.busy = false; renderSheet(); const el = $('#swErr'); if (el) el.textContent = e.message; return; }
      sw.busy = false; renderSheet();
    });
    return;
  }

  // pick
  const assets = sweepAssets();
  const totalSol = sw.plan.wallets.filter(w => w.address !== sw.to).reduce((x, w) => x + lam(w.lamports), 0n);
  const emptyTotal = c.rows.reduce((n, r) => n + r.empty.length, 0);
  b.innerHTML = sheetHead('Sweep') + `
    <p class="hint" style="margin-top:0">Move SOL or a coin from many wallets into one, a few wallets per transaction.</p>
    <label class="field" style="margin-top:0"><span class="lbl">What to sweep</span><select id="swAsset">
      <option value="SOL" ${sw.asset === 'SOL' ? 'selected' : ''}>SOL · ${solOf(totalSol)} across wallets</option>
      ${assets.map(a => `<option value="${a.mint}" ${sw.asset === a.mint ? 'selected' : ''}>${esc(mintLabel(a.mint))} · ${amtOf(a.raw, a.decimals)} in ${plural(a.wallets.size, 'wallet')}</option>`).join('')}
    </select></label>
    <div class="field"><span class="lbl">How much of each wallet's ${esc(c.label)}</span>
      <div class="seg" style="margin-top:6px">${[25, 50, 75, 100].map(p => `<button data-pct="${p}" class="${sw.pct === p ? 'active' : ''}">${p}%</button>`).join('')}</div>
      <div class="with" style="margin-top:8px"><input id="swPct" class="amount" inputmode="numeric" value="${sw.pct}" aria-label="Percentage" autocomplete="off"><span class="unit">%</span></div></div>
    <label class="field"><span class="lbl">Send to</span><select id="swTo">
      ${st.wallets.map(w => { const p = sw.plan.wallets.find(x => x.address === w.address); return `<option value="${w.address}" ${w.address === sw.to ? 'selected' : ''}>${esc(w.name)} · ${short(w.address)}${p ? ` · ${solOf(p.lamports)} SOL` : ''}</option>`; }).join('')}
      ${!destOwn && sw.to ? `<option value="${esc(sw.to)}" selected>Pasted · ${short(sw.to)}</option>` : ''}
    </select></label>
    <div style="display:flex;gap:8px;margin-top:6px"><input id="swPaste" class="mono" placeholder="Or paste another address" spellcheck="false" autocomplete="off" value="${esc(sw.toPaste)}"><button class="btn sm" id="swPasteUse">Use</button></div>
    <p class="err" id="swPErr"></p>
    <div class="row" style="margin-top:12px"><span class="muted small">${c.picked.length} of ${plural(c.rows.length, 'wallet')}</span><span class="inline"><button class="link muted" id="swAll">All</button><span class="muted">·</span><button class="link muted" id="swHolders">Holders</button><span class="muted">·</span><button class="link muted" id="swNone">None</button></span></div>
    <div class="list" style="margin-top:8px">${c.rows.map(r => { const on = sw.picked.has(r.address); return `
      <label class="item ${on ? 'selected' : ''}"><input type="checkbox" data-sw="${r.address}" ${on ? 'checked' : ''}>${avatarFor(r.address, nameOf(r.address), 'sm')}
        <span class="grow"><span class="name">${esc(nameOf(r.address))}</span><span class="sub mono">${short(r.address)}${!c.coin && r.empty.length ? ` · ${plural(r.empty.length, 'empty account')}` : ''}</span></span>
        <span class="right"><span class="v num">${c.coin ? amtOf(r.have, c.dec) : solOf(r.have)}</span><span class="sub">${on && sw.pct !== 100 && r.have > 0n ? `sends ${c.coin ? amtOf(pctOf(r.have), c.dec) : solOf(pctOf(r.have))}` : esc(c.label)}</span></span></label>`; }).join('')}</div>
    ${c.coin
      ? (c.canClose ? `<label class="check" style="margin-top:10px"><input type="checkbox" id="swClose" ${sw.close ? 'checked' : ''}> Close the emptied ${esc(c.label)} accounts (+~${solOf(2_039_280n * BigInt(c.picked.filter(r => r.have > 0n).length))} SOL rent back)</label>` : '')
      : (emptyTotal ? `<label class="check" style="margin-top:10px"><input type="checkbox" id="swClose" ${sw.close ? 'checked' : ''}> Also close empty token accounts (+${solOf(c.rows.filter(r => sw.picked.has(r.address)).reduce((x, r) => x + r.empty.slice(0, 12).reduce((y, e) => y + lam(e.lamports), 0n), 0n))} SOL rent back)</label>` : '')}
    <div class="summary" style="margin-top:10px"><div class="kv"><span class="k">${esc(toName)} receives</span><span class="v num"><b>~${c.coin ? amtTxt : solOf(c.solIn) + ' SOL'}</b></span></div>
      ${c.coin && c.closes ? `<div class="kv"><span class="k">Plus rent back</span><span class="v num">~${solOf(c.rent)} SOL</span></div>` : ''}</div>
    <div class="actions"><button class="btn primary" id="swNext" ${c.picked.length && c.amount > 0n ? '' : 'disabled'}>Review</button></div>`;
  wireHead();
  on('#swAsset', 'change', (e) => { sw.asset = e.target.value; sw.picked = null; renderSheet(); });
  S$('[data-pct]').forEach(x => x.onclick = () => { sw.pct = Number(x.dataset.pct); renderSheet(); });
  on('#swPct', 'change', (e) => { const n = Math.round(Number(e.target.value)); sw.pct = n >= 1 && n <= 100 ? n : sw.pct; renderSheet(); });
  enterTo('#swPct', () => $('#swPct').dispatchEvent(new Event('change')));
  on('#swTo', 'change', (e) => { sw.to = e.target.value; if (sw.picked) sw.picked.delete(sw.to); renderSheet(); });
  const usePaste = () => {
    const a = $('#swPaste').value.trim();
    if (!isAddress(a)) return $('#swPErr').textContent = "That isn't a valid Solana address";
    sw.to = a; sw.toPaste = ''; if (sw.picked) sw.picked.delete(a); renderSheet();
  };
  on('#swPasteUse', 'click', usePaste); enterTo('#swPaste', usePaste);
  on('#swPaste', 'input', (e) => { sw.toPaste = e.target.value; });
  S$('[data-sw]').forEach(cb => cb.onchange = () => { cb.checked ? sw.picked.add(cb.dataset.sw) : sw.picked.delete(cb.dataset.sw); renderSheet(); });
  on('#swAll', 'click', () => { sw.picked = new Set(c.rows.map(r => r.address)); renderSheet(); });
  on('#swHolders', 'click', () => { sw.picked = new Set(c.rows.filter(r => r.have > 0n).map(r => r.address)); renderSheet(); });
  on('#swNone', 'click', () => { sw.picked = new Set(); renderSheet(); });
  on('#swClose', 'change', (e) => { sw.close = e.target.checked; renderSheet(); });
  on('#swNext', 'click', () => { sw.step = 'review'; renderSheet(); });
}

// ---------------- buy/sell math (shared by Swap and Bundle) ----------------
const RESERVE = 12_000_000n;
function planBuy(have, mode, amount) {
  let spend = 0n, err = '';
  try {
    if (mode === 'pct') { const pct = Number(amount); spend = have > RESERVE && pct > 0 ? (have - RESERVE) * BigInt(Math.round(Math.min(pct, 100) * 100)) / 10000n : 0n; }
    else spend = amount ? toRaw(amount, 9) : 0n;
  } catch (e) { err = e.message; }
  if (!err && amount && spend + RESERVE > have) err = 'not enough SOL';
  if (!err && amount && spend < 1_000_000n) err = 'under 0.001 SOL';
  return { have, spend, err };
}
const routeLabel = () => ({ auto: 'Jupiter, then PumpPortal', jupiter: 'Jupiter', pumpportal: 'PumpPortal' }[st.settings.buyRoute] || st.settings.buyRoute);

// ---------------- coin detection (pump.fun tab) ----------------
async function activeTab() { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); return t; }
async function pumpTab() { const t = await activeTab(); if (!t) throw new Error('This runs on a pump.fun tab, so it needs the Truth extension. The website handles buys, sells, sends and holdings.'); return t; }
const fillTemplate = (tpl, i) => tpl.replace(/\{name\}/g, i.name || '').replace(/\{ticker\}/g, i.ticker || '').replace(/\{ca\}/g, i.ca || '').replace(/\{link\}/g, i.link || '');
async function detectCoin() {
  callout.error = ''; callout.info = null;
  if (IS_WEB) {
    const ca = webCoin.get();
    if (!ca) { callout.error = NO_WEB_COIN; return; }
    const m = meta[ca] || {};
    callout.info = { ca, name: m.name || '', ticker: m.symbol || '', link: `https://pump.fun/coin/${ca}` };
    if (!callout.text) callout.text = fillTemplate(st.settings.template, callout.info);
    return;
  }
  const t = await activeTab();
  if (!t?.url || !/^https:\/\/([a-z0-9-]+\.)*pump\.fun\//.test(t.url)) { callout.error = 'Posting from pump.fun pages needs the Truth extension. On the website you can still buy, sell, send and track every wallet.'; return; }
  try {
    const r = await chrome.tabs.sendMessage(t.id, { type: 'coinInfo' });
    if (!r?.result?.ca) { callout.error = "This pump.fun page isn't a coin. Open a coin (pump.fun/coin/…) first."; return; }
    callout.info = r.result;
    if (!callout.text) callout.text = fillTemplate(st.settings.template, r.result);
    noteMeta();
  } catch { callout.error = 'Reload the pump.fun tab once so Truth can attach to it.'; }
}
const coinHeader = (i) => `<div class="card tight"><div class="row">${coinIco({ mint: i.ca, ...(meta[i.ca] || {}), name: i.name || meta[i.ca]?.name })}
  <div class="grow"><div class="name trunc">${esc(i.name || mintLabel(i.ca))}</div><div class="mono muted trunc">${esc(short(i.ca))}</div></div>
  ${i.ticker ? `<span class="badge on">$${esc(i.ticker)}</span>` : ''}</div></div>`;

// ---------------- sheet: swap (active wallet) ----------------
function openSwap(side = 'buy', mint = '') {
  if (swap.busy) { openSheet('swap'); return; }
  Object.assign(swap, { side, mint: mint || '', mode: 'sol', amount: '', sellPct: '', step: mint ? 'amount' : 'coin', bal: null, toks: null, toksMint: '', started: false });
  if (!swap.mint && callout.info?.ca) swap.mint = callout.info.ca;
  openSheet('swap');
  if (!callout.info && !callout.error) detectCoin().then(() => { if (!swap.mint && callout.info?.ca && swap.step === 'coin') swap.mint = callout.info.ca; renderSheet(); });
}
async function loadSwapBal() {
  swap.bal = 'loading';
  try { swap.bal = await send({ type: 'balances', addresses: [st.selected] }); } catch (e) { swap.bal = { error: e.message }; }
  renderSheet();
}
async function loadSwapToks() {
  const m = swap.mint; swap.toks = 'loading'; swap.toksMint = m;
  let r; try { r = await send({ type: 'tokenBalances', mint: m, addresses: [st.selected] }); } catch (e) { r = { error: e.message }; }
  if (swap.toksMint !== m || swap.mint !== m) return;
  swap.toks = r; renderSheet();
}
function sheetSwap(b) {
  const w = selectedWallet();
  const job = st.jobs?.buy;
  if (swap.busy && swap.step !== 'job') { b.innerHTML = sheetHead('Starting…') + '<div class="sk row"></div><p class="hint center">Starting the trade…</p>'; on('#sClose', 'click', closeSheet); return; }
  if (swap.step === 'job') {
    if (!job) { closeSheet(); return; }
    b.innerHTML = sheetHead(job.side === 'sell' ? 'Sell' : 'Buy') + jobHtml(job, 's');
    wireHead();
    on('#sdone', 'click', async () => { st = await send({ type: 'clearJob', kind: 'buy' }); closeSheet(); resetData(); render(); });
    pollWhileRunning();
    return;
  }
  if (job && !job.done) { b.innerHTML = sheetHead('Swap') + '<div class="note warn">A trade is still running. Wait for it to finish (see the Bundle tab), then swap.</div>'; wireHead(); return; }
  const mintOk = isAddress(swap.mint);
  const sell = swap.side === 'sell';

  if (swap.step === 'coin') {
    const held = portReady() ? port.coins.filter(c => c.holders.some(h => h.address === w.address)) : [];
    const m = meta[swap.mint] || {};
    b.innerHTML = sheetHead('Swap') + fromChip(w) + `
      <div class="seg accent" style="margin-top:0"><button data-sside="buy" class="${!sell ? 'active' : ''}">Buy</button><button data-sside="sell" class="${sell ? 'active' : ''}">Sell</button></div>
      <label class="field"><span class="lbl">Coin address (CA)</span><input id="sMint" class="mono ${swap.mint && !mintOk ? 'invalid' : ''}" placeholder="Paste a CA" value="${esc(swap.mint)}" spellcheck="false" autocomplete="off"></label>
      ${mintOk ? `<div class="coinline">${coinIco({ mint: swap.mint, ...m })}<b>${esc(mintLabel(swap.mint))}</b>${m.name && m.symbol ? `<span class="muted trunc">${esc(m.name)}</span>` : ''}</div>` : swap.mint ? '<p class="err">That isn\'t a valid Solana address</p>' : ''}
      ${callout.info?.ca && callout.info.ca !== swap.mint ? `<button class="row-btn" id="sUseOpen" style="margin-top:12px"><span class="grow"><span class="name">Use the coin open on pump.fun</span><span class="sub">${esc(callout.info.name || short(callout.info.ca))}</span></span><span class="chev">${I.right}</span></button>` : ''}
      ${sell && held.length ? `<h3 class="sec">${esc(w.name)}'s coins</h3><div class="list">${held.map(c => `<button class="row-btn ${c.mint === swap.mint ? 'selected' : ''}" data-smint="${c.mint}">${coinIco(c)}<span class="grow"><span class="name">${esc(coinLabel(c))}</span><span class="sub num">${fmtNum(c.holders.find(h => h.address === w.address).ui)}</span></span></button>`).join('')}</div>` : ''}
      <div class="actions"><button class="btn primary" id="sNext" ${mintOk ? '' : 'disabled'}>Next</button></div>`;
    wireHead();
    S$('[data-sside]').forEach(x => x.onclick = () => { swap.side = x.dataset.sside; renderSheet(); });
    on('#sMint', 'input', (e) => { swap.mint = e.target.value.trim(); swap.toks = null; renderSheet(); });
    on('#sUseOpen', 'click', () => { swap.mint = callout.info.ca; swap.toks = null; renderSheet(); });
    S$('[data-smint]').forEach(x => x.onclick = () => { swap.mint = x.dataset.smint; swap.toks = null; renderSheet(); });
    on('#sNext', 'click', () => { swap.step = 'amount'; swap.amount = ''; swap.sellPct = ''; renderSheet(); });
    return;
  }
  if (!mintOk) { swap.step = 'coin'; return renderSheet(); }

  let ok = false, summary = '';
  if (!sell) {
    if (swap.bal === null) loadSwapBal();
    const have = swap.bal && swap.bal !== 'loading' && !swap.bal.error ? BigInt(swap.bal[w.address] || 0) : null;
    const plan = have == null ? null : planBuy(have, swap.mode, swap.amount);
    ok = !!(plan && swap.amount && !plan.err && plan.spend > 0n);
    summary = ok ? `${fromRaw(plan.spend, 9)} SOL` : '';
    if (swap.step === 'amount') {
      const quick = swap.mode === 'pct' ? ['25', '50', '75', '100'] : ['0.05', '0.1', '0.25', '0.5'];
      b.innerHTML = sheetHead(`Buy ${mintLabel(swap.mint)}`, true) + fromChip(w) + `
        <div class="seg" style="margin-top:0"><button data-smode="sol" class="${swap.mode === 'sol' ? 'active' : ''}">SOL</button><button data-smode="pct" class="${swap.mode === 'pct' ? 'active' : ''}">% of balance</button></div>
        <div class="field"><div class="with"><input id="sAmt" class="amount" inputmode="decimal" placeholder="0" value="${esc(swap.amount)}" autocomplete="off" aria-label="Amount"><span class="unit">${swap.mode === 'pct' ? '%' : 'SOL'}</span></div></div>
        <div class="chips">${quick.map(x => `<button data-sq="${x}" class="${swap.amount === x ? 'active' : ''}">${x}${swap.mode === 'pct' ? '%' : ''}</button>`).join('')}</div>
        <p class="hint">Balance: ${have == null ? (swap.bal?.error ? "couldn't load" : '…') : fmtNum(fromRaw(have, 9), 4) + ' SOL'} · keeps ~0.012 SOL for fees</p>
        ${plan && swap.amount && plan.err ? `<p class="err">${esc(plan.err)}</p>` : ''}
        ${ok && swap.mode === 'pct' ? `<p class="dim small">Spends ${summary}</p>` : ''}
        <div class="actions"><button class="btn primary" id="sReview" ${ok ? '' : 'disabled'}>Review</button></div>`;
    }
  } else {
    if (swap.toks === null || swap.toksMint !== swap.mint) loadSwapToks();
    const t = swap.toks && swap.toks !== 'loading' && !swap.toks.error ? swap.toks[w.address] : null;
    const raw = t ? BigInt(t.raw) : 0n;
    const pct = Number(swap.sellPct), pctOk = pct > 0 && pct <= 100;
    const sellRaw = pctOk ? raw * BigInt(Math.round(pct * 100)) / 10000n : 0n;
    ok = sellRaw > 0n;
    summary = ok ? `${fmtNum(fromRaw(sellRaw, t.decimals))} tokens (${pct}%)` : '';
    if (swap.step === 'amount') {
      b.innerHTML = sheetHead(`Sell ${mintLabel(swap.mint)}`, true) + fromChip(w) + `
        <div class="field" style="margin-top:0"><span class="lbl">How much of the bag?</span><div class="with"><input id="sPct" class="amount" inputmode="decimal" placeholder="0" value="${esc(swap.sellPct)}" autocomplete="off" aria-label="Percent to sell"><span class="unit">%</span></div></div>
        <div class="chips">${['25', '50', '75', '100'].map(x => `<button data-sq="${x}" class="${swap.sellPct === x ? 'active' : ''}">${x}%</button>`).join('')}</div>
        <p class="hint">${swap.toks === 'loading' || swap.toks === null ? 'Checking balance…' : swap.toks?.error ? "Couldn't load the balance" : raw ? `You hold ${fmtNum(fromRaw(raw, t.decimals))}` : `${esc(w.name)} holds none of this coin`}</p>
        ${ok ? `<p class="dim small">Sells ${summary}</p>` : ''}
        <div class="actions"><button class="btn primary" id="sReview" ${ok ? '' : 'disabled'}>Review</button></div>`;
    }
  }
  if (swap.step === 'amount') {
    wireHead(() => { swap.step = 'coin'; renderSheet(); });
    S$('[data-smode]').forEach(x => x.onclick = () => { swap.mode = x.dataset.smode; swap.amount = ''; renderSheet(); });
    on('#sAmt', 'input', (e) => { swap.amount = e.target.value.trim(); renderSheet(); });
    on('#sPct', 'input', (e) => { swap.sellPct = e.target.value.trim(); renderSheet(); });
    S$('[data-sq]').forEach(x => x.onclick = () => { if (sell) swap.sellPct = x.dataset.sq; else swap.amount = x.dataset.sq; renderSheet(); });
    enterTo('#sAmt', () => $('#sReview')?.click()); enterTo('#sPct', () => $('#sReview')?.click());
    on('#sReview', 'click', () => { swap.step = 'review'; renderSheet(); });
    return;
  }
  // review
  if (!ok) { swap.step = 'amount'; return renderSheet(); }
  b.innerHTML = sheetHead(`Review ${sell ? 'sell' : 'buy'}`, true) + `
    <div class="tok-hero">${coinIco({ mint: swap.mint, ...(meta[swap.mint] || {}) }, 'lg')}<div class="big num">${esc(summary)}</div><div class="sub">${sell ? 'sell' : 'buy'} ${esc(mintLabel(swap.mint))}</div></div>
    <div class="summary">
      <div class="kv"><span class="k">Wallet</span><span class="v">${esc(w.name)}</span></div>
      <div class="kv"><span class="k">Coin</span><span class="v mono">${short(swap.mint)}</span></div>
      <div class="kv"><span class="k">Slippage</span><span class="v">${esc(st.settings.slippagePct)}%</span></div>
      <div class="kv"><span class="k">Route</span><span class="v">${esc(routeLabel())}</span></div>
    </div>
    <p class="err" id="sErr"></p>
    <div class="actions"><button class="btn primary" id="sGo">${sell ? 'Sell' : 'Buy'} now</button></div>`;
  wireHead(() => { swap.step = 'amount'; renderSheet(); });
  on('#sGo', 'click', async () => {
    if (swap.busy) return;
    swap.busy = true; renderSheet();
    try {
      if (sell) await send({ type: 'sellRun', mint: swap.mint, addresses: [w.address], pct: Number(swap.sellPct) });
      else await send({ type: 'buyRun', mint: swap.mint, addresses: [w.address], mode: swap.mode, amount: swap.amount });
      swap.started = true; swap.step = 'job'; swap.busy = false;
      await refresh();
    } catch (e) { swap.busy = false; renderSheet(); const el = $('#sErr'); if (el) el.textContent = e.message; }
  });
}

// ---------------- sheet: add wallet ----------------
function openAdd(mode) { wal.mode = mode || wal.mode || 'new'; wal.report = null; wal.created = null; wal.busy = false; openSheet('add'); }
function sheetAdd(b) {
  const first = !(st.allCount ?? st.wallets.length) || onb === 'done';
  if (wal.created?.many) {
    const list = wal.created.many;
    const keysText = list.map(c => `${c.name}, ${c.secret}`).join('\n');
    b.innerHTML = sheetHead(`Back up ${list.length} keys`) + `
      <div class="note warn" style="margin-top:0"><b>Save these private keys now.</b> They're the only way to recover these wallets, and they won't be shown again. Copy all puts them in the same "name, key" format Import many reads.</div>
      <div class="list" style="margin-top:12px">${list.map(c => `<div class="item">${avatar(c, 'sm')}<div class="grow"><div class="name">${esc(c.name)}</div><div class="sub mono">${short(c.address)}</div></div></div>`).join('')}</div>
      <pre class="msg" id="newkey" style="max-height:120px">${esc(keysText)}</pre>
      <div class="actions"><button class="btn" id="copykey">${I.copy} Copy all keys</button><button class="btn" id="copyaddr">Copy addresses</button></div>
      <div class="actions" style="margin-top:8px"><button class="btn primary" id="savedit">I saved them</button></div>`;
    on('#sClose', 'click', closeSheet);
    on('#copykey', 'click', () => copy(keysText, `${list.length} private keys copied`));
    on('#copyaddr', 'click', () => copy(list.map(c => `${c.name}, ${c.address}`).join('\n'), 'Addresses copied'));
    on('#savedit', 'click', () => { wal.created = null; closeSheet(); render(); });
    return;
  }
  if (wal.created) {
    b.innerHTML = sheetHead('Back up your key') + `
      <div class="note warn" style="margin-top:0"><b>Save this private key now.</b> It's the only way to recover this wallet, and it won't be shown again.</div>
      <pre class="msg" id="newkey">${esc(wal.created.secret)}</pre>
      <p class="hint">Address <span class="mono">${short(wal.created.address)}</span>. Send SOL here to fund it.</p>
      <div class="actions"><button class="btn" id="copykey">${I.copy} Copy key</button><button class="btn" id="copyaddr">Copy address</button></div>
      <div class="actions" style="margin-top:8px"><button class="btn primary" id="savedit">I saved it</button></div>`;
    on('#sClose', 'click', closeSheet);
    on('#copykey', 'click', () => copy(wal.created.secret, 'Private key copied'));
    on('#copyaddr', 'click', () => copy(wal.created.address, 'Address copied'));
    on('#savedit', 'click', () => { wal.created = null; closeSheet(); render(); });
    return;
  }
  if (wal.report) {
    b.innerHTML = sheetHead('Import finished') + `
      <div class="note ${wal.report.skipped.length ? 'warn' : 'ok'}" style="margin-top:0">Added ${plural(wal.report.added.length, 'wallet')}.${wal.report.skipped.length ? '<br>Skipped ' + wal.report.skipped.map(x => `line ${x.line} (${esc(x.reason)})`).join(', ') + '.' : ''}</div>
      <div class="actions"><button class="btn primary" id="sRepDone">Done</button></div>`;
    wireHead();
    on('#sRepDone', 'click', () => { wal.report = null; closeSheet(); render(); });
    return;
  }
  b.innerHTML = sheetHead('Add wallet') + `
    <div class="seg" style="margin-top:0"><button data-add="new" class="${wal.mode === 'new' ? 'active' : ''}">Create new</button><button data-add="one" class="${wal.mode === 'one' ? 'active' : ''}">Import key</button><button data-add="many" class="${wal.mode === 'many' ? 'active' : ''}">Import many</button></div>
    ${wal.mode === 'one' ? `
      <label class="field"><span class="lbl">Name</span><input id="wname" placeholder="e.g. Jake" maxlength="40" autocomplete="off"></label>
      <label class="field"><span class="lbl">Private key</span><input id="wkey" type="password" placeholder="Base58 key from Phantom, or a [..] array" autocomplete="off" spellcheck="false"></label>`
    : wal.mode === 'many' ? `
      <label class="field"><span class="lbl">One wallet per line: <span class="mono">name, private key</span> (name optional)</span>
        <textarea id="wbulk" rows="5" class="mono" placeholder="Jake, 4xQ…&#10;Sam, 3fP…&#10;5kZ…" autocomplete="off" spellcheck="false"></textarea></label>`
    : `
      <div class="grid2">
        <label class="field"><span class="lbl">Name</span><input id="wname" placeholder="e.g. Burner" maxlength="30" autocomplete="off"></label>
        <label class="field"><span class="lbl">How many</span><input id="wcount" inputmode="numeric" value="1" maxlength="3" autocomplete="off"></label>
      </div>
      <p class="hint">Makes fresh Solana wallets inside Truth, up to 500 at a time. More than one get numbered (Burner 1, Burner 2…). You'll see the private keys once to back up.</p>`}
    <label class="field"><span class="lbl">Truth password</span><input id="wpw" type="password" autocomplete="current-password"></label>
    <p class="err" id="werr"></p>
    <div class="actions"><button class="btn primary" id="add" ${wal.busy ? 'disabled' : ''}>${wal.busy ? 'Working…' : wal.mode === 'one' ? 'Import wallet' : wal.mode === 'many' ? 'Import all' : 'Create wallets'}</button></div>
    <p class="hint">Only add wallets whose owners agreed. Keys are encrypted with your password and never leave this browser.</p>`;
  wireHead();
  S$('[data-add]').forEach(x => x.onclick = () => { wal.mode = x.dataset.add; renderSheet(); });
  const add = async () => {
    const pw = $('#wpw').value;
    if (!pw) { $('#werr').textContent = 'Enter your Truth password'; $('#wpw').focus(); return; }
    const vals = { name: $('#wname')?.value.trim() || '', key: $('#wkey')?.value.trim() || '', bulk: $('#wbulk')?.value || '', count: $('#wcount')?.value.trim() || '1' };
    const count = Number(vals.count);
    if (wal.mode === 'new' && !(Number.isInteger(count) && count >= 1 && count <= 500)) { $('#werr').textContent = 'How many must be a number from 1 to 500'; $('#wcount').focus(); return; }
    wal.busy = true; $('#add').disabled = true; $('#add').textContent = 'Working…';
    try {
      if (wal.mode === 'one') {
        if (!vals.key) throw new Error('Paste the private key');
        st = await send({ type: 'addWallet', name: vals.name, secret: vals.key, password: pw });
        wal.busy = false; if (first) onb = 'done';
        closeSheet(); toast('Wallet imported');
      } else if (wal.mode === 'many') {
        const entries = vals.bulk.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
          if (l.startsWith('[')) return { name: '', secret: l };
          const i = l.lastIndexOf(',');
          return i > 0 ? { name: l.slice(0, i).trim(), secret: l.slice(i + 1).trim() } : { name: '', secret: l };
        });
        if (!entries.length) throw new Error('Paste at least one key');
        const r = await send({ type: 'addWallets', entries, password: pw });
        wal.report = r.report; st = r; wal.busy = false;
        if (first && r.report.added.length) onb = 'done';
      } else if (count > 1) {
        const r = await send({ type: 'createWallets', count, prefix: vals.name, password: pw });
        wal.created = { many: r.createdMany }; st = r; wal.busy = false;
        if (first) onb = 'done';
      } else {
        const r = await send({ type: 'createWallet', name: vals.name, password: pw });
        wal.created = r.created; st = r; wal.busy = false;
        if (first) onb = 'done';
      }
      trade.picked = null; split.picked = null; resetData();
      render();
    } catch (e) {
      wal.busy = false; renderSheet();
      $('#werr').textContent = e.message;
      if ($('#wname')) $('#wname').value = vals.name;
      if ($('#wkey')) $('#wkey').value = vals.key;
      if ($('#wbulk')) $('#wbulk').value = vals.bulk;
      if ($('#wcount')) $('#wcount').value = vals.count;
    }
  };
  on('#add', 'click', add); enterTo('#wpw', add); enterTo('#wname', () => ($('#wkey') || $('#wpw')).focus()); enterTo('#wkey', () => $('#wpw').focus());
  setTimeout(() => ($('#wname') || $('#wbulk') || $('#wpw'))?.focus({ preventScroll: true }), 0);
}

const SHEETS = { sweep: sheetSweep, accounts: sheetAccounts, receive: sheetReceive, token: sheetToken, send: sheetSend, swap: sheetSwap, add: sheetAdd, tpl: (b) => sheetTpl(b) };

// ---------------- Bundle ----------------
async function loadBalances() {
  trade.bal = 'loading'; trade.balErr = '';
  try { trade.bal = await send({ type: 'balances', addresses: st.wallets.map(w => w.address) }); }
  catch (e) { trade.bal = null; trade.balErr = e.message; }
  render();
}
async function loadToks() {
  const m = trade.mint; trade.toks = 'loading'; trade.toksMint = m;
  let r; try { r = await send({ type: 'tokenBalances', mint: m, addresses: st.wallets.map(w => w.address) }); } catch (e) { r = { error: e.message }; }
  if (trade.toksMint !== m || trade.mint !== m) return;
  trade.toks = r; render();
}
const coinField = (mintOk) => `
  <label class="field"><span class="lbl">Coin address (CA)</span><input id="mint" class="mono ${trade.mint && !mintOk ? 'invalid' : ''}" placeholder="Paste a CA, or open a coin on pump.fun" value="${esc(trade.mint)}" spellcheck="false" autocomplete="off"></label>
  ${mintOk ? `<div class="coinline">${coinIco({ mint: trade.mint, ...(meta[trade.mint] || {}) })}<b>${esc(mintLabel(trade.mint))}</b>${meta[trade.mint]?.name && meta[trade.mint]?.symbol ? `<span class="muted trunc">${esc(meta[trade.mint].name)}</span>` : ''}</div>` : trade.mint ? '<p class="err">That isn\'t a valid Solana address</p>' : ''}`;
const walletToolbar = (n, refreshId) => `<div class="row sec-row"><h3 class="sec">Wallets · ${n}</h3><span class="inline"><button class="link muted" id="all">All</button><span class="muted">·</span><button class="link muted" id="none">None</button><button class="btn icon ghost" id="${refreshId}" title="Refresh" aria-label="Refresh">${I.refresh}</button></span></div>`;
const bundleHead = (title) => `<button class="link muted" id="bHub">${I.back} Bundle</button><h2 style="margin-top:8px">${title}</h2>`;
function wireBundleCommon(refreshId, refreshFn) {
  on('#bHub', 'click', () => { bundle.action = null; trade.stage = 'form'; render(); });
  on('#mint', 'input', (e) => { trade.mint = e.target.value.trim(); trade.toks = null; render(); });
  $$('input[data-addr]').forEach(cb => cb.onchange = () => { const a = cb.dataset.addr; trade.picked = cb.checked ? [...new Set([...trade.picked, a])] : trade.picked.filter(x => x !== a); render(); });
  on('#all', 'click', () => { trade.picked = st.wallets.map(w => w.address); render(); });
  on('#none', 'click', () => { trade.picked = []; render(); });
  on('#' + refreshId, 'click', refreshFn);
}

function viewBundle() {
  const v = $('#view');
  const job = st.jobs?.buy;
  if (job) {
    v.innerHTML = jobHtml(job, '');
    on('#done', 'click', async () => { st = await send({ type: 'clearJob', kind: 'buy' }); trade.stage = 'form'; bundle.action = null; resetData(); render(); });
    pollWhileRunning();
    return;
  }
  if (!callout.info && !callout.error) detectCoin().then(() => { if (!trade.mint && callout.info?.ca) trade.mint = callout.info.ca; if ((tab === 'bbuy' || tab === 'bsell') && !page) render(); });
  if (!trade.mint && callout.info?.ca) trade.mint = callout.info.ca;
  if (trade.picked === null) trade.picked = st.wallets.map(w => w.address);
  trade.picked = trade.picked.filter(a => st.wallets.some(w => w.address === a));
  if (trade.busy) { v.innerHTML = '<h2>Starting…</h2><div class="sk row"></div><div class="sk row"></div><p class="hint">Starting the trade. This can take a few seconds on the public RPC.</p>'; return; }
  if (bundle.action === 'buy') return viewBundleBuy(v);
  if (bundle.action === 'sell') return viewBundleSell(v);

  const mintOk = isAddress(trade.mint);
  v.innerHTML = `
    <h2 style="margin-bottom:4px">Bundle</h2>
    <p class="hint" style="margin-top:0">Act from all ${plural(st.wallets.length, 'wallet')} at once. Pick the coin once.</p>
    ${coinField(mintOk)}
    <div class="bcards">
      <button class="bcard" data-b="buy"><span class="bico">${I.receive}</span><span class="grow"><span class="bt">Bundle buy</span><span class="bd">Buy this coin from every wallet</span></span><span class="chev">${I.right}</span></button>
      <button class="bcard" data-b="sell"><span class="bico">${I.send}</span><span class="grow"><span class="bt">Bundle sell</span><span class="bd">Sell a % of the bag from every wallet</span></span><span class="chev">${I.right}</span></button>
      <button class="bcard" data-b="callout"><span class="bico">${I.callouts}</span><span class="grow"><span class="bt">Bundle callout</span><span class="bd">Post a different callout from each wallet</span></span><span class="chev">${I.right}</span></button>
    </div>
    <p class="hint">Route: ${esc(routeLabel())} · slippage ${esc(st.settings.slippagePct)}% · change in Settings</p>`;
  on('#mint', 'input', (e) => { trade.mint = e.target.value.trim(); trade.toks = null; render(); });
  $$('[data-b]').forEach(x => x.onclick = () => {
    const a = x.dataset.b;
    if (a === 'callout') return go({ tab: 'callouts' });
    bundle.action = a; trade.side = a; trade.stage = 'form'; render();
  });
}

function viewBundleBuy(v) {
  if (trade.bal === null && !trade.balErr) loadBalances();
  const mintOk = isAddress(trade.mint);
  const ready = trade.bal && trade.bal !== 'loading';
  const plan = trade.picked.map(a => ready ? { address: a, ...planBuy(BigInt(trade.bal[a] || 0), trade.mode, trade.amount) } : { address: a, have: 0n, spend: 0n, err: '…' });
  const okRows = plan.filter(r => !r.err && r.spend > 0n);
  const total = okRows.reduce((a, r) => a + r.spend, 0n);

  if (trade.stage === 'review' && okRows.length && mintOk) {
    v.innerHTML = `
      ${bundleHead('Review bundle buy')}
      <div class="summary">
        <div class="kv"><span class="k">Coin</span><span class="v">${esc(mintLabel(trade.mint))}</span></div>
        <div class="kv"><span class="k">Wallets</span><span class="v">${okRows.length}</span></div>
        <div class="kv"><span class="k">Total</span><span class="v num">${fromRaw(total, 9)} SOL</span></div>
        <div class="kv"><span class="k">Slippage</span><span class="v">${esc(st.settings.slippagePct)}%</span></div>
        <div class="kv"><span class="k">Route</span><span class="v">${esc(routeLabel())}</span></div>
      </div>
      <div class="list">${okRows.map(r => `<div class="item">${avatar(walletOf(r.address), 'sm')}<div class="grow"><div class="name">${esc(nameOf(r.address))}</div></div><div class="right"><div class="v num">${fromRaw(r.spend, 9)} SOL</div></div></div>`).join('')}</div>
      ${plan.length > okRows.length ? `<div class="note warn">${plural(plan.length - okRows.length, 'wallet')} will be skipped: not enough SOL.</div>` : ''}
      <p class="err" id="err"></p>
      <div class="actions"><button class="btn" id="back2">Back</button><button class="btn primary" id="go">Buy from ${plural(okRows.length, 'wallet')}</button></div>`;
    on('#bHub', 'click', () => { trade.stage = 'form'; render(); });
    on('#back2', 'click', () => { trade.stage = 'form'; render(); });
    on('#go', 'click', async () => {
      if (trade.busy) return;
      trade.busy = true; render();
      try { await send({ type: 'buyRun', mint: trade.mint, addresses: okRows.map(r => r.address), mode: trade.mode, amount: trade.amount }); trade.busy = false; trade.stage = 'form'; await refresh(); }
      catch (e) { trade.busy = false; render(); const el = $('#err'); if (el) el.textContent = e.message; }
    });
    return;
  }
  trade.stage = 'form';
  v.innerHTML = `
    ${bundleHead('Bundle buy')}
    ${coinField(mintOk)}
    <label class="field"><span class="lbl">Amount</span>
      <div class="seg" style="margin:0 0 8px"><button data-mode="sol" class="${trade.mode === 'sol' ? 'active' : ''}">SOL per wallet</button><button data-mode="pct" class="${trade.mode === 'pct' ? 'active' : ''}">% of each balance</button></div>
      <div class="with"><input id="amt" inputmode="decimal" placeholder="${trade.mode === 'pct' ? 'e.g. 50' : 'e.g. 0.1'}" value="${esc(trade.amount)}" autocomplete="off"><span class="unit">${trade.mode === 'pct' ? '%' : 'SOL'}</span></div>
    </label>
    ${walletToolbar(trade.picked.length, 'rb')}
    ${trade.balErr ? `<div class="note bad">Couldn't load balances: ${esc(trade.balErr)}. Check the RPC URL in Settings, then refresh.</div>` : ''}
    <div class="list">${st.wallets.map(w => {
      const r = plan.find(x => x.address === w.address), on = trade.picked.includes(w.address);
      return `<label class="item ${on ? 'selected' : ''}"><input type="checkbox" data-addr="${w.address}" ${on ? 'checked' : ''}>${avatar(w, 'sm')}
        <div class="grow"><div class="name">${esc(w.name)}</div><div class="sub num">${ready ? fmtNum(fromRaw(BigInt(trade.bal[w.address] || 0), 9), 3) + ' SOL' : '<span class="sk inline"></span>'}</div></div>
        <div class="right">${r && trade.amount && ready ? (r.err ? `<span class="badge warn">${esc(r.err)}</span>` : `<div class="v num">${fromRaw(r.spend, 9)}</div><div class="sub">SOL</div>`) : ''}</div></label>`;
    }).join('')}</div>
    ${okRows.length && trade.amount ? `<div class="summary"><div class="kv"><span class="k">Total</span><span class="v num">${fromRaw(total, 9)} SOL across ${plural(okRows.length, 'wallet')}</span></div></div>` : ''}
    <p class="hint">Each wallet keeps ~0.012 SOL for fees.</p>
    <div class="actions"><button class="btn primary" id="review" ${okRows.length && mintOk && trade.amount ? '' : 'disabled'}>Review</button></div>`;
  wireBundleCommon('rb', loadBalances);
  $$('.seg button[data-mode]').forEach(b => b.onclick = (e) => { e.preventDefault(); trade.mode = b.dataset.mode; trade.amount = ''; render(); });
  on('#amt', 'input', (e) => { trade.amount = e.target.value.trim(); render(); });
  on('#review', 'click', () => { trade.stage = 'review'; render(); });
}

function viewBundleSell(v) {
  const mintOk = isAddress(trade.mint);
  if (mintOk && (trade.toks === null || trade.toksMint !== trade.mint)) loadToks();
  const toksReady = trade.toks && trade.toks !== 'loading' && !trade.toks.error;
  const pct = Number(trade.sellPct), pctOk = pct > 0 && pct <= 100;
  const rows = trade.picked.map(a => { const t = toksReady ? trade.toks[a] : null; const raw = t ? BigInt(t.raw) : 0n; return { address: a, t, raw, sellRaw: pctOk ? raw * BigInt(Math.round(pct * 100)) / 10000n : 0n }; });
  const okRows = rows.filter(r => r.sellRaw > 0n);

  if (trade.stage === 'review' && okRows.length && pctOk) {
    v.innerHTML = `
      ${bundleHead('Review bundle sell')}
      <div class="summary">
        <div class="kv"><span class="k">Coin</span><span class="v">${esc(mintLabel(trade.mint))}</span></div>
        <div class="kv"><span class="k">Selling</span><span class="v">${pct}% from ${plural(okRows.length, 'wallet')}</span></div>
        <div class="kv"><span class="k">Slippage</span><span class="v">${esc(st.settings.slippagePct)}%</span></div>
        <div class="kv"><span class="k">Route</span><span class="v">${esc(routeLabel())}</span></div>
      </div>
      <div class="list">${okRows.map(r => `<div class="item">${avatar(walletOf(r.address), 'sm')}<div class="grow"><div class="name">${esc(nameOf(r.address))}</div></div><div class="right"><div class="v num">${fmtNum(fromRaw(r.sellRaw, r.t.decimals))}</div><div class="sub">tokens</div></div></div>`).join('')}</div>
      <p class="err" id="err"></p>
      <div class="actions"><button class="btn" id="back2">Back</button><button class="btn primary" id="go">Sell from ${plural(okRows.length, 'wallet')}</button></div>`;
    on('#bHub', 'click', () => { trade.stage = 'form'; render(); });
    on('#back2', 'click', () => { trade.stage = 'form'; render(); });
    on('#go', 'click', async () => {
      if (trade.busy) return;
      trade.busy = true; render();
      try { await send({ type: 'sellRun', mint: trade.mint, addresses: okRows.map(r => r.address), pct }); trade.busy = false; trade.stage = 'form'; await refresh(); }
      catch (e) { trade.busy = false; render(); const el = $('#err'); if (el) el.textContent = e.message; }
    });
    return;
  }
  trade.stage = 'form';
  v.innerHTML = `
    ${bundleHead('Bundle sell')}
    ${coinField(mintOk)}
    <label class="field"><span class="lbl">Sell this much of each wallet's bag</span>
      <div class="with"><input id="pct" inputmode="decimal" placeholder="e.g. 50" value="${esc(trade.sellPct)}" autocomplete="off"><span class="unit">%</span></div>
      <div class="chips">${[25, 50, 75, 100].map(n => `<button data-pct="${n}" class="${pct === n ? 'active' : ''}">${n}%</button>`).join('')}</div>
    </label>
    ${walletToolbar(trade.picked.length, 'rt')}
    ${trade.toks?.error ? `<div class="note bad">Couldn't load holdings: ${esc(trade.toks.error)}. Check the RPC URL in Settings, then refresh.</div>` : ''}
    <div class="list">${st.wallets.map(w => {
      const t = toksReady ? trade.toks[w.address] : null, r = rows.find(x => x.address === w.address), on = trade.picked.includes(w.address);
      const holding = !mintOk ? 'enter a coin address' : trade.toks === 'loading' ? '<span class="sk inline"></span>' : t ? (BigInt(t.raw) ? fmtNum(fromRaw(BigInt(t.raw), t.decimals)) + ' tokens' : 'holds none') : '';
      return `<label class="item ${on ? 'selected' : ''}"><input type="checkbox" data-addr="${w.address}" ${on ? 'checked' : ''}>${avatar(w, 'sm')}
        <div class="grow"><div class="name">${esc(w.name)}</div><div class="sub num">${holding}</div></div>
        <div class="right">${r && r.sellRaw > 0n ? `<div class="v num">${fmtNum(fromRaw(r.sellRaw, r.t.decimals))}</div><div class="sub">to sell</div>` : ''}</div></label>`;
    }).join('')}</div>
    <p class="hint">Wallets holding none of this coin are skipped.</p>
    <div class="actions"><button class="btn primary" id="review" ${okRows.length && pctOk && mintOk ? '' : 'disabled'}>Review</button></div>`;
  wireBundleCommon('rt', loadToks);
  on('#pct', 'input', (e) => { trade.sellPct = e.target.value.trim(); render(); });
  $$('[data-pct]').forEach(b => b.onclick = (e) => { e.preventDefault(); trade.sellPct = b.dataset.pct; render(); });
  on('#review', 'click', () => { trade.stage = 'review'; render(); });
}

// ---------------- Callout templates ----------------
// Saved callouts per wallet (plus a shared list). {name} {ticker} {ca} {link} get swapped for the coin you're on.
const STARTER_TEMPLATES = [
  '{name} looks good to me 👀',
  'Picked up some ${ticker}, let\'s see where it goes',
  'Saw the CA on Twitter, aping a little',
  'CA: {ca}',
  'Chart on ${ticker} looks clean so far',
  'Small bag of {name}. Not financial advice',
  'Watching {name} closely',
  'Community on ${ticker} seems active',
  'Early on {name}, holding for now',
  'Fun meme, I\'m in on ${ticker}',
  'Like this one: {link}',
  'Bought the dip on {name}',
];
let tpls = null, tplEdit = null;
const tplOwner = { who: 'shared' };
async function loadTpls() {
  if (tpls) return;
  const v = (await chrome.storage.local.get('calloutTemplates')).calloutTemplates;
  tpls = v || { shared: [...STARTER_TEMPLATES] };
  if (!v) await chrome.storage.local.set({ calloutTemplates: tpls });
}
const saveTpls = () => chrome.storage.local.set({ calloutTemplates: tpls });

function sheetTpl(b) {
  if (!tpls) { loadTpls().then(renderSheet); b.innerHTML = sheetHead('Templates') + '<div class="sk row"></div>'; wireHead(); return; }
  const w = walletOf(sheet.address), i = callout.info;
  const own = tpls[sheet.address] || [], shared = tpls.shared || [];
  const row = (t, k) => `<button class="row-btn" data-tpl="${k}" style="min-height:48px"><span class="grow" style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px">${esc(i ? fillTemplate(t, i) : t)}</span></button>`;
  b.innerHTML = sheetHead(`Template for ${w?.name || 'wallet'}`)
    + (own.length ? `<h3 class="sec" style="margin-top:0">${esc(w.name)}'s templates</h3><div class="list">${own.map((t, k) => row(t, 'o' + k)).join('')}</div>` : '')
    + `<h3 class="sec" ${own.length ? '' : 'style="margin-top:0"'}>Shared</h3><div class="list">${shared.length ? shared.map((t, k) => row(t, 's' + k)).join('') : '<div class="empty">No shared templates.</div>'}</div>
    <div class="actions"><button class="btn" id="sTplManage">${I.edit} Manage templates</button></div>`;
  wireHead();
  S$('[data-tpl]').forEach(x => x.onclick = () => {
    const k = x.dataset.tpl, t = (k[0] === 'o' ? own : shared)[Number(k.slice(1))];
    const d = drafts?.[i?.ca]; if (!d || !d[sheet.address]) return closeSheet();
    d[sheet.address].text = fillTemplate(t, i); d[sheet.address].on = true; saveDrafts();
    closeSheet(); render();
  });
  on('#sTplManage', 'click', () => { tplOwner.who = sheet.address; tplEdit = null; go({ page: 'templates' }); });
}

// Dropdown under each wallet's box: that wallet's own templates first, then the shared ones.
function tplSelect(w, i) {
  const own = tpls[w.address] || [], shared = tpls.shared || [];
  if (!own.length && !shared.length) return '<p class="hint" style="margin:0">No templates yet. <button class="link" id="tplManage2">Add some</button></p>';
  const opt = (t, k) => { const f = fillTemplate(t, i).replace(/\s+/g, ' '); return `<option value="${k}">${esc(f.length > 58 ? f.slice(0, 57) + '…' : f)}</option>`; };
  return `<select data-tplsel="${w.address}" aria-label="Template for ${esc(w.name)}">
    <option value="">Use a template (${own.length + shared.length})…</option>
    ${own.length ? `<optgroup label="${esc(w.name)}'s">${own.map((t, k) => opt(t, 'o:' + k)).join('')}</optgroup>` : ''}
    ${shared.length ? `<optgroup label="Shared">${shared.map((t, k) => opt(t, 's:' + k)).join('')}</optgroup>` : ''}
  </select>`;
}

function viewTemplates() {
  const v = $('#view');
  if (!tpls) { loadTpls().then(render); v.innerHTML = '<div class="sk row"></div>'; return; }
  if (tplOwner.who !== 'shared' && !walletOf(tplOwner.who)) tplOwner.who = 'shared';
  const list = tpls[tplOwner.who] || [];
  const editing = tplEdit != null && list[tplEdit] != null;
  v.innerHTML = `
    <p class="hint" style="margin-top:0">Saved callouts you can drop into the Callouts tab. <span class="mono">{name}</span> <span class="mono">{ticker}</span> <span class="mono">{ca}</span> <span class="mono">{link}</span> get swapped for the coin you're on.</p>
    <label class="field"><span class="lbl">Templates for</span><select id="tOwner"><option value="shared">Shared (every wallet)</option>${st.wallets.map(w => `<option value="${w.address}" ${tplOwner.who === w.address ? 'selected' : ''}>${esc(w.name)} only</option>`).join('')}</select></label>
    <div class="list" style="margin-top:12px">${list.length ? list.map((t, k) => `<div class="item ${editing && k === tplEdit ? 'selected' : ''}"><div class="grow" style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px">${esc(t)}</div><button class="btn icon ghost" data-tedit="${k}" title="Edit" aria-label="Edit">${I.edit}</button><button class="btn icon ghost" data-tdel="${k}" title="Delete" aria-label="Delete" style="color:var(--loss)">${I.x}</button></div>`).join('') : '<div class="empty">No templates yet. Add one below.</div>'}</div>
    <label class="field"><span class="lbl">${editing ? 'Edit template' : 'New template'}</span><textarea id="tNew" rows="3" placeholder="e.g. {name} looks good to me">${esc(editing ? list[tplEdit] : '')}</textarea></label>
    <p class="err" id="tErr"></p>
    <div class="actions">${editing ? '<button class="btn" id="tCancel">Cancel</button>' : ''}<button class="btn primary" id="tAdd">${editing ? 'Save' : 'Add template'}</button></div>
    ${tplOwner.who === 'shared' ? '<p class="hint center"><button class="link muted" id="tReset">Add the starter templates back</button></p>' : ''}`;
  $('#tOwner').value = tplOwner.who;
  on('#tOwner', 'change', (e) => { tplOwner.who = e.target.value; tplEdit = null; render(); });
  $$('[data-tdel]').forEach(x => x.onclick = () => { list.splice(Number(x.dataset.tdel), 1); tpls[tplOwner.who] = list; tplEdit = null; saveTpls(); toast('Template deleted'); render(); });
  $$('[data-tedit]').forEach(x => x.onclick = () => { tplEdit = Number(x.dataset.tedit); render(); const t = $('#tNew'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); });
  on('#tCancel', 'click', () => { tplEdit = null; render(); });
  on('#tAdd', 'click', () => {
    const text = $('#tNew').value.trim();
    if (!text) return $('#tErr').textContent = 'Write something first';
    if (text.length > 500) return $('#tErr').textContent = 'Keep it under 500 characters';
    if (editing) list[tplEdit] = text; else list.push(text);
    tpls[tplOwner.who] = list; saveTpls();
    toast(editing ? 'Template saved' : 'Template added'); tplEdit = null; render();
  });
  on('#tReset', 'click', () => { const l = tpls.shared ||= []; let n = 0; for (const t of STARTER_TEMPLATES) if (!l.includes(t)) { l.push(t); n++; } saveTpls(); toast(n ? `Added ${plural(n, 'template')}` : 'Starters are already there'); render(); });
}

// ---------------- Callouts ----------------
let draftSaveTimer = null;
async function loadDrafts() { if (!drafts) drafts = (await chrome.storage.local.get('drafts')).drafts || {}; }
function saveDrafts() { clearTimeout(draftSaveTimer); draftSaveTimer = setTimeout(() => chrome.storage.local.set({ drafts }), 300); }

function teachLogHtml() {
  const log = (st.teachLog || []).slice(-12).reverse();
  if (!log.length) return '';
  const icon = { ok: '✓', err: '!', req: '→', watch: '◉' };
  return `<div class="card tight" style="margin-top:12px"><div class="row"><span class="muted xs" style="font-weight:700">What it saw</span><span class="inline"><button class="link muted xs" id="tlClear">Clear</button><button class="btn icon ghost" id="tlRefresh" title="Refresh" aria-label="Refresh">${I.refresh}</button></span></div>
    <div style="margin-top:6px;max-height:150px;overflow:auto;font-size:11px;line-height:1.5">${log.map(l => `<div class="trunc" style="color:${l.kind === 'ok' ? 'var(--gain)' : l.kind === 'err' ? 'var(--loss)' : l.kind === 'watch' ? 'var(--warn)' : 'var(--muted)'}"><span class="mono">${icon[l.kind] || '·'}</span> ${esc(l.text)}${l.status ? ` <span class="mono">${l.status}</span>` : ''}</div>`).join('')}</div></div>`;
}
function teachPanel(v) {
  const t = st.taught, i = callout.info;
  v.innerHTML = `
    <span class="eyebrow">One-time setup</span>
    <h2 style="margin-top:4px">Connect pump.fun login</h2>
    <p class="hint">Truth watches how pump.fun signs you in and posts once, then repeats it for every wallet. The popup closing when you click the page is normal. The recording keeps running on the tab.</p>
    <div class="steps">
      <div class="step ${t.login ? 'done' : ''}"><span class="n">${t.login ? '✓' : '1'}</span><div style="flex:1">
        <div class="t">Sign in to pump.fun with Truth</div>
        ${t.login ? `<div class="d">Learned ${plural(t.loginSteps, 'request')}:<br>${t.loginList.map(l => `<span class="mono">${esc(l)}</span>`).join('<br>')}</div>`
          : `<div class="d">On pump.fun: <b>log out</b> first (if you're logged in with Phantom nothing happens), click <b>Log in</b>, pick <b>Truth</b>, approve the Sign message window. Then open Truth again.</div>`}
      </div></div>
      <div class="step ${t.post ? 'done' : ''}"><span class="n">${t.post ? '✓' : '2'}</span><div style="flex:1">
        <div class="t">Post one callout yourself</div>
        ${t.post ? `<div class="d">Learned: <span class="mono">${esc(t.postPath)}</span></div>` : `
        <div class="d">Type the exact callout you're about to post, press <b>Watch</b>, then make a <b>new callout</b> on the coin with that same text, not a reply under someone else's callout (it's a real callout and stays up). Then open Truth again.</div>
        ${!t.login ? '<div class="d" style="color:var(--warn)">Do step 1 first. The post needs the sign-in to be learned.</div>' : ''}
        <textarea id="tt" rows="3" style="margin-top:8px" placeholder="e.g. Dev is based, chart is clean, I'm in" ${t.login ? '' : 'disabled'}>${esc(teach.text)}</textarea>
        ${i ? `<p class="hint" style="margin:6px 0 0">Coin open: <b>${esc(i.name || short(i.ca))}</b></p>` : `<p class="hint" style="margin:6px 0 0;color:var(--warn)">${esc(callout.error || 'Open a coin page on pump.fun first.')}</p>`}
        <p class="ok" id="okmsg">${teach.watching ? 'Watching this tab for 10 minutes. Post that text on pump.fun now.' : ''}</p><p class="err" id="err"></p>
        <div class="actions" style="margin-top:8px"><button class="btn primary sm" id="watch" ${i && t.login && teach.text.trim().length >= 4 ? '' : 'disabled'}>Watch for this post</button></div>`}
      </div></div>
    </div>
    <div class="actions"><button class="btn" id="chk">Check again</button>${t.login || t.post ? '<button class="btn ghost" id="reteach">Start over</button>' : ''}</div>
    ${teachLogHtml()}
    <p class="hint" style="margin-top:12px">Just want to post from the active wallet? <button class="link" id="single">Quick reply</button></p>`;
  on('#tt', 'input', (e) => { teach.text = e.target.value; const b = $('#watch'); if (b) b.disabled = !(i && t.login && teach.text.trim().length >= 4); });
  on('#watch', 'click', async () => {
    try { const tb = await activeTab(); await chrome.tabs.sendMessage(tb.id, { type: 'learn', mint: i.ca, text: teach.text.trim() }); teach.watching = true; render(); }
    catch { $('#err').textContent = 'Teaching Truth needs the extension on a pump.fun tab.'; }
  });
  on('#chk', 'click', async () => { callout.info = null; callout.error = ''; await refresh(); });
  on('#reteach', 'click', async () => { st = await send({ type: 'forgetTeach' }); teach.watching = false; render(); });
  on('#single', 'click', () => go({ page: 'reply' }));
  on('#tlRefresh', 'click', refresh);
  on('#tlClear', 'click', async () => { st = await send({ type: 'clearTeachLog' }); render(); });
}
const connectedRow = () => {
  if (IS_WEB) return `<div class="connected">${I.check}<span>Callouts post through the Truth relay. No setup needed.</span>${callout.info ? '<button class="link muted" id="chgCoin">Change coin</button>' : ''}</div>`;
  const p = st.taught.postPath || '';
  const odd = p && (!/callout/i.test(p) || /repl(y|ies)|comment|thread|message|chat/i.test(p));
  return `<div class="connected">${I.check}<span>pump.fun login connected</span><button class="link muted" id="reteach">Re-teach</button></div>
    ${odd ? `<div class="note warn">Truth learned a reply (<span class="mono">${esc(p)}</span>), not a new callout. Press Re-teach and make a <b>new callout</b> on the coin, not a reply under someone's callout.</div>` : `<p class="hint mono" style="margin:4px 0 0">post → ${esc(p)}</p>`}`;
};

function viewCallouts() {
  const v = $('#view');
  if (!drafts || !tpls) { Promise.all([loadDrafts(), loadTpls()]).then(render); v.innerHTML = '<div class="sk row"></div>'; return; }
  if (!callout.info && !callout.error) { v.innerHTML = '<div class="sk row"></div><div class="sk row"></div>'; detectCoin().then(() => { if (tab === 'callouts' && !page) render(); }); return; }
  if (!IS_WEB && (!st.taught.login || !st.taught.post)) return teachPanel(v);
  const wireCommon = () => {
    on('#reteach', 'click', async () => { st = await send({ type: 'forgetTeach' }); teach.watching = false; render(); });
    on('#single', 'click', () => go({ page: 'reply' }));
    on('#chgCoin', 'click', () => { webCoin.set(''); callout.info = null; callout.error = NO_WEB_COIN; callout.text = ''; render(); });
  };
  const i = callout.info;
  const job = st.jobs?.thesis;
  if (job && (!i || job.mint === i.ca)) {
    const done = job.rows.filter(r => r.state === 'posted').length, failed = job.rows.filter(r => r.state === 'failed').length;
    v.innerHTML = `
      ${coinHeader(i || { ca: job.mint })}
      <div class="row sec-row"><h3 class="sec">${job.done ? `Posted ${done} of ${job.rows.length}` : 'Posting'}</h3>${job.done ? '' : `<span class="badge on live"><span class="dot"></span>${IS_WEB ? 'keep this page open' : 'keep the pump.fun tab open'}</span>`}</div>
      <div class="list">${job.rows.map(r => `<div class="item">${statusDot(r.state)}<div class="grow"><div class="name">${esc(nameOf(r.address))}</div>${r.state === 'failed' && r.error ? `<div class="sub" style="color:var(--loss);white-space:normal">${esc(r.error)}</div>` : `<div class="sub">${esc(r.state === 'posting' && r.tries > 1 ? `retrying (try ${r.tries})` : r.state)}</div>`}${r.warn ? `<div class="sub" style="color:var(--warn);white-space:normal">${esc(r.warn)}</div>` : ''}${r.detail ? `<div class="sub mono" style="white-space:normal">${esc(r.detail)}</div>` : ''}</div></div>`).join('')}</div>
      ${job.done && failed ? `<div class="note warn">${plural(failed, 'wallet')} didn't post. Truth already retried the temporary errors. Check the reason above, then retry.</div>` : ''}
      <p class="err" id="err"></p>
      ${job.done ? `<div class="actions">${failed && job.rows.some(r => r.state === 'failed' && r.text) ? `<button class="btn" id="retryFailed">Retry ${plural(failed, 'failed one')}</button>` : ''}<button class="btn primary" id="again">Write more</button></div>` : ''}
      ${job.done && i ? '<p class="hint center" style="margin-top:12px">Want your other wallets to like it? Open the <button class="link" id="toLike">Like</button> tab.</p>' : ''}`;
    on('#again', 'click', async () => { st = await send({ type: 'clearJob', kind: 'thesis' }); thesis.stage = 'edit'; render(); });
    on('#retryFailed', 'click', async () => {
      $('#retryFailed').disabled = true;
      try {
        const items = job.rows.filter(r => r.state === 'failed' && r.text).map(r => ({ address: r.address, text: r.text }));
        if (IS_WEB) await send({ type: 'thesisRunWeb', mint: job.mint, items });
        else { const t = await pumpTab(); await send({ type: 'thesisRun', tabId: t.id, mint: job.mint, items }); }
        await refresh();
      } catch (e) { $('#err').textContent = e.message; $('#retryFailed').disabled = false; }
    });
    on('#toLike', 'click', () => go({ tab: 'like' }));
    pollWhileRunning();
    return;
  }
  if (!i && IS_WEB) {
    v.innerHTML = `${connectedRow()}
      <div class="card" style="margin-top:16px">
        <b>Which coin?</b>
        <div class="sub" style="margin-top:4px">Every wallet you tick posts its own callout on this coin.</div>
        <label class="field" style="margin-top:10px"><span class="lbl">Coin address or pump.fun link</span><input id="coinIn" placeholder="e.g. pump.fun/coin/…" autocomplete="off" spellcheck="false"></label>
        <p class="err" id="coinErr"></p>
        <div class="actions" style="margin-top:8px"><button class="btn primary" id="coinGo" disabled>Use this coin</button></div>
      </div>`;
    const inp = $('#coinIn');
    const check = () => { $('#coinGo').disabled = !parseCoinInput(inp.value); $('#coinErr').textContent = inp.value.trim() && !parseCoinInput(inp.value) ? "That doesn't contain a coin address." : ''; };
    const use = () => { const ca = parseCoinInput(inp.value); if (!ca) return; webCoin.set(ca); callout.error = ''; callout.info = null; callout.text = ''; render(); };
    inp.oninput = check;
    inp.onkeydown = (e) => { if (e.key === 'Enter') use(); };
    on('#coinGo', 'click', use);
    inp.focus();
    return;
  }
  if (!i) {
    v.innerHTML = `${connectedRow()}
      <div class="empty" style="margin-top:16px"><b>Open a coin on pump.fun</b>${esc(callout.error)}<br><button class="btn sm" id="rt">Check again</button></div>
      <p class="hint center" style="margin-top:12px"><button class="link" id="single">Quick reply</button> posts from just the active wallet.</p>`;
    wireCommon();
    on('#rt', 'click', () => { callout.error = ''; render(); });
    return;
  }

  const d = drafts[i.ca] ||= {};
  for (const w of st.wallets) d[w.address] ||= { text: '', on: true };
  const ready = st.wallets.filter(w => d[w.address].on && d[w.address].text.trim());

  if (thesis.stage === 'review' && ready.length) {
    v.innerHTML = `
      <button class="link muted" id="back">${I.back} Edit</button>
      <h2 style="margin-top:8px">Review ${plural(ready.length, 'callout')}</h2>
      ${coinHeader(i)}
      <div class="list" style="margin-top:8px">${ready.map(w => `<div class="item col"><div class="row"><span class="inline">${avatar(w, 'sm')}<b>${esc(w.name)}</b></span><span class="mono muted">${short(w.address)}</span></div><div class="dim" style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px">${esc(d[w.address].text.trim())}</div></div>`).join('')}</div>
      <p class="hint">Goes out one wallet at a time, ${esc(st.settings.thesisDelaySec)}s apart. ${IS_WEB ? 'Keep this page open until it finishes.' : 'Keep this pump.fun tab open until it finishes. You can close Truth.'}</p>
      <p class="err" id="err"></p>
      <div class="actions"><button class="btn" id="back2">Back</button><button class="btn primary" id="go">Post ${plural(ready.length, 'callout')}</button></div>`;
    const back = () => { thesis.stage = 'edit'; render(); };
    on('#back', 'click', back); on('#back2', 'click', back);
    on('#go', 'click', async () => {
      $('#go').disabled = true;
      try {
        const items = ready.map(w => ({ address: w.address, text: d[w.address].text.trim() }));
        if (IS_WEB) await send({ type: 'thesisRunWeb', mint: i.ca, items });
        else { const t = await pumpTab(); await send({ type: 'thesisRun', tabId: t.id, mint: i.ca, items }); }
        for (const w of ready) d[w.address].text = '';
        saveDrafts(); thesis.stage = 'edit';
        await refresh();
      } catch (e) { $('#err').textContent = e.message; $('#go').disabled = false; }
    });
    return;
  }
  thesis.stage = 'edit';
  v.innerHTML = `
    ${connectedRow()}
    <div style="margin-top:12px">${coinHeader(i)}</div>
    <div class="row sec-row"><h3 class="sec">One callout per wallet</h3><button class="link" id="tplManage3">${I.edit} Edit templates</button></div>
    <div class="list">${st.wallets.map((w, n) => `
      <div class="item col ${d[w.address].on ? '' : 'muted'}">
        <label class="row" style="cursor:pointer"><span class="inline"><input type="checkbox" data-on="${w.address}" ${d[w.address].on ? 'checked' : ''}>${avatar(w, 'sm')}<b>${esc(w.name)}</b></span><span class="mono muted">${short(w.address)}</span></label>
        <textarea id="t_${n}" data-txt="${w.address}" rows="3" placeholder="${esc(w.name)}'s take on this coin…" ${d[w.address].on ? '' : 'disabled'}>${esc(d[w.address].text)}</textarea>
        ${tplSelect(w, i)}
      </div>`).join('')}</div>
    <div class="actions"><button class="btn primary" id="review" ${ready.length ? '' : 'disabled'}>${ready.length ? `Review ${plural(ready.length, 'callout')}` : 'Write at least one'}</button></div>
    <p class="hint" style="margin-top:10px"><button class="link" id="tplManage">Manage templates</button>${IS_WEB ? '' : ' · Only posting from the active wallet? <button class="link" id="single">Quick reply</button>'}</p>`;
  wireCommon();
  $$('[data-tplsel]').forEach(x => x.onchange = () => {
    const a = x.dataset.tplsel, [k, n] = x.value.split(':'); if (!k) return;
    const t = (k === 'o' ? tpls[a] : tpls.shared)?.[Number(n)]; if (t == null) return;
    d[a].text = fillTemplate(t, i); d[a].on = true; saveDrafts(); render();
  });
  on('#tplManage', 'click', () => { tplOwner.who = 'shared'; tplEdit = null; go({ page: 'templates' }); });
  on('#tplManage2', 'click', () => { tplOwner.who = 'shared'; tplEdit = null; go({ page: 'templates' }); });
  $$('[data-txt]').forEach(ta => ta.oninput = () => {
    d[ta.dataset.txt].text = ta.value; saveDrafts();
    const n = st.wallets.filter(w => d[w.address].on && d[w.address].text.trim()).length;
    $('#review').disabled = !n; $('#review').textContent = n ? `Review ${plural(n, 'callout')}` : 'Write at least one';
  });
  $$('[data-on]').forEach(cb => cb.onchange = () => { d[cb.dataset.on].on = cb.checked; saveDrafts(); render(); });
  on('#tplManage3', 'click', () => { tplOwner.who = 'shared'; tplEdit = null; go({ page: 'templates' }); });
  on('#review', 'click', () => { thesis.stage = 'review'; render(); });
}

// ---------------- like a callout from many wallets ----------------
// Reads a pump.fun callout link: /callouts/<mint>/<id>[/<reply>] or /coin/<mint>?highlight_callout=<id>.
function parseCalloutLink(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  let u; try { u = new URL(/^https?:\/\//.test(t) ? t : /^([\w-]+\.)*pump\.fun\//i.test(t) ? 'https://' + t : 'https://pump.fun/' + t.replace(/^\/+/, '')); } catch { return { bad: true }; }
  if (!/(^|\.)pump\.fun$/.test(u.hostname)) return { bad: true };
  let m = u.pathname.match(/^\/callouts\/([1-9A-HJ-NP-Za-km-z]{32,44})\/([\w-]{4,80})(?:\/([\w-]+))?\/?$/);
  if (m) return m[3] ? { bad: true, reply: true } : { mint: m[1], calloutId: m[2] };
  m = u.pathname.match(/^\/coin\/([1-9A-HJ-NP-Za-km-z]{32,44})/);
  const h = u.searchParams.get('highlight_callout');
  if (m && h && /^[\w-]{4,80}$/.test(h)) return { mint: m[1], calloutId: h };
  return { bad: true };
}
function likeCard(i) {
  if (!st.taught.login || !st.taught.post) return '';
  const job = st.jobs?.like;
  if (job) {
    const ok = job.rows.filter(r => r.state === 'posted').length;
    if (!job.done) pollWhileRunning();
    const whose = job.owner ? `${esc(nameOf(job.owner))}'s callout` : 'the callout';
    return `<div class="card" style="margin:16px 0 0">
      <div class="row"><b>${job.done ? `Liked from ${ok} of ${job.rows.length}` : `Liking ${whose}…`}</b>${job.done ? '<button class="btn sm" id="lkDone">Close</button>' : '<span class="badge on live"><span class="dot"></span>keep pump.fun open</span>'}</div>
      ${job.calloutId && job.mint ? `<p class="hint mono" style="margin:6px 0 0">pump.fun/callouts/${esc(short(job.mint))}/${esc(job.calloutId)}</p>` : ''}
      <div class="list" style="margin-top:10px">${job.rows.map(r => `<div class="item">${statusDot(r.state)}<div class="grow"><div class="name">${esc(nameOf(r.address))}</div><div class="sub" style="white-space:normal;${r.error ? 'color:var(--loss)' : ''}">${esc(r.error || r.detail || r.state)}</div></div></div>`).join('')}</div>
    </div>`;
  }
  const link = parseCalloutLink(likeUi.link);
  const owner = walletOf(store.get('likeOwner', st.selected)) ? store.get('likeOwner', st.selected) : st.selected;
  const isOn = (w) => likeEx ? !likeEx.has(w.address) : w.address !== owner;
  const on_ = st.wallets.filter(isOn);
  const target = link && !link.bad ? 'link' : i ? 'owner' : null;
  const canGo = target && on_.length;
  return `<div class="card" style="margin:12px 0 0">
    <b>Like a callout · View as poster</b>
    <div class="sub" style="margin-top:4px">Like: each ticked wallet signs in to pump.fun and likes it (reruns are safe). View as poster: switches pump.fun to the wallet that posted it, opens it (up to 2 times per callout), then switches back.</div>
    <label class="field" style="margin-top:10px"><span class="lbl">${i ? `Whose callout on ${esc(i.ticker ? '$' + i.ticker : i.name || 'this coin')} (the poster)` : 'Which of your wallets posted it'}</span>
      <select id="lkOwner">${st.wallets.map(w => `<option value="${w.address}" ${w.address === owner ? 'selected' : ''}>${esc(w.name)}${w.address === st.selected ? ' (active)' : ''}</option>`).join('')}</select></label>
    <label class="field"><span class="lbl">${i ? 'Or paste a callout link' : 'Callout link'}</span><input id="lkLink" placeholder="pump.fun/callouts/…" value="${esc(likeUi.link)}" autocomplete="off" spellcheck="false"></label>
    ${link?.bad ? `<p class="hint" style="margin:4px 0 0;color:var(--warn)">${link.reply ? "That's a reply, not a callout. Paste the callout's own link." : "That doesn't look like a pump.fun callout link."}</p>` : link ? '<p class="hint" style="margin:4px 0 0">Liking the callout from this link.</p>' : ''}
    <div style="display:flex;gap:8px;align-items:center;margin-top:12px"><span class="sub">Which wallets</span><button class="btn sm ghost" id="lkAll">All</button><button class="btn sm ghost" id="lkNone">None</button><span class="sub">${on_.length} of ${st.wallets.length} ticked</span></div>
    <div class="fxlist">${st.wallets.map(w => `<label class="fx"><input type="checkbox" data-lk="${w.address}" ${isOn(w) ? 'checked' : ''}>${avatar(w, 'sm')}<span class="trunc">${esc(w.name)}</span></label>`).join('')}</div>
    <p class="err" id="lkErr"></p>
    ${sv.msg ? `<p class="ok" style="margin:6px 0 0">${esc(sv.msg)}</p>` : ''}<p class="err" id="svErr">${esc(sv.err)}</p>
    <div class="actions" style="margin-top:10px"><button class="btn primary" id="lkGo" ${canGo ? '' : 'disabled'}>${!target ? 'Open a coin or paste a link' : on_.length ? `Like from ${plural(on_.length, 'wallet')}` : 'Tick at least 1 wallet'}</button><button class="btn" id="svGo" ${target && !sv.busy ? '' : 'disabled'}>${sv.busy ? 'Opening…' : `View as ${esc(nameOf(owner))}`}</button></div>
    <p class="hint" style="margin:6px 0 0">View as poster opens it up to 2 times per callout, only from the wallet that posted it.</p>
  </div>`;
}
// Website: paste many callout links; every ticked wallet likes all of them through the Truth relay.
function parseCalloutLinks(text) {
  const found = [], bad = [];
  for (const part of String(text || '').split(/[\s,]+/).map(x => x.trim()).filter(Boolean)) {
    const l = parseCalloutLink(part);
    if (!l || l.bad) { bad.push({ text: part, reply: !!l?.reply }); continue; }
    if (!found.some(f => f.calloutId === l.calloutId)) found.push(l);
  }
  return { found, bad };
}
function likeRunCard(job) {
  const ok = job.rows.filter(r => r.state === 'posted').length, n = job.targets?.length || 1;
  const finished = job.rows.filter(r => !['waiting', 'posting'].includes(r.state)).length;
  const dead = Object.entries(job.dead || {});
  const open = likeUi.open.has(job.id) || !job.done;
  const when = new Date(job.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `<div class="card" style="margin:10px 0 0">
    <div class="row"><b>${plural(n, 'callout')} · ${plural(job.rows.length, 'wallet')}</b>${job.done ? `<span class="inline"><button class="link muted xs" data-lkopen="${job.id}">${open ? 'Hide' : 'Details'}</button><button class="btn sm" data-lkclose="${job.id}">Close</button></span>` : `<span class="badge on live"><span class="dot"></span>${finished} of ${job.rows.length}</span>`}</div>
    <div class="sub" style="margin-top:2px">${job.done ? `${job.stopped ? 'Stopped' : 'Done'}: ${ok} of ${plural(job.rows.length, 'wallet')} liked` : 'Running'} · started ${esc(when)}</div>
    ${open ? `<div class="list" style="margin-top:8px">${job.rows.map(r => `<div class="item">${statusDot(r.state)}<div class="grow"><div class="name">${esc(nameOf(r.address))}</div><div class="sub" style="white-space:normal">${esc(r.detail || r.state)}</div>${r.error ? `<div class="sub" style="white-space:normal;color:var(--loss)">${esc(r.error)}</div>` : ''}</div></div>`).join('')}</div>` : ''}
    ${dead.length ? `<div class="note warn" style="margin-top:8px">${plural(dead.length, 'link')} couldn't be liked by anyone: ${dead.map(([id, why]) => `<span class="mono">${esc(id.slice(0, 8))}…</span> ${esc(why)}`).join(', ')}</div>` : ''}
  </div>`;
}
function viewLikeWeb(v) {
  const ae = document.activeElement, keepFocus = ae?.id === 'lkLinks' ? [ae.selectionStart, ae.selectionEnd, ae.scrollTop] : null;
  const runs = st.jobs?.likes || [];
  if (runs.some(r => !r.done)) pollWhileRunning();
  const runsHtml = runs.length ? `<div class="row sec-row" style="margin-top:16px"><h3 class="sec">Runs</h3>${runs.filter(r => r.done).length > 1 ? '<button class="link muted" id="lkClearDone">Close finished</button>' : ''}</div>${runs.map(likeRunCard).join('')}` : '';
  const { found, bad } = parseCalloutLinks(likeUi.links);
  const isOn = (w) => !(likeEx && likeEx.has(w.address));
  const on_ = st.wallets.filter(isOn);
  const canGo = found.length && on_.length && found.length <= 200;
  v.innerHTML = `<div class="card">
    <b>Like callouts</b>
    <div class="sub" style="margin-top:4px">Every ticked wallet signs in to pump.fun once and likes every callout you paste. Running it again is safe: callouts a wallet already liked are skipped.</div>
    <label class="field" style="margin-top:10px"><span class="lbl">Callout links, one per line</span><textarea id="lkLinks" rows="5" placeholder="pump.fun/callouts/…&#10;pump.fun/callouts/…" autocomplete="off" spellcheck="false">${esc(likeUi.links)}</textarea></label>
    <p class="hint" style="margin:4px 0 0">${found.length ? `${plural(found.length, 'callout')} ready.` : 'Paste one or more pump.fun callout links.'}${found.length > 200 ? ' Up to 200 at a time.' : ''}</p>
    ${bad.length ? `<p class="hint" style="margin:4px 0 0;color:var(--warn)">Skipping ${plural(bad.length, 'line')} that ${bad.length === 1 ? "isn't a callout link" : "aren't callout links"}${bad.some(b => b.reply) ? " (replies can't be liked here; paste the callout's own link)" : ''}: ${bad.slice(0, 3).map(b => `<span class="mono">${esc(b.text.slice(0, 40))}</span>`).join(', ')}${bad.length > 3 ? '…' : ''}</p>` : ''}
    <div style="display:flex;gap:8px;align-items:center;margin-top:12px"><span class="sub">Which wallets</span><button class="btn sm ghost" id="lkAll">All</button><button class="btn sm ghost" id="lkNone">None</button><span class="sub">${on_.length} of ${st.wallets.length} ticked</span></div>
    <div class="fxlist">${st.wallets.map(w => `<label class="fx"><input type="checkbox" data-lk="${w.address}" ${isOn(w) ? 'checked' : ''}>${avatar(w, 'sm')}<span class="trunc">${esc(w.name)}</span></label>`).join('')}</div>
    <p class="err" id="lkErr"></p>
    <div class="actions" style="margin-top:10px"><button class="btn primary" id="lkGo" ${canGo ? '' : 'disabled'}>${!found.length ? 'Paste callout links' : !on_.length ? 'Tick at least 1 wallet' : `Like ${plural(found.length, 'callout')} from ${plural(on_.length, 'wallet')}`}</button></div>
  </div>
  <p class="hint" style="margin-top:12px">Each run goes one wallet at a time. You can start more runs while others are going; a wallet in two runs takes turns. Keep this page open while they run.</p>
  ${runsHtml}`;
  $$('[data-lkclose]').forEach(b => b.onclick = async () => { likeUi.open.delete(b.dataset.lkclose); st = await send({ type: 'clearLikeRun', id: b.dataset.lkclose }); render(); });
  $$('[data-lkopen]').forEach(b => b.onclick = () => { const id = b.dataset.lkopen; likeUi.open.has(id) ? likeUi.open.delete(id) : likeUi.open.add(id); render(); });
  on('#lkClearDone', 'click', async () => { st = await send({ type: 'clearLikeRunsDone' }); render(); });
  const ta = $('#lkLinks');
  if (keepFocus) { ta.focus(); ta.setSelectionRange(keepFocus[0], keepFocus[1]); ta.scrollTop = keepFocus[2]; }
  const saveLinks = () => { likeUi.links = ta.value; store.set('likeLinks', likeUi.links); };
  ta.oninput = () => { saveLinks(); clearTimeout(viewLikeWeb.t); viewLikeWeb.t = setTimeout(() => { const pos = ta.selectionStart; render(); const t2 = $('#lkLinks'); if (t2) { t2.focus(); t2.setSelectionRange(pos, pos); } }, 400); };
  $$('[data-lk]').forEach(cb => cb.onchange = () => { likeEx ||= new Set(); cb.checked ? likeEx.delete(cb.dataset.lk) : likeEx.add(cb.dataset.lk); saveLikeEx(); render(); });
  on('#lkAll', 'click', () => { likeEx = new Set(); saveLikeEx(); render(); });
  on('#lkNone', 'click', () => { likeEx = new Set(st.wallets.map(w => w.address)); saveLikeEx(); render(); });
  on('#lkGo', 'click', async () => {
    const b = $('#lkGo'); b.disabled = true;
    try {
      saveLinks();
      const { found: list } = parseCalloutLinks(likeUi.links);
      await send({ type: 'likeRunWeb', targets: list.map(l => ({ mint: l.mint, calloutId: l.calloutId })), addresses: st.wallets.filter(isOn).map(w => w.address) });
      likeUi.links = ''; store.set('likeLinks', '');
      await refresh();
    } catch (e) { b.disabled = false; const el = $('#lkErr'); if (el) el.textContent = e.message; }
  });
}
function viewLike() {
  const v = $('#view');
  if (IS_WEB) return viewLikeWeb(v);
  if (!st.taught.login || !st.taught.post) {
    v.innerHTML = `<div class="empty" style="margin-top:16px"><b>Connect the pump.fun login first</b>Truth needs to learn pump.fun's sign-in once before your wallets can like anything.<br><button class="btn sm" id="toCallouts">Go to Callouts</button></div>`;
    on('#toCallouts', 'click', () => go({ tab: 'callouts' }));
    return;
  }
  if (!callout.info && !callout.error) { v.innerHTML = '<div class="sk row"></div><div class="sk row"></div>'; detectCoin().then(() => { if (tab === 'like' && !page) render(); }); return; }
  const i = callout.info;
  v.innerHTML = `${i ? coinHeader(i) : `<div class="note">${esc(callout.error)} You can still paste a callout link below. <button class="link" id="lkRecheck">Check again</button></div>`}
    ${likeCard(i)}
    <p class="hint" style="margin-top:12px">Keep the pump.fun tab open while it runs. You can close Truth.</p>`;
  on('#lkRecheck', 'click', () => { callout.error = ''; render(); });
  wireLike(i);
}
const sv = { busy: false, msg: '', err: '' };
function selfViewCard(i) {
  if (st.jobs?.like && !st.jobs.like.done) return '';
  const link = parseCalloutLink(likeUi.link);
  const owner = walletOf(store.get('svOwner', st.selected)) ? store.get('svOwner', st.selected) : st.selected;
  const target = link && !link.bad ? link : i?.ca ? { mint: i.ca } : null;
  return `<div class="card" style="margin:12px 0 0">
    <b>View as poster</b>
    <div class="sub" style="margin-top:4px">Switches pump.fun to the wallet that posted the callout, opens it, then switches back. Only the posting wallet, up to 2 times per callout.</div>
    <label class="field" style="margin-top:10px"><span class="lbl">Which of your wallets posted it</span>
      <select id="svOwner">${st.wallets.map(w => `<option value="${w.address}" ${w.address === owner ? 'selected' : ''}>${esc(w.name)}${w.address === st.selected ? ' (active)' : ''}</option>`).join('')}</select></label>
    <p class="hint" style="margin:6px 0 0">${link && !link.bad ? 'Opens the callout from the link above.' : i?.ca ? `Opens ${esc(i.ticker ? '$' + i.ticker : 'this coin')}'s page, where the callout shows. Paste the callout link above to open the callout itself.` : 'Open a coin on pump.fun or paste the callout link above.'}</p>
    ${sv.msg ? `<p class="ok" style="margin:6px 0 0">${esc(sv.msg)}</p>` : ''}<p class="err" id="svErr">${esc(sv.err)}</p>
    <div class="actions" style="margin-top:10px"><button class="btn" id="svGo" ${target && !sv.busy ? '' : 'disabled'}>${sv.busy ? 'Opening…' : `Open as ${esc(nameOf(owner))}`}</button></div>
  </div>`;
}

function wireLike(i) {
  on('#svOwner', 'change', (e) => { store.set('svOwner', e.target.value); sv.msg = sv.err = ''; render(); });
  on('#svGo', 'click', async () => {
    if (sv.busy) return;
    sv.busy = true; sv.msg = sv.err = ''; render();
    try {
      const t = await activeTab();
      if (!t?.url || !/^https:\/\/([a-z0-9-]+\.)*pump\.fun\//.test(t.url)) throw new Error('This runs on a pump.fun tab, so it needs the Truth extension. The website handles buys, sells, sends and holdings.');
      const link = parseCalloutLink($('#lkLink')?.value || likeUi.link);
      if (link?.bad) throw new Error("That link isn't a pump.fun callout");
      const owner = walletOf(store.get('likeOwner', st.selected)) ? store.get('likeOwner', st.selected) : st.selected;
      await send({ type: 'selfView', tabId: t.id, owner, ...(link ? { mint: link.mint, calloutId: link.calloutId } : { mint: i?.ca }) });
      sv.msg = `Opened as ${nameOf(owner)} and switched back.`;
    } catch (e) { sv.err = e.message; }
    sv.busy = false; render();
  });
  on('#lkDone', 'click', async () => { st = await send({ type: 'clearJob', kind: 'like' }); render(); });
  const ensureEx = () => { if (!likeEx) { const owner = store.get('likeOwner', st.selected); likeEx = new Set(st.wallets.some(w => w.address === owner) ? [owner] : []); } };
  $$('[data-lk]').forEach(cb => cb.onchange = () => { ensureEx(); cb.checked ? likeEx.delete(cb.dataset.lk) : likeEx.add(cb.dataset.lk); saveLikeEx(); render(); });
  on('#lkAll', 'click', () => { likeEx = new Set(); saveLikeEx(); render(); });
  on('#lkNone', 'click', () => { likeEx = new Set(st.wallets.map(w => w.address)); saveLikeEx(); render(); });
  on('#lkOwner', 'change', (e) => { store.set('likeOwner', e.target.value); sv.msg = sv.err = ''; render(); });
  on('#lkLink', 'change', (e) => { likeUi.link = e.target.value; render(); });
  on('#lkLink', 'paste', () => setTimeout(() => { likeUi.link = $('#lkLink')?.value || ''; render(); }, 0));
  on('#lkGo', 'click', async () => {
    const b = $('#lkGo'); b.disabled = true;
    try {
      likeUi.link = $('#lkLink')?.value || likeUi.link;
      const t = await activeTab();
      if (!t?.url || !/^https:\/\/([a-z0-9-]+\.)*pump\.fun\//.test(t.url)) throw new Error('This runs on a pump.fun tab, so it needs the Truth extension. The website handles buys, sells, sends and holdings.');
      const link = parseCalloutLink(likeUi.link);
      if (link?.bad) throw new Error("That link isn't a pump.fun callout");
      const owner = walletOf(store.get('likeOwner', st.selected)) ? store.get('likeOwner', st.selected) : st.selected;
      const isOn = (w) => likeEx ? !likeEx.has(w.address) : w.address !== owner;
      const addresses = st.wallets.filter(isOn).map(w => w.address);
      await send({ type: 'likeRun', tabId: t.id, addresses, ...(link ? { mint: link.mint, calloutId: link.calloutId } : { mint: i?.ca, owner }) });
      likeUi.link = '';
      await refresh();
    } catch (e) { b.disabled = false; const el = $('#lkErr'); if (el) el.textContent = e.message; }
  });
}

// ---------------- Quick reply (page) ----------------
function viewReply() {
  const v = $('#view');
  if (callout.autoSubmit === null) callout.autoSubmit = !!st.settings.autoSubmit;
  if (!callout.info && !callout.error) { v.innerHTML = '<div class="sk row"></div>'; detectCoin().then(() => tab === 'reply' && render()); return; }
  if (!callout.info) { v.innerHTML = `<div class="empty"><b>No coin open</b>${esc(callout.error)}<br><button class="btn sm" id="rt">Check again</button></div>`; on('#rt', 'click', () => { callout.error = ''; render(); }); return; }
  const i = callout.info, w = selectedWallet();
  v.innerHTML = `
    ${coinHeader(i)}
    <label class="field"><span class="lbl">Text</span><textarea id="txt" rows="5">${esc(callout.text)}</textarea></label>
    <div class="row" style="margin-top:6px"><button class="link" id="reset">Reset to template</button><span class="muted xs">{name} {ticker} {ca} {link}</span></div>
    <label class="check"><input type="checkbox" id="auto" ${callout.autoSubmit ? 'checked' : ''}> Post it (otherwise just fill the reply box)</label>
    <p class="hint">Posts as whichever wallet pump.fun is signed in with. Connect pump.fun with <b>Truth</b> so that's <b>${esc(w?.name || 'your active wallet')}</b>.</p>
    <p class="err" id="err">${esc(callout.status.startsWith('!') ? callout.status.slice(1) : '')}</p>
    <p class="ok" id="okmsg">${esc(callout.status && !callout.status.startsWith('!') ? callout.status : '')}</p>
    <div class="actions"><button class="btn primary" id="post">${callout.autoSubmit ? 'Post reply' : 'Fill reply box'}</button></div>`;
  on('#txt', 'input', (e) => callout.text = e.target.value);
  on('#reset', 'click', () => { callout.text = fillTemplate(st.settings.template, i); render(); });
  on('#auto', 'change', (e) => { callout.autoSubmit = e.target.checked; render(); });
  on('#post', 'click', async () => {
    if (!callout.text.trim()) return;
    $('#post').disabled = true;
    try {
      const t = await pumpTab();
      const r = await chrome.tabs.sendMessage(t.id, { type: 'callout', text: callout.text, autoSubmit: callout.autoSubmit });
      if (!r?.ok) throw new Error(r?.error || 'Failed');
      callout.status = r.result.note ? '!' + r.result.note : r.result.posted ? 'Posted.' : 'Filled the reply box. Hit post on pump.fun.';
    } catch (e) { callout.status = '!' + e.message; }
    render();
  });
}

// ---------------- Activity + PnL ----------------
const chipFor = (ok, n) => ok === n ? '<span class="badge good">Done</span>' : ok ? '<span class="badge warn">Partial</span>' : '<span class="badge bad">Failed</span>';
function actEntry(e) {
  const open = act.open === e.id;
  let icon, cls, title, sub, amt = '', chip, details = '';
  if (e.kind === 'buy' || e.kind === 'sell') {
    const ok = e.rows.filter(r => r.state === 'bought' || r.state === 'sold');
    const sol = e.kind === 'buy' ? ok.reduce((x, r) => x + Number(r.lamports || 0), 0) / 1e9 : ok.reduce((x, r) => x + Number(r.solChange || 0), 0);
    icon = e.kind === 'buy' ? I.receive : I.send; cls = e.kind;
    title = `${e.kind === 'buy' ? 'Bought' : 'Sold'} ${mintLabel(e.mint)}`;
    sub = `${ago(e.at)} · ${ok.length}/${plural(e.rows.length, 'wallet')}${e.kind === 'sell' && e.pct ? ` · ${e.pct}%` : ''}`;
    amt = ok.length ? `${e.kind === 'buy' ? '−' : '+'}${fmtNum(Math.abs(sol), 4)} SOL` : '';
    chip = chipFor(ok.length, e.rows.length);
    if (open) details = e.rows.map(r => `<div class="drow">${statusDot(r.state)}<span class="grow">${esc(nameOf(r.address))}${r.error ? ` <span style="color:var(--loss)">· ${esc(r.error)}</span>` : ''}</span><span class="num">${e.kind === 'buy' ? (r.lamports ? fromRaw(BigInt(r.lamports), 9) + ' SOL' : '') : r.solChange != null ? '+' + Number(r.solChange).toFixed(4) + ' SOL' : ''}</span>${r.signature ? `<a href="https://solscan.io/tx/${r.signature}" target="_blank" rel="noopener" title="Solscan">${I.ext}</a>` : ''}</div>`).join('')
      + `<div class="drow"><a href="https://pump.fun/coin/${e.mint}" target="_blank" rel="noopener">Open on pump.fun ${I.ext}</a></div>`;
  } else if (e.kind === 'callout') {
    const ok = e.rows.filter(r => r.state === 'posted').length;
    icon = I.callouts; cls = 'callout';
    title = `Callouts on ${mintLabel(e.mint)}`;
    sub = `${ago(e.at)} · ${ok}/${plural(e.rows.length, 'wallet')}`;
    chip = chipFor(ok, e.rows.length);
    if (open) details = e.rows.map(r => `<div class="drow">${statusDot(r.state)}<span class="grow">${esc(nameOf(r.address))}${r.error ? ` <span style="color:var(--loss)">· ${esc(r.error)}</span>` : ''}</span></div>`).join('')
      + `<div class="drow"><a href="https://pump.fun/coin/${e.mint}" target="_blank" rel="noopener">Open on pump.fun ${I.ext}</a></div>`;
  } else {
    const n = e.recipients.length, okN = n - (e.notSent || []).length;
    let each = '';
    try { each = fmtNum(fromRaw(BigInt(e.per), e.decimals ?? 9), 6); } catch {}
    icon = I.send; cls = 'send';
    title = `Sent ${e.label || (e.asset?.kind === 'SOL' ? 'SOL' : 'tokens')}`;
    sub = `${ago(e.at)} · from ${esc(nameOf(e.from))} to ${plural(okN, 'wallet')}`;
    amt = each ? `${each} each` : '';
    chip = chipFor(okN, n);
    if (open) details = e.recipients.map(a => `<div class="drow">${statusDot((e.notSent || []).includes(a) ? 'failed' : 'posted')}<span class="grow">${esc(nameOf(a))}</span><span class="mono muted">${short(a)}</span></div>`).join('')
      + (e.error ? `<div class="drow" style="color:var(--loss)">${esc(e.error)}</div>` : '')
      + (e.signatures || []).map((s, k) => `<div class="drow"><a href="https://solscan.io/tx/${s}" target="_blank" rel="noopener">Transaction ${k + 1} on Solscan ${I.ext}</a></div>`).join('');
  }
  return `<button class="trow ${open ? 'open' : ''}" data-aopen="${e.id}" aria-expanded="${open}"><span class="aico ${cls}">${icon}</span><span class="grow"><span class="name">${esc(title)}</span><span class="sub">${sub}</span></span><span class="right"><span class="v num">${amt}</span>${chip}</span></button>${open ? `<div class="details">${details}</div>` : ''}`;
}

function viewActivity() {
  const v = $('#view');
  const seg = `<div class="seg actseg" style="margin:0 0 12px"><button data-am="activity" class="${act.mode === 'activity' ? 'active' : ''}">Activity</button><button data-am="pnl" class="${act.mode === 'pnl' ? 'active' : ''}">PnL</button></div>`;
  const wireSeg = () => $$('[data-am]').forEach(b => b.onclick = () => { act.mode = b.dataset.am; render(); });
  if (act.mode === 'pnl') { viewPnl(v, seg); wireSeg(); return; }
  if (!act.loaded) { act.loaded = true; loadLogs(); }
  const entries = [
    ...tlog.map(t => ({ ...t, kind: t.side, id: 't' + t.at })),
    ...alog.map(a => ({ ...a, id: a.kind[0] + a.at })),
  ].filter(e => { const mine = new Set(st.wallets.map(w => w.address)); return (e.rows || []).some(r => mine.has(r.address)) || mine.has(e.from); })
   .sort((x, y) => y.at - x.at).slice(0, 60);
  v.innerHTML = `${seg}${jobBanner()}
    <div class="list">${entries.length ? entries.map(actEntry).join('') : '<div class="empty"><b>No activity yet</b>Bundle trades, swaps, callouts and sends show up here.</div>'}</div>`;
  wireSeg(); wireBanner();
  $$('[data-aopen]').forEach(b => b.onclick = () => { act.open = act.open === b.dataset.aopen ? null : b.dataset.aopen; render(); });
}

function viewPnl(v, seg) {
  if (pnl === null) loadPnl();
  if (pnl === 'loading' || pnl === null) { v.innerHTML = seg + '<div class="pnlhero glass"><div class="sk big"></div><div class="sk" style="width:40%;margin-top:10px"></div></div><p class="hint center">Reading your wallets\' trade history. The first time can take up to a minute; after that only new trades are fetched.</p><div class="sk row"></div><div class="sk row"></div>'; return; }
  if (pnl.error) { v.innerHTML = seg + `<div class="note bad"><b>Couldn't load PnL from pump.fun.</b> ${esc(pnl.error)}<div class="actions end"><button class="btn sm" id="rl">Try again</button></div></div>`; on('#rl', 'click', () => loadPnl(true)); return; }
  const t = pnl.totals;
  const open = pnl.positions.filter(x => !x.exited);
  const best = pnl.positions[0], worst = pnl.positions[pnl.positions.length - 1];
  v.innerHTML = `${seg}
    <div class="pnlhero glass">
      <div class="row"><span class="eyebrow" style="color:var(--text-2)">All ${plural(st.wallets.length, 'wallet')} · PnL</span><button class="btn icon ghost" id="rf" title="Refresh" aria-label="Refresh">${I.refresh}</button></div>
      <div class="pnl-big ${tone(t.pnl)} num">${signed(t.pnl)}</div>
      <div class="pnl-sub num">${t.pnlSol != null ? `<b class="${tone(t.pnlSol)}">${t.pnlSol > 0 ? '+' : ''}${fmtNum(t.pnlSol, 2)} SOL</b> · ` : ''}${t.pct == null ? '' : `<span class="${tone(t.pct)}">${t.pct > 0 ? '+' : ''}${t.pct.toFixed(1)}%</span> on `}${fmtUsd(t.bought)} bought${pnl.solPrice ? ` · SOL ${fmtUsd(pnl.solPrice)}` : ''}</div>
      <div class="pnl-grid">
        <div><span class="k">Realized</span><span class="v num ${tone(t.realized)}">${signed(t.realized)}</span></div>
        <div><span class="k">Unrealized</span><span class="v num ${tone(t.unrealized)}">${signed(t.unrealized)}</span></div>
        <div><span class="k">Portfolio</span><span class="v num">${fmtUsd(t.valueUsd)}</span></div>
        <div><span class="k">Positions</span><span class="v num">${t.open} open · ${t.closed} closed</span></div>
        ${t.fees ? `<div><span class="k">Creator fees</span><span class="v num pos">${signed(t.fees)} · ${fmtNum(t.feeSol, 3)} SOL</span></div>` : ''}
      </div>
    </div>
    ${pnl.source === 'chain' ? pnlChartHtml(pnl) : ''}
    ${best && worst && pnl.positions.length > 1 ? `<div class="grid2" style="margin-top:8px">
      <div class="card tight glass"><span class="muted xs">Best</span><div class="name trunc">${esc(best.symbol ? '$' + best.symbol : best.name || short(best.mint))}</div><div class="num pos" style="font-weight:700">${signed(best.pnlUsd)}</div></div>
      <div class="card tight glass"><span class="muted xs">Worst</span><div class="name trunc">${esc(worst.symbol ? '$' + worst.symbol : worst.name || short(worst.mint))}</div><div class="num neg" style="font-weight:700">${signed(worst.pnlUsd)}</div></div>
    </div>` : ''}
    <h3 class="sec">By wallet</h3>
    <div class="list">${pnl.wallets.map(w => { const p = w.realized + w.unrealized; return `
      <div class="item glass">${avatar(walletOf(w.address), 'sm')}<div class="grow"><div class="name">${esc(nameOf(w.address))}${w.error ? '<span class="badge bad">no data</span>' : ''}</div><div class="sub num">${w.valueUsd != null ? fmtUsd(w.valueUsd) + ' · ' : ''}${w.sol != null ? fmtNum(w.sol, 3) + ' SOL · ' : ''}${w.open} open${w.feeSol ? ` · ${fmtNum(w.feeSol, 3)} SOL fees` : ''}</div></div>
        <div class="right"><div class="v num ${tone(p)}">${signed(p)}</div><div class="sub num">${w.bought ? fmtUsd(w.bought) + ' in' : ''}</div></div></div>`; }).join('')}</div>
    ${pnl.source === 'chain' ? `<h3 class="sec">Trades by coin · ${pnl.positions.length}</h3>` : `<h3 class="sec">Open positions · ${open.length}</h3>`}
    <div class="list">${(pnl.source === 'chain' ? pnl.positions : open).length ? (pnl.source === 'chain' ? pnl.positions : open).slice(0, 40).map(x => `
      <div class="item glass"><span class="ico">${esc((x.symbol || x.name || '?').slice(0, 2).toUpperCase())}</span>
        <div class="grow"><div class="name">${esc(x.symbol ? '$' + x.symbol : x.name || short(x.mint))}${pnl.source === 'chain' ? (x.exited ? ' <span class="badge">sold</span>' : ' <span class="badge on">holding</span>') : ''}</div><div class="sub">${esc(nameOf(x.wallet))} · <a href="https://pump.fun/coin/${x.mint}" target="_blank" rel="noopener">pump.fun</a></div></div>
        <div class="right"><div class="v num ${tone(x.pnlUsd)}">${signed(x.pnlUsd)}</div><div class="sub num ${tone(x.pct)}">${x.pct > 0 ? '+' : ''}${x.pct.toFixed(1)}%</div></div></div>`).join('') : '<div class="empty glass">No open positions.</div>'}</div>
    <p class="hint" style="margin-top:10px">${pnl.source === 'chain' ? `From every buy and sell in these wallets' on-chain history${pnl.historyFrom ? ` since ${new Date(pnl.historyFrom).toLocaleDateString()}` : ''}, including sold bags, trades made outside Truth and claimed creator fees (counted as realized profit). Coins bought before that aren't counted. Updated ${ago(pnl.at)}.` : `From pump.fun's position tracking (coins still held only). Use a Helius RPC in Settings to count sold bags too. Updated ${ago(pnl.at)}.`}</p>`;
  on('#rf', 'click', () => loadPnl(true));
  wirePnlChart(pnl);
}

// ---------------- follow each other on pump.fun ----------------
function followCard() {
  if (st.wallets.length < 2) return '';
  const job = st.jobs?.follow;
  if (job) {
    const ok = job.rows.filter(r => r.state === 'posted').length;
    if (!job.done) pollWhileRunning();
    const title = job.kind === 'unfollow' ? (job.done ? `Unfollow ${ok ? 'done' : 'failed'}: ${esc(nameOf(job.rows[0].address))}` : `Unfollowing everyone ${esc(nameOf(job.rows[0].address))} follows…`) : job.done ? `Done: ${ok} of ${job.rows.length} wallets` : job.focus ? 'Following the focus wallets…' : 'Following each other…';
    return `<div class="card" style="margin:0 0 16px">
      <div class="row"><b>${title}</b>${job.done ? '<button class="btn sm" id="fwDone">Close</button>' : '<span class="badge on live"><span class="dot"></span>keep pump.fun open</span>'}</div>
      ${!job.done && job.step ? `<div class="sub" style="margin-top:6px">${esc(job.step)}</div>` : ''}
      <div class="list" style="margin-top:10px">${job.rows.map(r => `<div class="item">${statusDot(r.state)}<div class="grow"><div class="name">${esc(nameOf(r.address))}</div><div class="sub" style="white-space:normal;${r.error || /failed/.test(r.detail || '') ? 'color:var(--loss)' : ''}">${esc(r.error || r.detail || r.state)}</div></div></div>`).join('')}</div>
    </div>`;
  }
  const ready = st.taught.login && st.taught.post;
  const inc = st.wallets.filter(w => !followEx.has(w.address));
  const focusMode = store.get('fwMode', 'all') === 'focus';
  const foc = st.wallets.filter(w => followFocus.has(w.address));
  const picker = (id, n, label, total, extra) => `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">
      <span class="sub">Pick first</span>
      <input id="${id}N" inputmode="numeric" maxlength="3" value="${esc(n)}" aria-label="${label}" style="width:56px">
      <button class="btn sm" id="${id}First">Pick</button>
      ${extra ? `<button class="btn sm ghost" id="${id}All">All</button>` : ''}
      <button class="btn sm ghost" id="${id}None">None</button>
      <span class="sub">${total} of ${st.wallets.length} ticked</span>
    </div>`;
  const list = (attr, isOn) => `<div class="fxlist">${st.wallets.map(w => `<label class="fx"><input type="checkbox" ${attr}="${w.address}" ${isOn(w) ? 'checked' : ''}>${avatar(w, 'sm')}<span class="trunc">${esc(w.name)}</span></label>`).join('')}</div>`;
  // Followers in focus mode: ticked wallets, minus any that would have no one to follow.
  const pairs = focusMode ? inc.filter(w => foc.some(t => t.address !== w.address)).length : inc.length;
  const ext = followExtra.length;
  const pairsX = focusMode ? inc.filter(w => ext || foc.some(t => t.address !== w.address)).length : inc.length;
  const canGo = ready && (focusMode ? (foc.length + ext) >= 1 && pairsX >= 1 : (inc.length >= 2 || (inc.length >= 1 && ext >= 1)));
  const extLabel = ext ? ` + ${plural(ext, 'account')}` : '';
  const goLabel = focusMode
    ? (!(foc.length + ext) ? 'Pick wallets or paste addresses to follow' : !pairsX ? 'Pick wallets to do the following' : `Follow ${foc.length ? plural(foc.length, 'focus wallet') : ''}${foc.length && ext ? ' + ' : ''}${ext ? plural(ext, 'outside account') : ''} · from ${plural(pairsX, 'wallet')}`)
    : (inc.length >= 2 ? `Follow each other${extLabel} · ${plural(inc.length, 'wallet')}` : inc.length >= 1 && ext ? `Follow ${plural(ext, 'account')} · from ${plural(inc.length, 'wallet')}` : 'Tick at least 2 wallets, or paste addresses');
  const extraBox = `<div class="fxextra" style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line)">
      <div class="row" style="align-items:baseline"><b class="grow">Also follow these accounts</b>${ext ? `<button class="btn sm ghost" id="fxtClear">Clear ${ext}</button>` : ''}</div>
      <div class="sub" style="margin-top:4px">Paste wallet addresses or pump.fun profile links, one per line or comma separated. Every ticked wallet follows them. Paste a profile address, not a coin CA.</div>
      <textarea id="fxtIn" rows="4" spellcheck="false" placeholder="7xKX…9fQ2&#10;https://pump.fun/profile/…" style="width:100%;margin-top:10px;font-family:var(--mono);font-size:12.5px">${esc(fxDraft.text)}</textarea>
      <div class="actions" style="margin-top:8px;justify-content:flex-start;gap:8px"><button class="btn sm primary" id="fxtAdd">Add addresses</button>${fxDraft.bad.length ? `<span class="sub" style="color:var(--warn)">Skipped ${plural(fxDraft.bad.length, 'line')} that ${fxDraft.bad.length === 1 ? "isn't" : "aren't"} an address: ${esc(fxDraft.bad.slice(0, 3).join(', '))}${fxDraft.bad.length > 3 ? '…' : ''}</span>` : ''}</div>
      ${ext ? `<div class="fxlist" style="margin-top:10px">${followExtra.map(a => `<span class="fx" style="justify-content:space-between">${avatarFor(a, a.slice(0, 2))}<span class="mono trunc grow">${esc(short(a))}</span><button class="btn icon ghost" data-fxrm="${a}" aria-label="Remove ${esc(a)}" title="Remove">${I.x}</button></span>`).join('')}</div>` : ''}
    </div>`;
  return `<div class="card" style="margin:0 0 16px">
    <b>Follow on pump.fun</b>
    <div class="seg"><button data-fwmode="all" class="${focusMode ? '' : 'active'}">All follow all</button><button data-fwmode="focus" class="${focusMode ? 'active' : ''}">All follow a few</button></div>
    ${focusMode ? `
    <div style="margin-top:14px"><b>1. Get followed</b><div class="sub" style="margin-top:4px">The focus wallets. Every follower below follows all of these.</div></div>
    ${picker('ff', store.get('ffN', 20), 'How many focus wallets to pick', foc.length, false)}
    ${list('data-ff', w => followFocus.has(w.address))}
    <div style="margin-top:16px"><b>2. Do the following</b><div class="sub" style="margin-top:4px">These wallets sign in and follow the focus wallets. Truth remembers your picks.</div></div>
    ${picker('fx', store.get('fxN', st.wallets.length), 'How many followers to pick', inc.length, true)}
    ${list('data-fx', w => !followEx.has(w.address))}`
    : `<div class="sub" style="margin-top:8px">Ticked wallets all follow each other. Untick any you want left out: they won't follow or be followed. Truth remembers your picks.</div>
    ${picker('fx', store.get('fxN', 10), 'How many wallets to pick', inc.length, true)}
    ${list('data-fx', w => !followEx.has(w.address))}`}
    ${extraBox}
    ${ready ? '' : '<p class="hint" style="margin-bottom:0">Connect the pump.fun login in the Callouts tab first.</p>'}
    <p class="err" id="fwErr"></p>
    <div class="actions" style="margin-top:10px"><button class="btn primary" id="fwGo" ${canGo ? '' : 'disabled'}>${goLabel}</button></div>
    <p class="hint" style="margin-bottom:0">Open Truth from a pump.fun tab and keep that tab open until it finishes.</p>
  </div>`;
}
function wireFollow() {
  $$('[data-fx]').forEach(cb => cb.onchange = () => { cb.checked ? followEx.delete(cb.dataset.fx) : followEx.add(cb.dataset.fx); saveFollowEx(); render(); });
  $$('[data-ff]').forEach(cb => cb.onchange = () => { cb.checked ? followFocus.add(cb.dataset.ff) : followFocus.delete(cb.dataset.ff); saveFollowFocus(); render(); });
  $$('[data-fwmode]').forEach(b => b.onclick = () => { store.set('fwMode', b.dataset.fwmode); render(); });
  on('#fxtIn', 'input', (e) => { fxDraft.text = e.target.value; });
  on('#fxtAdd', 'click', () => {
    const { good, bad, mine } = parseAddrList($('#fxtIn')?.value || fxDraft.text);
    const before = followExtra.length;
    followExtra = [...new Set([...followExtra, ...good])].slice(0, 500);
    saveFollowExtra();
    fxDraft.text = ''; fxDraft.bad = bad;
    const added = followExtra.length - before;
    toast(added ? `Added ${plural(added, 'address', 'addresses')}${mine.length ? ` · ${mine.length} already in Truth` : ''}` : mine.length ? 'Those are already wallets in Truth' : 'No new addresses found');
    render();
  });
  on('#fxtClear', 'click', () => { followExtra = []; saveFollowExtra(); fxDraft.bad = []; render(); });
  $$('[data-fxrm]').forEach(b => b.onclick = () => { followExtra = followExtra.filter(a => a !== b.dataset.fxrm); saveFollowExtra(); render(); });
  // Quick picks: tick only the first N wallets (in list order), all of them, or none.
  const pickFirst = (n) => { followEx.clear(); st.wallets.forEach((w, i) => { if (i >= n) followEx.add(w.address); }); saveFollowEx(); render(); };
  const pickFocus = (n) => { followFocus = new Set(st.wallets.slice(0, n).map(w => w.address)); saveFollowFocus(); render(); };
  const wirePicker = (id, min, apply) => {
    on(`#${id}First`, 'click', () => {
      const n = parseInt($(`#${id}N`).value, 10);
      if (!(n >= min)) { const el = $('#fwErr'); if (el) el.textContent = `Pick at least ${min} wallet${min > 1 ? 's' : ''}`; $(`#${id}N`).focus(); return; }
      store.set(`${id}N`, n); apply(n);
    });
    on(`#${id}N`, 'keydown', (e) => { if (e.key === 'Enter') $(`#${id}First`).click(); });
    on(`#${id}All`, 'click', () => apply(st.wallets.length));
    on(`#${id}None`, 'click', () => apply(0));
  };
  wirePicker('fx', store.get('fwMode', 'all') === 'focus' ? 1 : 2, pickFirst);
  wirePicker('ff', 1, pickFocus);
  $$('[data-unf]').forEach(b => b.onclick = () => { wal.unfollowing = b.dataset.unf; wal.renaming = wal.removing = wal.moving = null; render(); });
  on('#unfCancel', 'click', () => { wal.unfollowing = null; render(); });
  on('#unfGo', 'click', async () => {
    const b = $('#unfGo'); b.disabled = true;
    try {
      const t = await activeTab();
      if (!t?.url || !/^https:\/\/([a-z0-9-]+\.)*pump\.fun\//.test(t.url)) throw new Error('This runs on a pump.fun tab, so it needs the Truth extension. The website handles buys, sells, sends and holdings.');
      await send({ type: 'unfollowRun', tabId: t.id, address: wal.unfollowing });
      wal.unfollowing = null; await refresh();
      $('#view')?.scrollTo({ top: 0 });
    } catch (e) { b.disabled = false; const el = $('#unfErr'); if (el) el.textContent = e.message; }
  });
  on('#fwDone', 'click', async () => { st = await send({ type: 'clearJob', kind: 'follow' }); render(); });
  on('#fwGo', 'click', async () => {
    const b = $('#fwGo'); b.disabled = true;
    try {
      const t = await activeTab();
      if (!t?.url || !/^https:\/\/([a-z0-9-]+\.)*pump\.fun\//.test(t.url)) throw new Error('This runs on a pump.fun tab, so it needs the Truth extension. The website handles buys, sells, sends and holdings.');
      const focusMode = store.get('fwMode', 'all') === 'focus';
      await send({ type: 'followRun', tabId: t.id, addresses: st.wallets.filter(w => !followEx.has(w.address)).map(w => w.address), ...(focusMode ? { targets: st.wallets.filter(w => followFocus.has(w.address)).map(w => w.address) } : {}), extra: followExtra });
      await refresh();
    } catch (e) { b.disabled = false; const el = $('#fwErr'); if (el) el.textContent = e.message; }
  });
}

// ---------------- groups ----------------
function renderEmptyGroup() {
  const g = activeGroup();
  root.innerHTML = header() + `<main id="view" class="view">
    <div class="empty" style="margin-top:24px"><b>${esc(g.name)} has no wallets yet</b>Add wallets to this group, or move some in from another group on the Wallets page.
      <div class="actions col" style="margin-top:16px">
        <button class="btn primary" id="egAdd">${I.plus} Add wallet</button>
        <button class="btn" id="egSwitch">Switch group</button>
        ${st.groups?.length > 1 ? '<button class="btn danger" id="egDel">Delete this group</button>' : ''}
      </div></div></main>`;
  wireShell();
  on('#egAdd', 'click', () => openAdd());
  on('#egSwitch', 'click', () => openSheet('accounts'));
  on('#egDel', 'click', async () => { try { st = await send({ type: 'groupDelete', id: g.id }); afterGroupChange(); toast(`Deleted ${g.name}`); render(); } catch (e) { toast(e.message); } });
}
function groupBar() {
  const g = activeGroup();
  if (grp.renaming) return `<div class="card tight" style="margin:0 0 12px"><span class="label">Rename group</span>
    <div style="display:flex;gap:8px;margin-top:6px"><input id="gName" value="${esc(g.name)}" maxlength="30" aria-label="Group name"><button class="btn sm primary" id="gSave">Save</button><button class="btn sm ghost" id="gCancel">Cancel</button></div><p class="err" id="gErr"></p></div>`;
  return `<div class="card tight" style="margin:0 0 12px"><div class="row"><div class="grow"><span class="label">Group</span><div class="name">${esc(g.name)}</div></div>
    <span class="inline"><button class="link muted" id="gRename">Rename</button><span class="muted">·</span><button class="link" id="gSwitch">Switch or make a group</button></span></div></div>`;
}
function wireGroupBar() {
  on('#gRename', 'click', () => { grp.renaming = true; render(); $('#gName')?.select(); });
  on('#gCancel', 'click', () => { grp.renaming = false; render(); });
  on('#gSwitch', 'click', () => openSheet('accounts'));
  const save = async () => { try { st = await send({ type: 'groupRename', id: st.activeGroup, name: $('#gName').value }); grp.renaming = false; toast('Group renamed'); render(); } catch (e) { $('#gErr').textContent = e.message; } };
  on('#gSave', 'click', save); enterTo('#gName', save);
}

// ---------------- Wallets: select several and remove ----------------
function viewWalletsSelect(v, holds) {
  const n = wal.sel.size;
  const picked = st.wallets.filter(w => wal.sel.has(w.address));
  const funded = picked.filter(w => holds(w.address));
  const unknown = !portReady();
  if (wal.confirm && n) {
    v.innerHTML = `
      <button class="link muted" id="rmBack">${I.back} Back to selection</button>
      <h2 style="margin-top:8px">Remove ${plural(n, 'wallet')}?</h2>
      <div class="list">${picked.map(w => `<div class="item">${avatar(w, 'sm')}<div class="grow"><div class="name">${esc(w.name)}</div><div class="sub mono">${short(w.address)}</div></div>${holds(w.address) ? '<span class="badge warn">has funds</span>' : ''}</div>`).join('')}</div>
      ${funded.length ? `<div class="note warn"><b>${plural(funded.length, 'wallet')} still ${funded.length === 1 ? 'holds' : 'hold'} SOL or coins:</b> ${funded.map(w => esc(w.name)).join(', ')}. Removing only deletes them from Truth. Without their private keys you lose those funds.</div>`
        : unknown ? '<div class="note warn">Truth couldn\'t check balances right now. Make sure none of these hold funds, or that you saved their keys.</div>'
        : '<div class="note ok">None of these hold SOL or coins.</div>'}
      <label class="field"><span class="lbl">Truth password</span><input id="rmManyPw" type="password" autocomplete="current-password"></label>
      <p class="err" id="rmManyErr"></p>
      <div class="actions"><button class="btn" id="rmCancel2">Cancel</button><button class="btn danger" id="rmManyGo">Remove ${plural(n, 'wallet')}</button></div>`;
    on('#rmBack', 'click', () => { wal.confirm = false; render(); });
    on('#rmCancel2', 'click', () => { wal.confirm = false; render(); });
    const go = async () => {
      const b = $('#rmManyGo'); b.disabled = true;
      try {
        const r = await send({ type: 'removeWallets', addresses: [...wal.sel], password: $('#rmManyPw').value });
        st = r; toast(`Removed ${plural(r.removed, 'wallet')}`);
        wal.select = false; wal.confirm = false; wal.sel = new Set();
        trade.picked = null; split.picked = null; resetData(); render();
      } catch (e) { b.disabled = false; $('#rmManyErr').textContent = e.message; }
    };
    on('#rmManyGo', 'click', go); enterTo('#rmManyPw', go);
    setTimeout(() => $('#rmManyPw')?.focus(), 0);
    return;
  }
  const empties = portReady() ? st.wallets.filter(w => holds(w.address) === false) : [];
  v.innerHTML = `
    <div class="row" style="margin-bottom:8px"><span class="muted small">${n ? `${n} selected` : 'Pick wallets to remove'}</span>
      <span class="inline"><button class="link muted" id="selAll">All</button><span class="muted">·</span><button class="link muted" id="selNone">None</button><span class="muted">·</span><button class="link" id="selEmpty" ${portReady() ? '' : 'disabled'}>Empty ones (${empties.length})</button></span></div>
    <div class="list">${st.wallets.map(w => { const on = wal.sel.has(w.address), h = holds(w.address), x = portReady() ? port.wallets.find(r => r.address === w.address) : null; return `
      <label class="item ${on ? 'selected' : ''}"><input type="checkbox" data-rmsel="${w.address}" ${on ? 'checked' : ''}>${avatar(w, 'sm')}
        <div class="grow"><div class="name">${esc(w.name)}${w.address === st.selected ? '<span class="badge on">active</span>' : ''}</div><div class="sub"><span class="mono">${short(w.address)}</span>${x ? ` · ${fmtNum(x.sol, 3)} SOL${x.coinCount ? ` · ${plural(x.coinCount, 'coin')}` : ''}` : ''}</div></div>
        ${h ? '<span class="badge warn">has funds</span>' : h === false ? '<span class="badge">empty</span>' : ''}</label>`; }).join('')}</div>
    <div class="actions"><button class="btn" id="selCancel">Cancel</button><button class="btn danger" id="selRemove" ${n ? '' : 'disabled'}>Remove ${n ? plural(n, 'wallet') : ''}</button></div>`;
  if (port === null) loadPort();
  $$('[data-rmsel]').forEach(cb => cb.onchange = () => { cb.checked ? wal.sel.add(cb.dataset.rmsel) : wal.sel.delete(cb.dataset.rmsel); render(); });
  on('#selAll', 'click', () => { wal.sel = new Set(st.wallets.map(w => w.address)); render(); });
  on('#selNone', 'click', () => { wal.sel = new Set(); render(); });
  on('#selEmpty', 'click', () => { wal.sel = new Set(empties.map(w => w.address)); render(); });
  on('#selCancel', 'click', () => { wal.select = false; wal.sel = new Set(); render(); });
  on('#selRemove', 'click', () => { wal.confirm = true; render(); });
}

// ---------------- Wallets (page) ----------------
function viewWallets() {
  const v = $('#view');
  if (pnl === null) loadPnl();
  if (port === null) loadPort();
  const pw = (addr) => pnlReady() ? pnl.wallets.find(x => x.address === addr) : null;
  const pnlCell = (addr) => {
    if (pnl === 'loading' || pnl === null) return '<div class="pnlcell"><span class="sk inline" style="width:48px"></span></div>';
    const w = pw(addr); if (!w || w.error) return '<div class="pnlcell"><span class="muted xs">no PnL data</span></div>';
    const t = w.realized + w.unrealized;
    return `<div class="pnlcell"><div class="v num ${tone(t)}">${signed(t)}</div><div class="sub num">${w.open ? `${w.open} open` : 'PnL'}</div></div>`;
  };
  const holds = (a) => { const x = portReady() ? port.wallets.find(r => r.address === a) : null; return x ? (x.sol > 0.0005 || x.coinCount > 0) : null; };
  wal.sel = new Set([...wal.sel].filter(a => walletOf(a)));
  if (wal.select) return viewWalletsSelect(v, holds);
  const rows = st.wallets.map(w => {
    if (wal.renaming === w.address) return `
      <div class="item col">
        <div class="row"><span class="inline">${avatar(w, 'sm')}<span class="mono muted">${short(w.address)}</span></span></div>
        <div class="with" style="display:flex;gap:8px"><input id="rn" value="${esc(w.name)}" maxlength="40" aria-label="New name"><button class="btn sm primary" id="rnSave">Save</button><button class="btn sm ghost" id="rnCancel">Cancel</button></div>
      </div>`;
    if (wal.moving === w.address) return `
      <div class="item col">
        <div class="row"><span class="inline">${avatar(w, 'sm')}<b>Move ${esc(w.name)}</b></span></div>
        <div style="display:flex;gap:8px"><select id="mvTo" aria-label="Move to group">${st.groups.filter(g => g.id !== st.activeGroup).map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select><button class="btn sm primary" id="mvGo">Move</button><button class="btn sm ghost" id="mvCancel">Cancel</button></div>
      </div>`;
    if (wal.unfollowing === w.address) return `
      <div class="item col">
        <div><b>Unfollow everyone ${esc(w.name)} follows?</b><div class="sub">Truth signs in as ${esc(w.name)} on pump.fun and unfollows every account it follows, including your other wallets. Keep the pump.fun tab open.</div></div>
        <div style="display:flex;gap:8px"><button class="btn sm danger" id="unfGo">Unfollow all</button><button class="btn sm ghost" id="unfCancel">Cancel</button></div>
        <p class="err" id="unfErr"></p>
      </div>`;
    if (wal.removing === w.address) return `
      <div class="item col" style="border-color:var(--loss-line)">
        <div><b>Remove ${esc(w.name)}?</b><div class="sub">Make sure its private key is saved somewhere else. Enter your Truth password to confirm.</div></div>
        <div style="display:flex;gap:8px"><input id="rmPw" type="password" placeholder="Truth password" autocomplete="current-password"><button class="btn sm danger" id="rmGo">Remove</button><button class="btn sm ghost" id="rmCancel">Keep</button></div>
        <p class="err" id="rmErr"></p>
      </div>`;
    const x = portReady() ? port.wallets.find(r => r.address === w.address) : null;
    const active = w.address === st.selected;
    return `
      <div class="item wrow ${active ? 'selected' : ''}">${avatar(w)}
        <div class="grow"><div class="name">${esc(w.name)}${active ? '<span class="badge on">active</span>' : ''}</div><div class="sub"><span class="mono">${short(w.address)}</span>${x ? ` · ${fmtNum(x.sol, 3)} SOL` : ''}</div>
          <div class="wacts">${!active || isAll() ? `<button class="link" data-use="${w.address}">Use</button>` : ''}<button class="link muted" data-copy="${w.address}">Copy</button><button class="link muted" data-rename="${w.address}">Rename</button><button class="link muted" data-unf="${w.address}">Unfollow all</button>${st.groups?.length > 1 ? `<button class="link muted" data-move="${w.address}">Move</button>` : ''}<button class="link danger" data-remove="${w.address}">Remove</button></div>
        </div>
        ${pnlCell(w.address)}
      </div>`;
  }).join('');
  const T = pnlReady() ? pnl.totals : null;
  v.innerHTML = groupBar() + `
    <div class="row" style="margin-bottom:8px"><span class="muted small">${plural(st.wallets.length, 'wallet')}</span><span class="inline">${T ? `<span class="badge ${T.pnl > 0 ? 'good' : T.pnl < 0 ? 'bad' : ''} num">${signed(T.pnl)} total</span>` : ''}${st.wallets.length > 1 ? `<button class="btn sm ghost" id="sweepBtn">${I.sweep} Sweep SOL</button>` : ''}<button class="btn sm ghost" id="selMode">Select</button><button class="btn icon ghost" id="pnlrf" title="Refresh" aria-label="Refresh">${I.refresh}</button></span></div>
    <div class="list">${rows}</div>
    <p class="hint">Friends' addresses (for sending) are in Settings. Only add wallets whose owners agreed. Keys are encrypted with your password and never leave this browser.</p>`;
  on('#pnlrf', 'click', () => { loadPnl(true); loadPort(true); });
  wireGroupBar();
  $$('[data-move]').forEach(b => b.onclick = () => { wal.moving = b.dataset.move; wal.renaming = wal.removing = null; render(); });
  on('#mvCancel', 'click', () => { wal.moving = null; render(); });
  on('#mvGo', 'click', async () => {
    const to = $('#mvTo').value, a = wal.moving, nm = nameOf(a);
    try { st = await send({ type: 'walletMove', address: a, group: to }); wal.moving = null; afterGroupChange(); toast(`Moved ${nm} to ${st.groups.find(g => g.id === to)?.name}`); render(); }
    catch (e) { toast(e.message); }
  });
  on('#sweepBtn', 'click', () => openSweep());
  on('#selMode', 'click', () => { wal.select = true; wal.sel = new Set(); wal.confirm = false; wal.renaming = wal.removing = null; render(); });
  wireFollow();
  $$('[data-copy]').forEach(b => b.onclick = () => copy(b.dataset.copy, 'Address copied'));
  $$('[data-use]').forEach(b => b.onclick = async () => { ui.all = false; store.set('all', false); await send({ type: 'select', address: b.dataset.use }); split.picked = null; split.asset = null; toast(`Using ${nameOf(b.dataset.use)}`); await refresh(); });
  $$('[data-rename]').forEach(b => b.onclick = () => { wal.renaming = b.dataset.rename; wal.removing = null; render(); $('#rn')?.select(); });
  $$('[data-remove]').forEach(b => b.onclick = () => { wal.removing = b.dataset.remove; wal.renaming = null; render(); $('#rmPw')?.focus(); });
  const rnSave = async () => {
    try { st = await send({ type: 'renameWallet', address: wal.renaming, name: $('#rn').value }); wal.renaming = null; toast('Renamed'); render(); }
    catch (e) { toast(e.message); }
  };
  on('#rnSave', 'click', rnSave); enterTo('#rn', rnSave);
  on('#rnCancel', 'click', () => { wal.renaming = null; render(); });
  const rmGo = async () => {
    const addr = wal.removing;
    try { st = await send({ type: 'removeWallet', address: addr, password: $('#rmPw').value }); wal.removing = null; trade.picked = null; split.picked = null; resetData(); toast('Wallet removed'); render(); }
    catch (e) { $('#rmErr').textContent = e.message; }
  };
  on('#rmGo', 'click', rmGo); enterTo('#rmPw', rmGo);
  on('#rmCancel', 'click', () => { wal.removing = null; render(); });
}

// ---------------- Settings (page) ----------------
function viewSettings() {
  const v = $('#view');
  const s = st.settings;
  v.innerHTML = `
    <button class="row-btn" id="toWallets"><span class="aico">${I.wallets}</span><span class="grow"><span class="name">Wallets</span><span class="sub">${plural(st.wallets.length, 'wallet')} · add, rename, remove</span></span><span class="chev">${I.right}</span></button>

    <button class="row-btn" id="toTpls" style="margin-top:8px"><span class="aico">${I.callouts}</span><span class="grow"><span class="name">Callout templates</span><span class="sub">Saved callouts for each wallet</span></span><span class="chev">${I.right}</span></button>

    <h3 class="sec">Network</h3>
    <label class="field" style="margin-top:0"><span class="lbl">RPC URL</span><input id="rpc" value="${esc(s.rpc)}" spellcheck="false" placeholder="https://…"></label>
    <p class="hint">The public RPC is slow and rate-limited. A free Helius key (helius.dev) is faster, shows token names and turns on full PnL.</p>
    <div class="grid2">
      <label class="field"><span class="lbl">Auto-lock (minutes)</span><input id="lockm" inputmode="numeric" value="${esc(s.autoLockMinutes)}"></label>
      <label class="field"><span class="lbl">Send fee (µlam/CU)</span><input id="prio" inputmode="numeric" value="${esc(s.priorityMicroLamports)}"></label>
    </div>
    <label class="field"><span class="lbl">RPC requests per second</span><input id="rps" inputmode="numeric" value="${esc(s.rpcRps ?? 8)}"></label>
    <p class="hint">How fast Truth loads all your wallets. Free Helius: 8. Helius Developer or other paid plans: 40–50. Too high and the RPC starts refusing requests.</p>
    <label class="check"><input type="checkbox" id="photo" ${s.showBackground ? 'checked' : ''}> Show the background photo</label>
    <label class="field"><span class="lbl">Background visibility · <span id="pvisv">${esc(s.photoVis ?? 60)}%</span></span><input type="range" id="pvis" min="0" max="100" step="5" value="${esc(s.photoVis ?? 60)}"></label>

    <h3 class="sec">Trading</h3>
    <label class="field" style="margin-top:0"><span class="lbl">Route</span><select id="route">
      <option value="auto" ${s.buyRoute === 'auto' ? 'selected' : ''}>Auto: Jupiter, then PumpPortal</option>
      <option value="jupiter" ${s.buyRoute === 'jupiter' ? 'selected' : ''}>Jupiter only (no extra fee)</option>
      <option value="pumpportal" ${s.buyRoute === 'pumpportal' ? 'selected' : ''}>PumpPortal only (best for brand-new coins, small fee)</option>
    </select></label>
    <div class="grid2">
      <label class="field"><span class="lbl">Slippage %</span><input id="slip" inputmode="decimal" value="${esc(s.slippagePct)}"></label>
      <label class="field"><span class="lbl">Priority fee (SOL)</span><input id="bprio" inputmode="decimal" value="${esc(s.buyPriorityFeeSol)}"></label>
    </div>
    <label class="field"><span class="lbl">Jupiter API key (optional)</span><input id="jkey" type="password" value="${esc(s.jupKey)}" autocomplete="off"></label>

    <h3 class="sec">Callouts</h3>
    <label class="field" style="margin-top:0"><span class="lbl">Template <span class="muted xs">{name} {ticker} {ca} {link}</span></span><textarea id="tpl" rows="3">${esc(s.template)}</textarea></label>
    <div class="grid2">
      <label class="field"><span class="lbl">Seconds between callouts</span><input id="tdelay" inputmode="numeric" value="${esc(s.thesisDelaySec)}"></label>
      <label class="check" style="margin-top:30px"><input type="checkbox" id="autosub" ${s.autoSubmit ? 'checked' : ''}> Quick reply posts</label>
    </div>
    <div class="card tight" style="margin-top:12px">
      <div class="row"><b>pump.fun login</b><span class="inline"><span class="badge ${st.taught.login ? 'good' : ''}">sign-in ${st.taught.login ? '✓' : '–'}</span><span class="badge ${st.taught.post ? 'good' : ''}">post ${st.taught.post ? '✓' : '–'}</span></span></div>
      ${st.taught.loginMessage ? `<pre class="msg">${esc(st.taught.loginMessage)}</pre><p class="hint">Sign-in: ${st.taught.loginSteps} request(s) via ${esc(st.taught.loginHosts.join(', '))}${st.taught.postHost ? ` · posts to ${esc(st.taught.postHost)}` : ''}</p>` : '<p class="hint">Set up from the Callouts tab the first time you use it.</p>'}
      ${st.taught.login || st.taught.post ? '<div class="actions end"><button class="btn sm" id="dump">Copy details</button><button class="btn sm" id="forget">Forget &amp; re-teach</button></div><pre class="msg" id="dumpOut" style="display:none"></pre>' : ''}
    </div>

    <p class="ok" id="saved"></p><p class="err" id="serr"></p>
    <div class="actions"><button class="btn primary" id="save">Save settings</button></div>

    <h3 class="sec">Friends' wallets</h3>
    <p class="hint" style="margin-top:0">Addresses only. Friends never share keys. They show up as people to send to.</p>
    <div class="list">${st.friends.length ? st.friends.map((f, i) => `
      <div class="item">${avatarFor(f.address, f.label, 'sm')}<div class="grow"><div class="name">${esc(f.label)}</div><div class="sub mono">${short(f.address)}</div></div>
        <button class="btn icon danger" data-del="${i}" title="Remove" aria-label="Remove ${esc(f.label)}">${I.x}</button></div>`).join('') : '<div class="empty">No friends added yet.</div>'}</div>
    <div class="grid2" style="margin-top:8px"><input id="flabel" placeholder="Name" aria-label="Friend's name"><input id="faddr" class="mono" placeholder="Wallet address" aria-label="Friend's wallet address" spellcheck="false"></div>
    <p class="err" id="ferr"></p>
    <div class="actions end"><button class="btn sm" id="fadd">Add friend</button></div>

    <h3 class="sec">Connected sites</h3>
    <div class="card tight"><div class="row"><span class="dim small">${st.connected.length ? st.connected.map(esc).join(', ') : 'None'}</span>${st.connected.length ? '<button class="btn sm" id="disc">Disconnect all</button>' : ''}</div></div>
    <p class="hint center" style="margin-top:16px">Truth v${esc(chrome.runtime.getManifest().version)}</p>`;

  on('#toWallets', 'click', () => go({ page: 'wallets' }));
  on('#toTpls', 'click', () => { tplOwner.who = 'shared'; tplEdit = null; go({ page: 'templates' }); });
  const fadd = async () => {
    const label = $('#flabel').value.trim(), address = $('#faddr').value.trim();
    if (!label) return $('#ferr').textContent = 'Give them a name';
    if (!isAddress(address)) return $('#ferr').textContent = "That isn't a valid Solana address";
    if (st.friends.some(f => f.address === address)) return $('#ferr').textContent = 'Already added';
    st = await send({ type: 'saveFriends', friends: [...st.friends, { label, address }] });
    toast('Friend added'); render();
  };
  on('#fadd', 'click', fadd); enterTo('#faddr', fadd); enterTo('#flabel', () => $('#faddr').focus());
  $$('[data-del]').forEach(b => b.onclick = async () => { st = await send({ type: 'saveFriends', friends: st.friends.filter((_, i) => i !== Number(b.dataset.del)) }); render(); });
  on('#save', 'click', async () => {
    $('#serr').textContent = ''; $('#saved').textContent = '';
    const rpc = $('#rpc').value.trim();
    let origin;
    try { const u = new URL(rpc); if (u.protocol !== 'https:') throw 0; origin = u.origin; } catch { return $('#serr').textContent = 'RPC URL must start with https://'; }
    try {
      const pattern = origin + '/*';
      const has = await chrome.permissions.contains({ origins: [pattern] });
      if (!has && !(await chrome.permissions.request({ origins: [pattern] }))) return $('#serr').textContent = 'Chrome needs permission to reach that RPC host. Allow it to use this URL.';
    } catch (e) { /* host already covered by the manifest */ }
    st = await send({ type: 'saveSettings', settings: {
      rpc, template: $('#tpl').value,
      priorityMicroLamports: Math.max(0, parseInt($('#prio').value, 10) || 0),
      autoLockMinutes: Math.max(1, parseInt($('#lockm').value, 10) || 15),
      rpcRps: Math.min(200, Math.max(1, parseInt($('#rps').value, 10) || 8)),
      showBackground: $('#photo').checked,
      photoVis: Math.min(100, Math.max(0, parseInt($('#pvis').value, 10) || 0)),
      autoSubmit: $('#autosub').checked,
      thesisDelaySec: Math.max(0, parseInt($('#tdelay').value, 10) || 0),
      buyRoute: $('#route').value,
      slippagePct: Math.min(100, Math.max(0.1, parseFloat($('#slip').value) || 15)),
      buyPriorityFeeSol: Math.min(0.1, Math.max(0, parseFloat($('#bprio').value) || 0)),
      jupKey: $('#jkey').value.trim(),
    } });
    resetData(); callout.autoSubmit = null;
    render(); toast('Settings saved');
  });
  // Live preview while dragging; saved with the rest of Settings.
  on('#pvis', 'input', (e) => { $('#pvisv').textContent = e.target.value + '%'; st.settings.photoVis = Number(e.target.value); applyTheme(); });
  on('#forget', 'click', async () => { st = await send({ type: 'forgetTeach' }); render(); });
  on('#dump', 'click', async () => { const d = await send({ type: 'teachDump' }); const o = $('#dumpOut'); o.textContent = d; o.style.display = 'block'; copy(d, 'Details copied. Paste them to Claude'); });
  on('#disc', 'click', async () => { st = await send({ type: 'disconnectAll' }); toast('Disconnected'); render(); });
}

// ---------------- PnL chart: realized profit (sells + creator fees) over time, in SOL ----------------
let chartRange = (() => { try { return localStorage.getItem('pnlRange') || '7d'; } catch { return '7d'; } })();
const RANGES = [['24h', '24H', 864e5], ['7d', '7D', 6048e5], ['30d', '30D', 2592e6], ['all', 'All', Infinity]];
function chartPoints(pnl) {
  const all = pnl.series || [];
  const span = RANGES.find(r => r[0] === chartRange)?.[2] ?? Infinity;
  const now = Date.now(), start = span === Infinity ? (all[0]?.[0] ?? now - 864e5) : now - span;
  let base = 0; for (const [t, v] of all) { if (t < start) base = v; else break; }
  const pts = [[start, 0], ...all.filter(([t]) => t >= start).map(([t, v]) => [t, v - base])];
  pts.push([now, pts[pts.length - 1][1]]);
  return { pts, start, now };
}
function pnlChartHtml(pnl) {
  const W = 320, H = 132, PL = 4, PR = 4, PT = 10, PB = 18;
  const { pts, start, now } = chartPoints(pnl);
  const vals = pts.map(p => p[1]);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * .12; hi += pad; lo -= pad;
  const x = (t) => PL + (t - start) / Math.max(1, now - start) * (W - PL - PR);
  const y = (v) => PT + (hi - v) / (hi - lo) * (H - PT - PB);
  // step line: profit jumps at each sell / fee claim
  let d = `M${x(pts[0][0]).toFixed(1)},${y(pts[0][1]).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += `H${x(pts[i][0]).toFixed(1)}V${y(pts[i][1]).toFixed(1)}`;
  const area = `${d}V${y(0).toFixed(1)}H${x(pts[0][0]).toFixed(1)}Z`;
  const last = vals[vals.length - 1];
  const fmtD = (t) => chartRange === '24h' ? new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const empty = !(pnl.series || []).length;
  return `<div class="card glass pnlchart" style="margin-top:8px">
    <div class="row"><div><span class="muted xs">Realized profit · ${esc(RANGES.find(r => r[0] === chartRange)[1])}</span>
      <div class="num ${tone(last)}" style="font-weight:800;font-size:18px" id="pcVal">${last > 0 ? '+' : last < 0 ? '−' : ''}${fmtNum(Math.abs(last), 3)} SOL</div>
      <div class="muted xs" id="pcWhen">${pnl.solPrice ? signed(last * pnl.solPrice) : ''}</div></div>
      <div class="seg sm" role="group" aria-label="Time range">${RANGES.map(([k, l]) => `<button class="${k === chartRange ? 'active' : ''}" data-pcr="${k}" aria-pressed="${k === chartRange}">${l}</button>`).join('')}</div></div>
    ${empty ? '<p class="hint" style="margin:10px 0 0">No sells or fee claims in your history yet.</p>' : `
    <svg id="pcSvg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block;margin-top:6px;touch-action:none" role="img" aria-label="Realized profit over time">
      <path d="${area}" fill="var(--accent)" fill-opacity=".14"/>
      <line x1="${PL}" x2="${W - PR}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="var(--muted)" stroke-opacity=".5" stroke-dasharray="3 3"/>
      <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
      <line id="pcX" y1="${PT}" y2="${H - PB}" stroke="var(--text-2)" stroke-opacity=".6" visibility="hidden"/>
      <circle id="pcDot" r="4" fill="var(--accent)" stroke="var(--bg)" stroke-width="2" visibility="hidden"/>
      <text x="${PL}" y="${H - 4}" fill="var(--muted)" font-size="10">${esc(fmtD(start))}</text>
      <text x="${W - PR}" y="${H - 4}" fill="var(--muted)" font-size="10" text-anchor="end">Now</text>
      <rect x="0" y="0" width="${W}" height="${H}" fill="transparent" id="pcHit"/>
    </svg>`}
  </div>`;
}
function wirePnlChart(pnl) {
  $$('[data-pcr]').forEach(b => b.onclick = () => { chartRange = b.dataset.pcr; try { localStorage.setItem('pnlRange', chartRange); } catch {} render(); });
  const svg = $('#pcSvg'); if (!svg) return;
  const W = 320, H = 132, PL = 4, PR = 4, PT = 10, PB = 18;
  const { pts, start, now } = chartPoints(pnl);
  const vals = pts.map(p => p[1]);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * .12; hi += pad; lo -= pad;
  const x = (t) => PL + (t - start) / Math.max(1, now - start) * (W - PL - PR);
  const y = (v) => PT + (hi - v) / (hi - lo) * (H - PT - PB);
  const valEl = $('#pcVal'), whenEl = $('#pcWhen'), line = $('#pcX'), dot = $('#pcDot');
  const last = vals[vals.length - 1];
  const show = (v, t, live) => {
    valEl.textContent = `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v), 3)} SOL`; valEl.className = 'num ' + tone(v);
    whenEl.textContent = live ? (pnl.solPrice ? signed(v * pnl.solPrice) : '') : new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + (pnl.solPrice ? ' · ' + signed(v * pnl.solPrice) : '');
  };
  const move = (ev) => {
    const r = svg.getBoundingClientRect(); const px = (ev.clientX - r.left) / r.width * W;
    const t = start + (px - PL) / (W - PL - PR) * (now - start);
    let v = 0; for (const p of pts) { if (p[0] <= t) v = p[1]; else break; }
    const cx = Math.max(PL, Math.min(W - PR, px));
    line.setAttribute('x1', cx); line.setAttribute('x2', cx); line.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', y(v)); dot.setAttribute('visibility', 'visible');
    show(v, Math.min(now, Math.max(start, t)), false);
  };
  const leave = () => { line.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); show(last, now, true); };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move); svg.addEventListener('pointerleave', leave);
}

const dockInit = {};
const DOCK_INIT = {
  send: () => { if (split.busy) return; Object.assign(split, { asset: null, step: 'what', amount: '', results: null }); if (split.picked === null) split.picked = []; },
  swap: () => { if (swap.busy) return; Object.assign(swap, { side: 'buy', mint: callout.info?.ca || '', mode: 'sol', amount: '', sellPct: '', step: 'coin', bal: null, toks: null, toksMint: '', started: false }); },
  sweep: () => { if (sw.busy) return; Object.assign(sw, { step: 'pick', toPaste: '', picked: null, plan: null, planErr: '', results: null, asset: sw.asset || 'SOL' }); if (!sw.to || !(walletOf(sw.to) || isAddress(sw.to))) sw.to = (!isAll() && st.selected) || st.wallets[0]?.address; setTimeout(loadSweepPlan); },
};
const viewDock = (kind) => () => {
  if (!dockInit[kind]) { dockInit[kind] = true; DOCK_INIT[kind]?.(); }
  const v = $('#view'); v.innerHTML = '<div class="dock" id="dbody"></div>'; SHEETS[kind](document.getElementById('dbody'));
};
function viewReceive() {
  const v = $('#view');
  const list = isAll() ? st.wallets : [selectedWallet()];
  v.innerHTML = `<div class="rgrid">${list.map(w => `<div class="rcard">
      <div class="row">${avatar(w, 'sm')}<b class="grow trunc">${esc(w.name)}</b><button class="btn sm" data-rcopy="${w.address}">${I.copy} Copy</button></div>
      <div class="qr">${qrSvg(w.address)}</div>
      <div class="mono addr">${esc(w.address)}</div>
      <a class="link muted" href="https://solscan.io/account/${w.address}" target="_blank" rel="noopener">View on Solscan ${I.ext}</a>
    </div>`).join('')}</div>
    <p class="hint">Send SOL or any Solana token to an address above.${!isAll() && st.wallets.length > 1 ? ' Switch to All wallets in the sidebar to see every address.' : ''}</p>`;
  $$('[data-rcopy]').forEach(b => b.onclick = () => copy(b.dataset.rcopy, `${nameOf(b.dataset.rcopy)}'s address copied`));
}
const VIEWS = {
  home: viewHome, wallets: viewWallets, settings: viewSettings, reply: viewReply, templates: viewTemplates, callouts: viewCallouts, like: viewLike,
  receive: viewReceive, send: viewDock('send'), swap: viewDock('swap'), sweep: viewDock('sweep'),
  bbuy: () => { if (bundle.action !== 'buy') { bundle.action = 'buy'; trade.side = 'buy'; trade.stage = 'form'; } viewBundle(); },
  bsell: () => { if (bundle.action !== 'sell') { bundle.action = 'sell'; trade.side = 'sell'; trade.stage = 'form'; } viewBundle(); },
  follow: () => { const v = $('#view'); const h = followCard(); v.innerHTML = h || '<div class="empty"><b>Add a second wallet</b>Following needs at least two wallets in this group.</div>'; wireFollow(); },
  activity: () => { act.mode = 'activity'; viewActivity(); },
  pnl: () => { act.mode = 'pnl'; viewActivity(); },
};

refresh().catch(e => { root.innerHTML = `<main class="view"><div class="note bad"><b>Couldn't start.</b> ${esc(e.message)}</div></main>`; });

// Keep PnL live while Truth is open: quietly re-check every 30s on Home and Activity (prices move even when you don't trade).
setInterval(async () => {
  if (document.hidden || page || sheet || !pnlReady() || !['home', 'activity'].includes(tab)) return;
  try { const n = await send({ type: 'pnl' }); if (n && !n.error) { const same = JSON.stringify(n) === JSON.stringify(pnl); pnl = n; if (!same && !page && !sheet) renderWhenIdle(); } } catch {}
}, 30000);
