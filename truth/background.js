// Service worker: holds the vault, signs, talks to pump.fun tabs and the popup.
import * as b58 from './lib/base58.js';
import * as K from './lib/keys.js';
import * as S from './lib/solana.js';
import { buildBuyTx } from './lib/buy.js';

const DEFAULT_SETTINGS = {
  rpc: 'https://solana-rpc.publicnode.com',   // web: Solana's own public RPC refuses websites
  priorityMicroLamports: 20000,
  template: '{name} (${ticker}) looking strong 👀\nCA: {ca}',
  autoSubmit: false,
  autoLockMinutes: 15,
  showBackground: true,
  photoVis: 60,           // how much of the background photo shows through, 0-100
  buyRoute: 'auto',          // auto | jupiter | pumpportal
  slippagePct: 15,
  buyPriorityFeeSol: 0.0005,
  jupKey: '',
  thesisDelaySec: 1,
  rpcRps: 8,              // RPC requests per second (free Helius ~10, paid plans 50+)
};
const PUMP_URLS = ['https://pump.fun/*', 'https://*.pump.fun/*'];

const local = {
  get: async (k) => (await chrome.storage.local.get(k))[k],
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
};
const session = {
  get: async (k) => (await chrome.storage.session.get(k))[k],
  set: (k, v) => chrome.storage.session.set({ [k]: v }),
  del: (k) => chrome.storage.session.remove(k),
};

// A job saved as running when this service worker starts was cut off (Chrome stopped Truth). Close it out
// so the popup doesn't sit on "Posting" forever and the leftover wallets can be retried.
const SW_START = Date.now();
(async () => {
  for (const kind of ['thesis', 'follow', 'like']) {
    try {
      const j = await session.get('job_' + kind);
      if (!j || j.done || !(j.startedAt < SW_START)) continue;
      for (const r of j.rows || []) if (!['posted', 'done', 'failed', 'skipped'].includes(r.state)) { r.state = 'failed'; r.error = 'Interrupted. Chrome paused Truth before this one went out. Retry it.'; }
      j.done = true; await session.set('job_' + kind, j);
    } catch {}
  }
})();

// The pump.fun page only needs to record its network traffic while Truth is being taught.
// Once the sign-in and post are learned, recording is switched off so the tab stays light.
async function recNeeded() { const t = (await local.get('pumpTpl')) || {}; return { on: !(t.login && t.post) }; }
async function setRecording(on) {
  try { for (const tab of await chrome.tabs.query({ url: ['https://pump.fun/*', 'https://*.pump.fun/*'] })) chrome.tabs.sendMessage(tab.id, { type: 'rec', on }).catch(() => {}); } catch {}
}

// Keeps this service worker alive while something long is running (a job, an open approval window).
let keepAliveCount = 0, keepAliveTimer = null;
function keepAlive(promise) {
  if (keepAliveCount++ === 0) keepAliveTimer = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  return Promise.resolve(promise).finally(() => { if (--keepAliveCount === 0) { clearInterval(keepAliveTimer); keepAliveTimer = null; } });
}

async function settings() {
  const saved = (await local.get('settings')) || {};
  // One-time move off the old 4s default between callouts (pacing now backs off by itself when needed).
  if (!saved.pace2) {
    if (saved.thesisDelaySec == null || Number(saved.thesisDelaySec) === 4) saved.thesisDelaySec = 1;
    saved.pace2 = true;
    await local.set('settings', saved);
  }
  const out = { ...DEFAULT_SETTINGS, ...saved };
  S.setRpcRate(out.rpcRps);
  return out;
}

// ---------------- wallet groups: separate sets of wallets, one active at a time ----------------
const DEFAULT_GROUP = { id: 'main', name: 'Main group' };
async function groupsInfo() {
  let groups = (await local.get('groups')) || [];
  if (!groups.length) groups = [DEFAULT_GROUP];
  let active = await local.get('activeGroup');
  if (!groups.some(g => g.id === active)) active = groups[0].id;
  const all = (await local.get('wallets')) || [];
  const map = (await local.get('walletGroups')) || {};
  let changed = false;
  // New or unassigned wallets join the group that's open.
  for (const w of all) if (!groups.some(g => g.id === map[w.address])) { map[w.address] = active; changed = true; }
  for (const a of Object.keys(map)) if (!all.some(w => w.address === a)) { delete map[a]; changed = true; }
  if (changed) await local.set('walletGroups', map);
  return { groups, active, map, all };
}
async function scopedWallets() { const g = await groupsInfo(); return g.all.filter(w => g.map[w.address] === g.active); }
async function groupCall(msg) {
  const g = await groupsInfo();
  const name = String(msg.name || '').trim().slice(0, 30);
  if (msg.type === 'groupCreate') {
    if (!name) throw new Error('Give the group a name');
    if (g.groups.some(x => x.name.toLowerCase() === name.toLowerCase())) throw new Error('A group with that name already exists');
    const id = 'g' + Date.now().toString(36);
    await local.set('groups', [...g.groups, { id, name }]);
    await switchGroup(id);
  } else if (msg.type === 'groupSwitch') {
    if (!g.groups.some(x => x.id === msg.id)) throw new Error('That group no longer exists');
    await switchGroup(msg.id);
  } else if (msg.type === 'groupRename') {
    if (!name) throw new Error('Give the group a name');
    await local.set('groups', g.groups.map(x => x.id === msg.id ? { ...x, name } : x));
  } else if (msg.type === 'groupDelete') {
    if (g.groups.length < 2) throw new Error('You need at least one group');
    if (Object.values(g.map).includes(msg.id)) throw new Error('Move or remove the wallets in this group first');
    const rest = g.groups.filter(x => x.id !== msg.id);
    await local.set('groups', rest);
    if (g.active === msg.id) await switchGroup(rest[0].id);
  } else if (msg.type === 'walletMove') {
    if (!g.groups.some(x => x.id === msg.group)) throw new Error('Pick a group');
    if (!g.all.some(w => w.address === msg.address)) throw new Error('Wallet not found');
    await local.set('walletGroups', { ...g.map, [msg.address]: msg.group });
  }
  return state();
}
async function switchGroup(id) {
  const sel = await local.get('selected'), g = await groupsInfo();
  const remembered = (await local.get('groupSelected')) || {};
  if (sel) remembered[g.active] = sel;
  await local.set('groupSelected', remembered);
  await local.set('activeGroup', id);
  const inGroup = g.all.filter(w => g.map[w.address] === id);
  const next = inGroup.find(w => w.address === remembered[id]) || inGroup[0];
  if (next) { await local.set('selected', next.address); broadcastAccount(); }
}

async function state() {
  const g = await groupsInfo();
  const wallets = g.all.filter(w => g.map[w.address] === g.active);
  let selected = await local.get('selected');
  if (wallets.length && !wallets.some(w => w.address === selected)) { selected = wallets[0].address; await local.set('selected', selected); broadcastAccount(); }
  return {
    hasVault: !!(await local.get('vault')),
    unlocked: !!(await session.get('keys')),
    wallets,
    allCount: g.all.length,
    groups: g.groups.map(x => ({ ...x, count: g.all.filter(w => g.map[w.address] === x.id).length })),
    activeGroup: g.active,
    selected,
    friends: (await local.get('friends')) || [],
    settings: await settings(),
    connected: (await local.get('connectedOrigins')) || [],
    taught: teachInfo(await local.get('pumpTpl')),
    jobs: { thesis: await session.get('job_thesis'), buy: await session.get('job_buy'), follow: await session.get('job_follow'), like: await session.get('job_like') },
    teachLog: (await session.get('teachLog')) || [],
  };
}

async function touchLock() {
  const s = await settings();
  chrome.alarms.create('autolock', { delayInMinutes: Math.max(1, Number(s.autoLockMinutes) || 15) });
}
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'autolock') lock(); });
async function lock() { await session.del('keys'); }

async function unlock(password) {
  const vault = await local.get('vault');
  if (!vault) throw new Error('No vault yet');
  const keys = await K.decryptVault(password, vault);
  await session.set('keys', keys);
  await touchLock();
  return keys;
}

async function seedFor(address) {
  const keys = await session.get('keys');
  if (!keys) throw new Error('Wallet is locked');
  const k = keys.find(x => x.address === address);
  if (!k) throw new Error('Unknown wallet');
  await touchLock();
  return b58.decode(k.seed);
}

async function saveVault(password, keys) {
  // Names live in the (unencrypted) wallet list so renames don't need the password; keep them in sync.
  const names = new Map(((await local.get('wallets')) || []).map(w => [w.address, w.name]));
  for (const k of keys) k.name = names.get(k.address) || k.name;
  await local.set('vault', await K.encryptVault(password, keys));
  await local.set('wallets', keys.map(k => ({ name: k.name, address: k.address })));
  await session.set('keys', keys);
}

async function broadcastAccount() {
  const selected = await local.get('selected');
  const tabs = await chrome.tabs.query({ url: PUMP_URLS });
  for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'accountChanged', address: selected }).catch(() => {});
}

// ---------------- split / distribute ----------------
const chunk = (arr, n) => { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

async function distribute({ from, asset, recipients, perRecipient }) {
  const s = await settings();
  const seed = await seedFor(from);
  const per = BigInt(perRecipient);
  if (per <= 0n) throw new Error('Amount per wallet is zero');
  const uniq = [...new Set(recipients)].filter(r => r !== from);
  for (const r of uniq) if (!b58.isAddress(r)) throw new Error('Bad address: ' + r);
  const results = [];
  const isSol = asset.kind === 'SOL';
  const batches = chunk(uniq, isSol ? 15 : 6);

  for (const batch of batches) {
    try {
      const ixs = [];
      const cu = isSol ? 1000 + 450 * batch.length : 10000 + 40000 * batch.length;
      ixs.push(S.ix.setCuLimit(cu));
      if (s.priorityMicroLamports > 0) ixs.push(S.ix.setCuPrice(BigInt(s.priorityMicroLamports)));
      for (const to of batch) {
        if (isSol) ixs.push(S.ix.solTransfer(from, to, per));
        else {
          const ata = await S.getAta(to, asset.mint, asset.program);
          ixs.push(S.ix.createAtaIdempotent(from, ata, to, asset.mint, asset.program));
          ixs.push(S.ix.transferChecked(asset.account, asset.mint, ata, from, per, asset.decimals, asset.program));
        }
      }
      const { value } = await S.rpc(s.rpc, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);
      const { message } = S.compileMessage(from, ixs, value.blockhash);
      const sig = await K.sign(seed, message);
      const tx = S.serializeTx(message, [sig]);
      if (tx.length > 1232) throw new Error('Transaction too large');
      const signature = await S.sendRawTx(s.rpc, tx);
      await S.waitForConfirm(s.rpc, signature);
      results.push({ ok: true, signature, recipients: batch });
    } catch (e) {
      results.push({ ok: false, error: e.message, recipients: batch });
      break; // stop on first failure so nothing gets double-sent on retry
    }
  }
  const sent = new Set(results.filter(r => r.ok).flatMap(r => r.recipients));
  return { results, notSent: uniq.filter(r => !sent.has(r)) };
}


// ---------------- teach: recorded sign-in chain + post shape ----------------
function teachInfo(t) {
  return { login: !!t?.login, post: !!t?.post, loginAt: t?.login?.capturedAt || null, postAt: t?.post?.capturedAt || null,
    loginMessage: t?.login?.message || null, loginHosts: t?.login?.hosts || [], loginSteps: t?.login?.steps?.length || 0, postHost: t?.post?.host || null,
    loginList: (t?.login?.steps || []).map((s, i) => { try { const u = new URL(s.url); return `${i === t.login.signAt ? '✍ ' : ''}${s.method} ${u.host}${u.pathname}`; } catch { return s.method + ' ' + s.url; } }),
    postPath: t?.post ? (() => { try { const u = new URL(t.post.url); return `${t.post.method} ${u.host}${u.pathname}`; } catch { return t.post.url; } })() : null };
}
const PH_RE = /\{\{([^}]+)\}\}/g;
function validStep(st) {
  if (!st || typeof st !== 'object') return false;
  try { const u = new URL(st.url); if (u.protocol !== 'https:') return false; } catch { return false; }
  if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(st.method)) return false;
  if (!st.body || !['json', 'form', 'params', 'text', 'none', 'unsupported'].includes(st.body.kind)) return false;
  return true;
}
async function storeCaptured(kind, tpl) {
  if (!tpl || typeof tpl !== 'object' || tpl.v !== 2) throw new Error('Bad capture');
  if (kind === 'login') {
    if (!Array.isArray(tpl.steps) || !tpl.steps.length || !tpl.steps.every(validStep)) throw new Error('Bad capture');
    if (typeof tpl.message !== 'string') throw new Error('Bad capture');
    if (!tpl.message.includes('{{address}}') && !JSON.stringify(tpl.steps).includes('{{address}}')) throw new Error('Neither the sign-in message nor the request contains the wallet address — can\'t repeat it for other wallets');
    if (!JSON.stringify(tpl.steps).match(/\{\{sig(58|64|64u|64url|hex|arr)\}\}/)) throw new Error('Bad capture');
    if (tpl.steps.some(st => st.body.kind === 'unsupported')) throw new Error('One sign-in request used a body type that can\'t be replayed');
  } else if (kind === 'post') {
    if (!validStep(tpl) || !JSON.stringify(tpl.body).includes('{{text}}')) throw new Error('Bad capture');
    { const path = new URL(tpl.url).pathname;
      if (!/callout/i.test(path) || /repl(y|ies)|comment|thread|message|chat/i.test(path) || /"(parentId|rootMessageId|replyTo|parentCalloutId)"/.test(JSON.stringify(tpl.body))) throw new Error('That was a reply, not a new callout. Make a new callout on the coin instead'); }
  } else throw new Error('Bad capture');
  const cur = (await local.get('pumpTpl')) || {};
  if (kind === 'login') {
    // Already set up? A sign-in after a page refresh must not wipe it. Keep the new one aside in
    // case a post gets re-taught from this same page, otherwise ignore it.
    if (cur.login && cur.post) {
      await session.set('freshLogin', tpl);
      await appendTeachLog({ kind: 'ok', text: 'Signed in again. Your saved setup is kept, nothing to redo.' });
      return;
    }
    cur.login = tpl;
    delete cur.post; // a post recorded against an older sign-in may reference stale request ids
  } else {
    // Pair the post with the sign-in recorded on the same page load.
    const fresh = await session.get('freshLogin');
    if (tpl.loginSid && cur.login?.sid !== tpl.loginSid && fresh?.sid === tpl.loginSid) cur.login = fresh;
    if (!cur.login) throw new Error('Sign in first (step 1)');
    cur.post = tpl;
    await session.del('freshLogin');
  }
  await local.set('pumpTpl', cur);
  if (cur.login && cur.post) setRecording(false);
}
async function appendTeachLog(entry) {
  const log = (await session.get('teachLog')) || [];
  log.push({ t: Date.now(), kind: String(entry.kind || '').slice(0, 10), text: String(entry.text || '').slice(0, 160), status: entry.status });
  await session.set('teachLog', log.slice(-40));
}

// Signing on demand during a thesis run. The pump.fun tab asks for a signature of the sign-in
// message once the nonce is known; we only sign if a job we started is running in that tab and the
// text is the taught template with blanks filled — never a transaction.
let activeThesis = null; // { token, tabId, addresses:Set, templateRe }
function templateRegex(tpl) {
  return new RegExp('^' + tpl.split(PH_RE).filter((_, i) => i % 2 === 0).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]{1,200}?') + '$');
}
async function thesisSign({ jobToken, address, text }, tabId) {
  const a = activeThesis;
  if (!a || a.token !== jobToken || a.tabId !== tabId) throw new Error('No thesis run is active for this tab');
  if (!a.addresses.has(address)) throw new Error('Wallet not part of this run');
  if (typeof text !== 'string' || text.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error('Unexpected sign-in message');
  if (!a.templateRe.test(text) || (a.needsAddress && !text.includes(address))) throw new Error('Sign-in message does not match what was taught');
  const sig = await K.sign(await seedFor(address), new TextEncoder().encode(text));
  let bin = ''; for (const b of sig) bin += String.fromCharCode(b);
  const sig64 = btoa(bin);
  return { sig58: b58.encode(sig), sig64, sig64u: encodeURIComponent(sig64), sig64url: sig64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), sighex: [...sig].map(x => x.toString(16).padStart(2, '0')).join(''), sigarr: [...sig] };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const NO_ACCOUNT = /ACCOUNT_NOT_FOUND|No account for/i;
const NO_ACCOUNT_NOTE = 'Skipped: this wallet has never signed in to pump.fun, so it has no account there yet.';
const FOLLOW_GAP_MS = 500; // base pause between wallet sign-ins during a follow job (grows if pump.fun pushes back)
// Pacing that starts fast and only slows down when pump.fun actually rate-limits us.
function makePace(baseMs) {
  let gap = baseMs;
  return {
    gap: () => gap,
    hit: () => { gap = Math.min(10000, Math.max(gap * 2, 4000)); },
    ok: () => { gap = Math.max(baseMs, Math.round(gap * 0.7)); },
  };
}
// A message to the pump.fun tab that never comes back (tab frozen, reloaded mid-step) must not hang a run.
function tabAsk(tabId, msg, ms = 90000) {
  return Promise.race([chrome.tabs.sendMessage(tabId, msg), sleep(ms).then(() => { throw new Error('The pump.fun tab stopped answering. Refresh it and try again.'); })]);
}

// ---------------- thesis: post a different text from each wallet ----------------
// Errors worth another try: rate limits, pump.fun hiccups, network drops, the tab reloading.
const TAB_GONE = /Receiving end does not exist|Could not establish connection|message port closed|did not answer|stopped answering/i;
function retryWait(err) {
  // pump.fun's rate limit often shows up as "Failed to fetch" (the block reply has no CORS headers).
  if (/HTTP 429|rate.?limit|too many|Failed to fetch|NetworkError/i.test(err)) return 10000;
  if (/HTTP 5\d\d|network|timed? ?out/i.test(err) || TAB_GONE.test(err)) return 3000;
  return 0; // anything else (bad template, rejected text) won't fix itself
}
// Wait for the pump.fun tab to be loaded and listening again (after a refresh). False if it was closed.
async function tabReady(tabId) {
  for (let i = 0; i < 30; i++) {
    let tab; try { tab = await chrome.tabs.get(tabId); } catch { return false; }
    if (!/^https:\/\/([\w-]+\.)?pump\.fun\//.test(tab.url || '')) return false;
    if (tab.status === 'complete') {
      try { const r = await chrome.tabs.sendMessage(tabId, { type: 'coinInfo' }); if (r?.ok) return true; } catch {}
    }
    await sleep(1000);
  }
  return false;
}
async function runThesis({ tabId, mint, items }) {
  const tpls = (await local.get('pumpTpl')) || {};
  if (!tpls.login || !tpls.post) throw new Error('Teach the extension first (Callouts tab)');
  if (!items.length) throw new Error('Write at least one callout');
  if (activeThesis) throw new Error('Another pump.fun job is running. Wait for it to finish.');
  if (!(await tabReady(tabId))) throw new Error('Open the coin on pump.fun in this tab and wait for it to load, then try again');
  const s = await settings();
  const selected = await local.get('selected');
  const job = { mint, tabId, startedAt: Date.now(), done: false, rows: items.map(i => ({ address: i.address, text: i.text, state: 'waiting' })) };
  const save = () => session.set('job_thesis', job);
  await save();
  activeThesis = { token: crypto.randomUUID(), tabId, addresses: new Set([...items.map(i => i.address), selected].filter(Boolean)), templateRe: templateRegex(tpls.login.message), needsAddress: tpls.login.message.includes('{{address}}') };
  const token = activeThesis.token;
  const MAX_TRIES = 3;
  const pace = makePace(Math.max(0.5, Number(s.thesisDelaySec) || 0) * 1000);
  keepAlive((async () => {
    try {
      for (let n = 0; n < items.length; n++) {
        const row = job.rows[n];
        row.state = 'posting'; await save();
        for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
          row.tries = attempt;
          try {
            const r = await tabAsk(tabId, { type: 'replay', login: tpls.login, post: tpls.post, vars: { address: items[n].address, mint, text: items[n].text }, jobToken: token });
            if (!r?.ok) throw new Error(r?.error || 'The pump.fun tab did not answer — keep it open');
            row.detail = `sign-in ${r.result.steps.map(x => x.status).join('/')} · post ${r.result.post}${attempt > 1 ? ` · try ${attempt}` : ''}`;
            if (/"replyId"|"rootMessageId"/.test(r.result.postBody || '') && !/"calloutId"/.test(r.result.postBody || '')) {
              row.state = 'failed'; row.error = 'pump.fun saved this as a reply, not a callout. Truth learned the wrong action: press Re-teach and make a NEW callout on the coin.';
              break;
            }
            row.state = 'posted'; delete row.error;
            if (r.result.verifyNote) row.detail += ' · ' + r.result.verifyNote;
            if (r.result.postBody) row.detail += ' · reply: ' + String(r.result.postBody).slice(0, 120);
            break;
          } catch (e) {
            const msg = String(e?.message || e);
            // A retry that hits "already has a callout" means an earlier try went through.
            if (attempt > 1 && /already has a callout/.test(msg)) { row.state = 'posted'; row.detail = `went through on an earlier try`; delete row.error; break; }
            const wait = retryWait(msg);
            row.error = msg;
            if (!wait || attempt === MAX_TRIES) { row.state = 'failed'; break; }
            row.detail = `retrying (${attempt + 1}/${MAX_TRIES})…`; await save();
            await sleep(wait * attempt);
            if (TAB_GONE.test(msg) && !(await tabReady(tabId))) { row.state = 'failed'; row.error = 'The pump.fun tab was closed or left the site'; break; }
          }
        }
        await save();
        if (row.state === 'failed' && /tab was closed/.test(row.error || '')) {
          for (const r2 of job.rows.slice(n + 1)) { r2.state = 'failed'; r2.error = 'Not posted: the pump.fun tab was closed'; }
          break;
        }
        // Adaptive gap: back off hard after a rate limit, then ease back down to the setting on clean posts.
        if (/HTTP 429|rate.?limit|too many|Failed to fetch/i.test(row.error || '') || row.tries > 1) pace.hit(); else pace.ok();
        if (n < items.length - 1) await sleep(pace.gap());
      }
      // Sign pump.fun back in as the selected wallet.
      try { if (selected) await chrome.tabs.sendMessage(tabId, { type: 'replay', login: tpls.login, post: null, vars: { address: selected, mint }, jobToken: token }); } catch {}
    } finally {
      activeThesis = null; job.done = true; await save();
      await logActivity({ kind: 'callout', at: job.startedAt, mint, rows: job.rows.map(r => ({ address: r.address, state: r.state, error: r.error || null })) });
    }
  })());
  return job;
}

// ---------------- follow: every wallet follows every other wallet on pump.fun ----------------
async function runFollow({ tabId, addresses, targets: targetPick, extra: extraIn }) {
  const tpls = (await local.get('pumpTpl')) || {};
  if (!tpls.login || !tpls.post) throw new Error('Connect the pump.fun login first (Callouts tab)');
  if (activeThesis) throw new Error('Another pump.fun job is running. Wait for it to finish.');
  const scoped = (await scopedWallets()).map(w => w.address);
  const all = Array.isArray(addresses) ? scoped.filter(a => addresses.includes(a)) : scoped; // wallets that do the following
  // Focus mode: followers only follow the picked focus wallets. Otherwise everyone follows everyone.
  const focus = Array.isArray(targetPick) ? scoped.filter(a => targetPick.includes(a)) : null;
  // Outside accounts (pasted addresses that aren't wallets in Truth): every follower follows them too.
  const extra = [...new Set((Array.isArray(extraIn) ? extraIn : []).map(a => String(a).trim()).filter(a => b58.isAddress(a) && !scoped.includes(a)))].slice(0, 500);
  const extraSet = new Set(extra);
  if (focus) {
    if (!focus.length && !extra.length) throw new Error('Pick at least 1 wallet or paste an address to get followed');
    if (!all.length) throw new Error('Pick at least 1 wallet to do the following');
    if (!all.some(a => [...focus, ...extra].some(t => t !== a))) throw new Error('Pick a follower that is not the only focus wallet');
  } else if (all.length < 2 && !(all.length >= 1 && extra.length)) throw new Error('Pick at least 2 wallets to follow each other, or paste addresses to follow');
  const goal = [...(focus || all), ...extra]; // who gets followed
  const everyone = [...new Set([...all, ...goal])];
  const s = await settings();
  const selected = await local.get('selected');
  const ids = (await local.get('pumpUserIds')) || {};
  if (!(await tabReady(tabId))) throw new Error('Open pump.fun in this tab and wait for it to load, then try again.');
  const job = { kind: 'follow', focus: !!focus, startedAt: Date.now(), done: false, step: '', rows: everyone.map(a => ({ address: a, state: 'waiting', outside: extraSet.has(a) || undefined, detail: extraSet.has(a) ? 'outside account · gets followed by address' : (focus && goal.includes(a) && !all.includes(a) ? 'focus wallet · ' : '') + (ids[a] ? 'account known' : goal.includes(a) ? 'waiting for account lookup' : 'waiting for its turn') })) };
  const save = () => session.set('job_follow', job);
  await save();
  activeThesis = { token: crypto.randomUUID(), tabId, addresses: new Set([...everyone, selected].filter(Boolean)), templateRe: templateRegex(tpls.login.message), needsAddress: tpls.login.message.includes('{{address}}') };
  const token = activeThesis.token;
  // Follows use their own short gap (not the callout delay). Rate limits are handled by retrying instead.
  const followPace = makePace(FOLLOW_GAP_MS);
  let hitThisRound = false;
  const pause = () => { if (hitThisRound) followPace.hit(); else followPace.ok(); hitThisRound = false; return sleep(followPace.gap()); };
  const done = (await local.get('followDone')) || {}; // address -> wallet addresses it already follows
  const ask = async (msg) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await tabAsk(tabId, msg);
        if (!r?.ok) throw new Error(r?.error || 'The pump.fun tab did not answer. Keep it open.');
        return r;
      } catch (e) {
        const wait = retryWait(e.message);
        if (wait) hitThisRound = true;
        if (!wait || attempt >= 3) throw e;
        if (TAB_GONE.test(e.message) && !(await tabReady(tabId))) throw new Error('Lost the pump.fun tab. If you just reloaded Truth, refresh the pump.fun tab and run it again (finished follows are skipped).');
        await sleep(wait);
      }
    }
  };
  // Wallets that have never signed in to pump.fun have no account there: skip them (no retries) and
  // leave them out as targets, instead of failing with pump.fun's raw error.
  const noAccount = new Set();
  keepAlive((async () => {
    try {
      // Pass 1: learn pump.fun's account id for wallets that will get followed and we haven't seen yet.
      const unknown = goal.filter(a => !ids[a] && !extraSet.has(a)); // outside accounts can't sign in, so they're followed by address
      for (let n = 0; n < unknown.length; n++) {
        const row = job.rows.find(r => r.address === unknown[n]);
        job.step = `Step 1 of 2: looking up pump.fun accounts (${n + 1} of ${unknown.length})`;
        row.state = 'posting'; row.detail = 'signing in to look up its pump.fun account'; await save();
        try {
          const r = await ask({ type: 'replay', login: tpls.login, post: tpls.post, whoami: true, vars: { address: unknown[n] }, jobToken: token });
          if (r.result.userId) { ids[unknown[n]] = r.result.userId; await local.set('pumpUserIds', ids); row.detail = 'account found, waiting for its turn'; }
          else row.detail = 'signed in, but pump.fun gave no account id (will try the wallet address)';
        } catch (e) {
          if (NO_ACCOUNT.test(e.message)) { noAccount.add(unknown[n]); row.state = 'skipped'; row.error = null; row.detail = NO_ACCOUNT_NOTE; await save(); await pause(); continue; }
          row.detail = 'lookup failed: ' + e.message;
        }
        row.state = 'waiting'; await save();
        await pause();
      }
      // Pass 2: each follower follows the others (or only the focus wallets).
      for (let n = 0; n < all.length; n++) {
        const row = job.rows.find(r => r.address === all[n]);
        job.step = `Step 2 of 2: following (${n + 1} of ${all.length})`;
        if (noAccount.has(all[n])) { row.state = 'skipped'; row.error = null; row.detail = NO_ACCOUNT_NOTE; await save(); continue; }
        const others = goal.filter(a => a !== all[n] && !noAccount.has(a));
        if (!others.length) { row.state = 'posted'; row.error = null; row.detail = 'focus wallet, nothing else to follow'; await save(); continue; }
        const already = new Set(done[all[n]] || []);
        const todo = others.filter(a => !already.has(a));
        // Already follows everyone picked: no sign-in needed, move straight on.
        if (!todo.length) { row.state = 'posted'; row.error = null; row.detail = `already following all ${others.length}, skipped`; await save(); continue; }
        row.state = 'posting'; row.detail = `signing in and following ${todo.length}`; await save();
        try {
          const targets = todo.map(a => ids[a] || a);
          const r = await ask({ type: 'replay', login: tpls.login, post: tpls.post, follow: targets, vars: { address: all[n] }, jobToken: token });
          if (r.result.userId && !ids[all[n]]) { ids[all[n]] = r.result.userId; await local.set('pumpUserIds', ids); }
          const failed = r.result.failed || [];
          const failedSet = new Set(failed.map(f => typeof f === 'string' ? f : (f?.target || f?.userId || f?.id || f?.address)).filter(Boolean));
          const ok = todo.filter((a, i) => !failedSet.has(targets[i]) && !failedSet.has(a));
          if (failed.length && failedSet.size < failed.length) ok.length = 0; // couldn't tell which failed: remember none
          done[all[n]] = [...new Set([...already, ...ok])]; await local.set('followDone', done);
          row.detail = `following ${targets.length - failed.length} of ${targets.length}` + (already.size ? ` (${others.length - todo.length} already done)` : '');
          if (failed.length) { row.state = failed.length === targets.length ? 'failed' : 'posted'; row.error = `pump.fun couldn't follow ${failed.length}`; }
          else { row.state = 'posted'; row.error = null; }
        } catch (e) {
          if (NO_ACCOUNT.test(e.message)) { noAccount.add(all[n]); row.state = 'skipped'; row.error = null; row.detail = NO_ACCOUNT_NOTE; }
          else { row.state = 'failed'; row.error = e.message; }
        }
        await save();
        if (n < all.length - 1) await pause();
      }
      // Focus wallets that weren't followers: done once their account is known.
      for (const row of job.rows) if (!all.includes(row.address)) {
        if (extraSet.has(row.address)) { row.state = 'posted'; row.error = null; row.detail = 'outside account · followed by address'; continue; }
        if (ids[row.address]) { row.state = 'posted'; row.detail = 'focus wallet · account found'; }
        else { row.state = 'failed'; row.error = row.detail?.startsWith('lookup failed') ? row.detail : "couldn't find its pump.fun account, follows used the wallet address"; }
      }
      await save();
      try { if (selected) await chrome.tabs.sendMessage(tabId, { type: 'replay', login: tpls.login, post: null, vars: { address: selected }, jobToken: token }); } catch {}
    } finally { activeThesis = null; job.step = ''; job.done = true; await save(); }
  })());
  return job;
}

async function runUnfollow({ tabId, address }) {
  const tpls = (await local.get('pumpTpl')) || {};
  if (!tpls.login || !tpls.post) throw new Error('Connect the pump.fun login first (Callouts tab)');
  if (activeThesis) throw new Error('Another pump.fun job is running. Wait for it to finish.');
  if (!(await scopedWallets()).some(w => w.address === address)) throw new Error('Wallet not found in this group');
  const selected = await local.get('selected');
  const job = { kind: 'unfollow', startedAt: Date.now(), done: false, rows: [{ address, state: 'posting' }] };
  const save = () => session.set('job_follow', job);
  await save();
  activeThesis = { token: crypto.randomUUID(), tabId, addresses: new Set([address, selected].filter(Boolean)), templateRe: templateRegex(tpls.login.message), needsAddress: tpls.login.message.includes('{{address}}') };
  const token = activeThesis.token;
  keepAlive((async () => {
    const row = job.rows[0];
    try {
      const r = await chrome.tabs.sendMessage(tabId, { type: 'replay', login: tpls.login, post: tpls.post, unfollowAll: true, vars: { address }, jobToken: token });
      if (!r?.ok) throw new Error(r?.error || 'The pump.fun tab did not answer. Keep it open.');
      if (r.result.userId) { const ids = (await local.get('pumpUserIds')) || {}; ids[address] = r.result.userId; await local.set('pumpUserIds', ids); }
      { const done = (await local.get('followDone')) || {}; delete done[address]; await local.set('followDone', done); }
      row.detail = r.result.followingBefore ? `unfollowed ${r.result.unfollowed} of ${r.result.followingBefore}` : 'wasn\'t following anyone';
      if (r.result.unfollowFailed) { row.state = r.result.unfollowed ? 'posted' : 'failed'; row.error = `pump.fun refused ${r.result.unfollowFailed}`; } else row.state = 'posted';
    } catch (e) { row.state = 'failed'; row.error = e.message; }
    try { if (selected && selected !== address) await chrome.tabs.sendMessage(tabId, { type: 'replay', login: tpls.login, post: null, vars: { address: selected }, jobToken: token }); } catch {}
    activeThesis = null; job.done = true; await save();
  })());
  return job;
}

// ---------------- like: picked wallets like one callout on pump.fun ----------------
// The callout is either a pasted link (id known) or "<owner wallet>'s callout on <mint>", which the first
// wallet to sign in looks up; every later wallet reuses that id.
// "View as poster": switch pump.fun to the wallet that posted a callout, open that callout (exactly
// like switching wallets and clicking it yourself), then switch back. Only the posting wallet, and at most
// SELF_VIEW_MAX times per callout (you + a friend who shares the wallet).
const SELF_VIEW_MAX = 2;
async function runSelfView({ tabId, owner, mint, calloutId }) {
  const tpls = (await local.get('pumpTpl')) || {};
  if (!tpls.login) throw new Error('Connect the pump.fun login first (Callouts tab)');
  if (activeThesis) throw new Error('Another pump.fun job is running. Wait for it to finish.');
  if (!(mint && b58.isAddress(mint))) throw new Error('Open the coin on pump.fun or paste the callout link');
  if (calloutId != null && !/^[\w-]{4,80}$/.test(String(calloutId))) throw new Error('That callout link looks wrong');
  const scoped = (await scopedWallets()).map(w => w.address);
  if (!scoped.includes(owner)) throw new Error('Pick the wallet of yours that posted the callout');
  const key = owner + ':' + (calloutId || mint);
  const viewed = (await local.get('selfViewed')) || [];
  if (viewed.filter(k => k === key).length >= SELF_VIEW_MAX) throw new Error(`This wallet already opened this callout ${SELF_VIEW_MAX} times. That's the most allowed from the poster.`);
  if (!(await tabReady(tabId))) throw new Error('Open pump.fun in this tab and wait for it to load, then try again.');
  const selected = await local.get('selected');
  const token = crypto.randomUUID();
  activeThesis = { token, tabId, addresses: new Set([owner, selected].filter(Boolean)), templateRe: templateRegex(tpls.login.message), needsAddress: tpls.login.message.includes('{{address}}') };
  try {
    await local.set('selected', owner); await broadcastAccount();
    const r = await tabAsk(tabId, { type: 'replay', login: tpls.login, post: null, vars: { address: owner, mint }, jobToken: token });
    if (!r?.ok) throw new Error(r?.error || 'The pump.fun tab did not answer. Keep it open.');
    await chrome.tabs.update(tabId, { url: calloutId ? `https://pump.fun/callouts/${mint}/${calloutId}` : `https://pump.fun/coin/${mint}` });
    await sleep(1500);
    if (!(await tabReady(tabId))) throw new Error('The callout page did not load');
    await sleep(6000); // give the page time to load the callout like a normal visit
    await local.set('selfViewed', [...viewed, key].slice(-2000));
  } finally {
    if (selected && selected !== owner) {
      await local.set('selected', selected); await broadcastAccount();
      try { if (await tabReady(tabId)) await tabAsk(tabId, { type: 'replay', login: tpls.login, post: null, vars: { address: selected, mint }, jobToken: token }, 30000); } catch {}
    }
    activeThesis = null;
  }
  return { ok: true };
}

async function runLike({ tabId, mint, owner, calloutId, addresses }) {
  const tpls = (await local.get('pumpTpl')) || {};
  if (!tpls.login || !tpls.post) throw new Error('Connect the pump.fun login first (Callouts tab)');
  if (activeThesis) throw new Error('Another pump.fun job is running. Wait for it to finish.');
  if (calloutId != null && !/^[\w-]{4,80}$/.test(String(calloutId))) throw new Error('That callout link looks wrong');
  if (!calloutId && !(owner && b58.isAddress(owner) && mint && b58.isAddress(mint))) throw new Error('Pick whose callout to like, or paste a callout link');
  const scoped = (await scopedWallets()).map(w => w.address);
  const likers = scoped.filter(a => (addresses || []).includes(a));
  if (!likers.length) throw new Error('Tick at least 1 wallet to do the liking');
  if (!(await tabReady(tabId))) throw new Error('Open pump.fun in this tab and wait for it to load, then try again.');
  const selected = await local.get('selected');
  const ids = (await local.get('pumpUserIds')) || {};
  const job = { kind: 'like', startedAt: Date.now(), done: false, mint: mint || null, owner: owner || null, calloutId: calloutId || null, rows: likers.map(a => ({ address: a, state: 'waiting' })) };
  const save = () => session.set('job_like', job);
  await save();
  activeThesis = { token: crypto.randomUUID(), tabId, addresses: new Set([...likers, selected].filter(Boolean)), templateRe: templateRegex(tpls.login.message), needsAddress: tpls.login.message.includes('{{address}}') };
  const token = activeThesis.token;
  const pace = makePace(FOLLOW_GAP_MS);
  keepAlive((async () => {
    try {
      for (let n = 0; n < likers.length; n++) {
        const row = job.rows[n];
        row.state = 'posting'; row.detail = 'signing in and liking'; await save();
        let hit = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const like = { calloutId: job.calloutId, mint: job.mint, owners: [ids[job.owner], job.owner].filter(Boolean) };
            const r = await tabAsk(tabId, { type: 'replay', login: tpls.login, post: tpls.post, like, vars: { address: likers[n] }, jobToken: token });
            if (!r?.ok) throw new Error(r?.error || 'The pump.fun tab did not answer. Keep it open.');
            if (r.result.calloutId && !job.calloutId) job.calloutId = r.result.calloutId;
            if (r.result.ownerId && job.owner && !ids[job.owner]) { ids[job.owner] = r.result.ownerId; await local.set('pumpUserIds', ids); }
            row.state = 'posted'; delete row.error;
            row.detail = r.result.created === false ? 'already liked it' : 'liked';
            break;
          } catch (e) {
            const msg = String(e?.message || e);
            const wait = retryWait(msg);
            row.error = msg;
            if (wait) hit = true;
            if (!wait || attempt === 3) { row.state = 'failed'; break; }
            row.detail = `retrying (${attempt + 1}/3)…`; await save();
            await sleep(wait * attempt);
            if (TAB_GONE.test(msg) && !(await tabReady(tabId))) { row.state = 'failed'; row.error = 'The pump.fun tab was closed or left the site'; break; }
          }
        }
        await save();
        // No callout to like: no point signing in the rest.
        if (row.state === 'failed' && /no live callout|tab was closed/i.test(row.error || '')) {
          for (const r2 of job.rows.slice(n + 1)) { r2.state = 'skipped'; r2.error = 'Skipped: ' + row.error; }
          break;
        }
        if (hit) pace.hit(); else pace.ok();
        if (n < likers.length - 1) await sleep(pace.gap());
      }
      try { if (selected) await chrome.tabs.sendMessage(tabId, { type: 'replay', login: tpls.login, post: null, vars: { address: selected }, jobToken: token }); } catch {}
    } finally { activeThesis = null; job.done = true; await save(); }
  })());
  return job;
}

// ---------------- buy: same coin from many wallets at once ----------------
const RESERVE_LAMPORTS = 12_000_000n; // keep ~0.012 SOL for fees + token account

async function balances(rpcUrl, addresses) {
  const out = {};
  for (const part of chunk(addresses, 100)) {
    const r = await S.rpc(rpcUrl, 'getMultipleAccounts', [part, { encoding: 'base64', dataSlice: { offset: 0, length: 0 }, commitment: 'confirmed' }], 3);
    part.forEach((a, i) => { out[a] = String(r.value[i]?.lamports ?? 0); });
  }
  return out;
}

async function prepareBuy(s, address, mint, lamports) {
  const seed = await seedFor(address);
  const { tx, route } = await buildBuyTx({ route: s.buyRoute, wallet: address, mint, lamports, slippagePct: Number(s.slippagePct), priorityFeeSol: Number(s.buyPriorityFeeSol), jupKey: s.jupKey });
  const { signerKeys, numSigs } = S.splitTx(tx);
  if (signerKeys[0] !== address || numSigs !== 1) throw new Error(`${route} returned a transaction for the wrong wallet`);
  // Safety net: simulate and refuse if it would take more SOL than the buy + slippage + fees.
  const sim = await simulate(s.rpc, tx, address);
  if (sim.error) throw new Error(sim.error);
  const maxLossSol = Number(lamports) / 1e9 * (1 + Number(s.slippagePct) / 100) + Number(s.buyPriorityFeeSol) + 0.015;
  if (sim.solChange != null && -sim.solChange > maxLossSol) throw new Error(`Refused: would spend ${(-sim.solChange).toFixed(4)} SOL`);
  const { message } = S.splitTx(tx);
  const signed = S.applySignature(tx, address, await K.sign(seed, message));
  return { signed, route };
}
async function buyOne(s, address, mint, lamports) {
  const { signed, route } = await prepareBuy(s, address, mint, lamports);
  const signature = await S.sendRawTx(s.rpc, signed);
  await S.waitForConfirm(s.rpc, signature);
  return { signature, route };
}

async function tokenBalances(rpcUrl, mint, addresses) {
  const out = {};
  await Promise.all(addresses.map(async (a) => {
    const r = await S.rpc(rpcUrl, 'getTokenAccountsByOwner', [a, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
    let raw = 0n, decimals = 0;
    for (const acc of r.value) { const t = acc.account.data.parsed.info.tokenAmount; raw += BigInt(t.amount); decimals = t.decimals; }
    out[a] = { raw: raw.toString(), decimals };
  }));
  return out;
}

async function prepareSell(s, address, mint, pct, tokenRaw) {
  const seed = await seedFor(address);
  const { tx, route } = await buildBuyTx({ side: 'sell', route: s.buyRoute, wallet: address, mint, pct, tokenRaw, slippagePct: Number(s.slippagePct), priorityFeeSol: Number(s.buyPriorityFeeSol), jupKey: s.jupKey });
  const { signerKeys, numSigs, message } = S.splitTx(tx);
  if (signerKeys[0] !== address || numSigs !== 1) throw new Error(`${route} returned a transaction for the wrong wallet`);
  // A sell should never cost more SOL than fees.
  const sim = await simulate(s.rpc, tx, address);
  if (sim.error) throw new Error(sim.error);
  if (sim.solChange != null && -sim.solChange > Number(s.buyPriorityFeeSol) + 0.01) throw new Error(`Refused: sell would cost ${(-sim.solChange).toFixed(4)} SOL`);
  const signed = S.applySignature(tx, address, await K.sign(seed, message));
  return { signed, route, solChange: sim.solChange };
}

// Bundle trades: build, check and sign every wallet's transaction first, then send them all at the
// same moment so they land together instead of whenever each wallet's API calls happen to finish.
async function fireTogether(s, job, save, prepare, doneState) {
  const rows = job.rows.filter(r => r.state === 'waiting');
  for (const r of rows) r.state = 'preparing';
  await save();
  const ready = [];
  await Promise.all(rows.map(async (row) => {
    try { ready.push({ row, p: await prepare(row) }); }
    catch (e) { row.state = 'failed'; row.error = e.message; }
  }));
  for (const { row } of ready) row.state = job.side === 'sell' ? 'selling' : 'buying';
  await save();
  // Already simulated during prepare, so skip the second preflight check and send at once.
  await Promise.all(ready.map(async ({ row, p }) => {
    try { row.signature = await S.sendRawTx(s.rpc, p.signed, { skipPreflight: true, maxRetries: 0 }); row.route = p.route; if (p.solChange != null) row.solChange = p.solChange; }
    catch (e) { row.state = 'failed'; row.error = e.message; }
  }));
  await save();
  // One status check for every wallet per tick (was one RPC call per wallet every 800ms, which tripped the
  // RPC's rate limit and marked landed buys as failed), and keep re-sending until each one lands.
  let saving = null;
  const saveSoon = () => { saving ||= Promise.resolve().then(() => { saving = null; return save(); }); };
  await S.confirmMany(s.rpc, ready.filter(({ row }) => row.signature).map(({ row, p }) => ({ signature: row.signature, signed: p.signed, row })), {
    onDone: (e, err) => { if (err) { e.row.state = 'failed'; e.row.error = err.message; } else e.row.state = doneState; saveSoon(); },
  });
  await save();
}

async function runSell({ mint, addresses, pct }) {
  { const cur = await session.get('job_buy'); if (cur && !cur.done) throw new Error('A trade is already running. Wait for it to finish.'); }
  if (!b58.isAddress(mint)) throw new Error('That isn\'t a valid coin address');
  if (!addresses.length) throw new Error('Pick at least one wallet');
  pct = Number(pct);
  if (!(pct > 0 && pct <= 100)) throw new Error('Percent must be 1–100');
  const s = await settings();
  const [bal, toks] = await Promise.all([balances(s.rpc, addresses), tokenBalances(s.rpc, mint, addresses)]);
  const job = { side: 'sell', pct, mint, startedAt: Date.now(), done: false, rows: [] };
  for (const a of addresses) {
    const t = toks[a];
    const tokenRaw = BigInt(t.raw) * BigInt(Math.round(pct * 100)) / 10000n;
    const row = { address: a, tokenRaw: tokenRaw.toString(), decimals: t.decimals, state: 'waiting' };
    if (tokenRaw === 0n) { row.state = 'skipped'; row.error = 'Holds none of this coin'; }
    else if (BigInt(bal[a]) < 3_000_000n) { row.state = 'skipped'; row.error = 'Needs ~0.003 SOL for fees'; }
    job.rows.push(row);
  }
  const save = () => session.set('job_buy', job);
  await save();
  keepAlive((async () => {
    try { await fireTogether(s, job, save, (row) => prepareSell(s, row.address, mint, pct, BigInt(row.tokenRaw)), 'sold'); }
    catch (e) { for (const r of job.rows) if (!['sold', 'failed', 'skipped'].includes(r.state)) { r.state = 'failed'; r.error = e.message; } }
    job.done = true; await save(); await logTrade(job);
  })());
  return job;
}

async function runBuy({ mint, addresses, mode, amount }) {
  { const cur = await session.get('job_buy'); if (cur && !cur.done) throw new Error('A trade is already running. Wait for it to finish.'); }
  if (!b58.isAddress(mint)) throw new Error('That isn\'t a valid coin address');
  if (!addresses.length) throw new Error('Pick at least one wallet');
  const s = await settings();
  const bal = await balances(s.rpc, addresses);
  const job = { side: 'buy', mint, startedAt: Date.now(), done: false, rows: [] };
  for (const a of addresses) {
    const have = BigInt(bal[a]);
    let lamports;
    if (mode === 'pct') {
      const pct = Number(amount);
      if (!(pct > 0 && pct <= 100)) throw new Error('Percent must be 1–100');
      lamports = have > RESERVE_LAMPORTS ? (have - RESERVE_LAMPORTS) * BigInt(Math.round(pct * 100)) / 10000n : 0n;
    } else lamports = S.toRaw(String(amount), 9);
    const row = { address: a, lamports: lamports.toString(), state: 'waiting' };
    if (lamports < 1_000_000n) { row.state = 'skipped'; row.error = 'Less than 0.001 SOL to spend'; }
    else if (lamports + RESERVE_LAMPORTS > have) { row.state = 'skipped'; row.error = `Not enough SOL (has ${S.fromRaw(have, 9)})`; }
    job.rows.push(row);
  }
  const save = () => session.set('job_buy', job);
  await save();
  keepAlive((async () => {
    try { await fireTogether(s, job, save, (row) => prepareBuy(s, row.address, mint, BigInt(row.lamports)), 'bought'); }
    catch (e) { for (const r of job.rows) if (!['bought', 'failed', 'skipped'].includes(r.state)) { r.state = 'failed'; r.error = e.message; } }
    job.done = true; await save(); await logTrade(job);
  })());
  return job;
}

// USD prices from Jupiter (best effort; the UI shows nothing when this fails).
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const priceCache = new Map(); // mint -> { usd, at }
async function usdPrices(mints) {
  const out = {};
  const need = [];
  for (const m of new Set(mints)) { const c = priceCache.get(m); if (c && Date.now() - c.at < 15000) out[m] = c.usd; else need.push(m); }
  for (const part of chunk(need, 50)) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch('https://lite-api.jup.ag/price/v3?ids=' + part.join(','), { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) continue;
      const j = await r.json();
      for (const m of part) { const usd = j?.[m]?.usdPrice ?? null; priceCache.set(m, { usd, at: Date.now() }); out[m] = usd; }
    } catch { for (const m of part) out[m] = null; }
  }
  return out;
}

// ---------------- PnL across all wallets (pump.fun public endpoints) ----------------
let pnlCache = { at: 0, key: '', data: null };
async function fetchJson(url, init) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
  try { const r = await fetch(url, { ...(init || {}), signal: ctrl.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
  finally { clearTimeout(t); }
}
// ---------------- PnL from each wallet's on-chain trades (Helius) ----------------
// pump.fun's portfolio only lists coins a wallet still holds, so sold bags drop out of it. With a Helius
// RPC key we read every wallet's own trade history instead: each swap's SOL in/out per coin, wherever it
// was traded. Results are cached per wallet and only new transactions are fetched after the first load.
const HISTORY_DAYS = 30, FIRST_PAGES = 6, MORE_PAGES = 20;
function heliusKey(rpcUrl) { const m = /helius-rpc\.com.*[?&]api-key=([\w-]+)/i.exec(rpcUrl || ''); return m ? m[1] : null; }
let helLast = 0;
async function heliusGet(url) {
  for (let attempt = 1; ; attempt++) {
    const wait = helLast + 250 - Date.now(); if (wait > 0) await sleep(wait);
    helLast = Date.now();
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (r.status === 429 && attempt < 6) { await sleep(800 * attempt); continue; }
    if (!r.ok) throw new Error(`Helius history HTTP ${r.status}`);
    return r.json();
  }
}
// pump.fun bonding curve, PumpSwap AMM and the Pump fee-sharing program: SOL that lands in the wallet from
// one of these with no coin moving is a creator-fee claim.
const PUMP_PROGRAMS = new Set(['6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA', 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ']);
const touchesPump = (tx) => (tx.instructions || []).some(i => PUMP_PROGRAMS.has(i.programId) || (i.innerInstructions || []).some(x => PUMP_PROGRAMS.has(x.programId)));
// Timeline of realized profit for the PnL chart: [unix seconds, SOL].
function addEvent(c, ts, sol) { (c.events ||= []).push([ts, +sol.toFixed(6)]); if (c.events.length > 5000) c.events.splice(0, c.events.length - 5000); }
function applyTrade(tx, addr, c) {
  const mints = c.mints;
  if (tx.transactionError) return;
  let sol = 0; const tok = {};
  for (const ad of tx.accountData || []) {
    if (ad.account === addr) sol += Number(ad.nativeBalanceChange) || 0;
    for (const tb of ad.tokenBalanceChanges || []) {
      if (tb.userAccount !== addr) continue;
      const raw = Number(tb.rawTokenAmount?.tokenAmount) || 0, dec = Number(tb.rawTokenAmount?.decimals) || 0;
      if (tb.mint === WSOL_MINT) { sol += raw; continue; } // wrapped SOL counts as SOL
      (tok[tb.mint] ||= { ui: 0 }).ui += raw / 10 ** dec;
    }
  }
  const changed = Object.keys(tok).filter(m => Math.abs(tok[m].ui) > 0);
  if (!changed.length && sol > 0 && touchesPump(tx)) { c.fees = (c.fees || 0) + sol / 1e9; c.feeClaims = (c.feeClaims || 0) + 1; addEvent(c, tx.timestamp, sol / 1e9); return; }
  for (const m of changed) { const a = (mints[m] ||= { cost: 0, proc: 0, bought: 0, sold: 0, net: 0, first: 0, last: 0 }); a.net += tok[m].ui; }
  if (changed.length !== 1) return; // transfers, multi-coin txs: holdings only, no PnL
  const a = mints[changed[0]], d = tok[changed[0]].ui;
  if (d > 0 && sol < 0) { a.cost += -sol / 1e9; a.bought += d; }
  else if (d < 0 && sol > 0) {
    // profit of this sell at the average price paid so far (only when the buys are in the history)
    if (a.bought > 0) addEvent(c, tx.timestamp, sol / 1e9 - (a.cost / a.bought) * Math.min(-d, Math.max(0, a.bought - a.sold)));
    a.proc += sol / 1e9; a.sold += -d;
  }
  else return;
  a.first = a.first ? Math.min(a.first, tx.timestamp) : tx.timestamp; a.last = Math.max(a.last, tx.timestamp);
}
async function syncHistory(key, addr, c) {
  const since = Date.now() / 1000 - HISTORY_DAYS * 86400;
  const base = `https://mainnet.helius-rpc.com/v0/addresses/${addr}/transactions?api-key=${key}&limit=100`;
  let before = null, newest = null, stop = false, pages = 0;
  const fresh = [];
  while (!stop && pages < (c.newest ? MORE_PAGES : FIRST_PAGES)) {
    const page = await heliusGet(base + (before ? `&before-signature=${before}` : ''));
    pages++;
    if (!Array.isArray(page) || !page.length) break;
    newest ||= page[0].signature;
    for (const tx of page) {
      if (c.newest && tx.signature === c.newest) { stop = true; break; }
      if (!c.newest && tx.timestamp < since) { stop = true; break; }
      fresh.push(tx);
      c.oldest = c.oldest ? Math.min(c.oldest, tx.timestamp) : tx.timestamp;
    }
    before = page[page.length - 1].signature;
    if (page.length < 100) stop = true;
  }
  fresh.sort((x, y) => (x.timestamp || 0) - (y.timestamp || 0));
  for (const tx of fresh) applyTrade(tx, addr, c);
  if (newest) c.newest = newest;
  c.syncedAt = Date.now();
  return c;
}
let chainSyncing = null;
async function chainPnl(key, addresses, force) {
  const all = (await local.get('chainPnl_v3')) || {};
  const stale = addresses.filter(a => force || !all[a] || Date.now() - (all[a].syncedAt || 0) > 180000);
  if (stale.length) {
    chainSyncing ||= (async () => {
      try {
        await pool(stale, 2, async (a) => {
          try { all[a] = await syncHistory(key, a, all[a] || { mints: {} }); all[a].error = null; }
          catch (e) { all[a] = { ...(all[a] || { mints: {} }), error: e.message }; }
        });
        await local.set('chainPnl_v3', all);
      } finally { chainSyncing = null; }
    })();
    await chainSyncing;
  }
  return (await local.get('chainPnl_v3')) || all;
}
async function pnlFromChain(key, addresses, force) {
  const [hist, overview] = await Promise.all([
    chainPnl(key, addresses, force),
    fetchJson('https://profile-api.pump.fun/wallet-overview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallets: addresses }) }).catch(() => ({ wallets: {} })),
  ]);
  const held = (a) => a.net > 1e-6 ? a.net : 0;
  const mints = [...new Set(addresses.flatMap(w => Object.keys(hist[w]?.mints || {})))];
  const openMints = [...new Set(addresses.flatMap(w => Object.entries(hist[w]?.mints || {}).filter(([, a]) => held(a) && a.bought > 0).map(([m]) => m)))];
  const [prices, meta] = await Promise.all([usdPrices([WSOL_MINT, ...openMints]), tokenMeta(mints.filter(m => addresses.some(w => hist[w]?.mints?.[m]?.bought > 0)))]);
  const solUsd = prices[WSOL_MINT] || Object.values(overview?.wallets || {}).find(o => o.sol_price_usd)?.sol_price_usd || 0;
  const wallets = [], positions = [];
  let oldest = 0;
  for (const addr of addresses) {
    const c = hist[addr] || { mints: {} }, ov = overview?.wallets?.[addr] || {};
    if (c.oldest) oldest = oldest ? Math.min(oldest, c.oldest) : c.oldest;
    const w = { address: addr, error: c.error || null, valueUsd: ov.total_value_usd ?? null, sol: ov.native_balance_sol ?? null, realized: 0, unrealized: 0, bought: 0, open: 0, closed: 0, fees: (c.fees || 0) * solUsd, feeSol: c.fees || 0 };
    w.realized += w.fees; // claimed creator fees count as profit
    for (const [mint, a] of Object.entries(c.mints)) {
      if (!(a.bought > 0)) continue; // bought before the history window: no cost basis to measure against
      const ratio = Math.min(1, a.sold / a.bought);
      const realizedSol = a.proc - a.cost * ratio;
      const h = held(a), openCostSol = a.cost * (1 - ratio);
      const price = prices[mint];
      const exited = !h || ratio >= 0.999;
      const valueUsd = !exited && price > 0 ? h * price : null;
      const unrealizedUsd = valueUsd != null ? valueUsd - openCostSol * solUsd : 0;
      const realizedUsd = realizedSol * solUsd;
      const pnlUsd = realizedUsd + unrealizedUsd, costUsd = a.cost * solUsd;
      positions.push({ wallet: addr, mint, live: valueUsd != null, valueUsd, costBasisUsd: exited ? null : openCostSol * solUsd, realizedUsd, name: meta[mint]?.name || null, symbol: meta[mint]?.symbol || null, image: meta[mint]?.icon || null,
        pnlUsd, pct: costUsd > 0 ? pnlUsd / costUsd * 100 : 0, boughtUsd: costUsd, held: h, exited, pnlSol: realizedSol + (valueUsd != null && solUsd ? valueUsd / solUsd - openCostSol : 0), last: a.last });
      w.bought += costUsd; w.realized += realizedUsd; w.unrealized += unrealizedUsd;
      if (exited) w.closed++; else w.open++;
    }
    wallets.push(w);
  }
  const sum = (k) => wallets.reduce((x, w) => x + (Number(w[k]) || 0), 0);
  const data = { at: Date.now(), solPrice: solUsd || null, source: 'chain', historyFrom: oldest ? oldest * 1000 : null,
    totals: { valueUsd: sum('valueUsd'), sol: sum('sol'), realized: sum('realized'), unrealized: sum('unrealized'), bought: sum('bought'), open: sum('open'), closed: sum('closed'), fees: sum('fees'), feeSol: sum('feeSol') },
    wallets, positions: positions.sort((x, y) => y.pnlUsd - x.pnlUsd) };
  data.totals.pnl = data.totals.realized + data.totals.unrealized;
  data.totals.pct = data.totals.bought > 0 ? data.totals.pnl / data.totals.bought * 100 : null;
  data.totals.pnlSol = solUsd ? data.totals.pnl / solUsd : null;
  // Cumulative realized profit over time across the group (sells + creator fees), in SOL.
  const ev = addresses.flatMap(a => hist[a]?.events || []).sort((x, y) => x[0] - y[0]);
  let run = 0; const series = ev.map(([t, v]) => [t * 1000, +(run += v).toFixed(6)]);
  data.series = series.length > 400 ? series.filter((_, i) => i % Math.ceil(series.length / 400) === 0 || i === series.length - 1) : series;
  data.realizedSol = +run.toFixed(6);
  return data;
}

async function pnlAll(addresses, force) {
  const key = addresses.join(',');
  if (!force && pnlCache.data && pnlCache.key === key && Date.now() - pnlCache.at < 20000) return pnlCache.data;
  const hk = heliusKey((await settings()).rpc);
  if (hk) {
    try { const data = await pnlFromChain(hk, addresses, force); pnlCache = { at: Date.now(), key, data }; saveSnap('pnlSnap', key, data); return data; }
    catch (e) { console.warn('chain PnL failed, using pump.fun', e); }
  }
  const [overview, portfolios] = await Promise.all([
    fetchJson('https://profile-api.pump.fun/wallet-overview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallets: addresses }) }).catch(() => ({ wallets: {} })),
    Promise.all(addresses.map(a => fetchJson(`https://frontend-api-v3.pump.fun/user-portfolio/${a}`).then(j => ({ a, j })).catch(() => ({ a, err: 'pump.fun blocks this from websites. Add a Helius RPC in Settings for PnL.' })))),
  ]);
  const wallets = [];
  const positions = [];
  let solPrice = null;
  // pump.fun only reprices a position when that wallet trades, so open bags look frozen.
  // Reprice them at the live price: realized + (held × price now − cost basis).
  const openMints = [...new Set(portfolios.flatMap(({ j }) => (j?.positions || []).filter(p => !p.isExited && Number(p.amountHeld) > 0).map(p => p.coinMint)))];
  const live = openMints.length ? await usdPrices(openMints).catch(() => ({})) : {};
  for (const { a, j, err } of portfolios) {
    const ov = overview?.wallets?.[a] || {};
    if (ov.sol_price_usd) solPrice = ov.sol_price_usd;
    const w = { address: a, error: err || null, valueUsd: ov.total_value_usd ?? null, sol: ov.native_balance_sol ?? null, since: ov.first_tx_timestamp ?? null, realized: 0, unrealized: 0, bought: 0, open: 0, closed: 0 };
    for (const p of j?.positions || []) {
      let pnl = Number(p.pnlUsd) || 0, pct = Number(p.pnlPercentage) || 0, liveUsd = null;
      const held = Number(p.amountHeld) || 0, basis = Number(p.costBasisUsd), price = live[p.coinMint];
      if (!p.isExited && held > 0 && price > 0 && Number.isFinite(basis)) {
        liveUsd = held * price;
        pnl = (Number(p.realizedPnlUsd) || 0) + liveUsd - basis;
        const bought = Number(p.amountBoughtUsd) || basis;
        pct = bought > 0 ? pnl / bought * 100 : pct;
      }
      const row = { wallet: a, live: liveUsd != null, valueUsd: liveUsd ?? (Number(p.valueUsd) || null), costBasisUsd: Number.isFinite(basis) ? basis : null, realizedUsd: Number(p.realizedPnlUsd) || 0, mint: p.coinMint, name: p.coin?.name || p.callout?.coin?.name || null, symbol: p.coin?.symbol || p.callout?.coin?.symbol || null, image: p.coin?.imageUri || p.coin?.image_uri || null, pnlUsd: pnl, pct, boughtUsd: Number(p.amountBoughtUsd) || 0, held: Number(p.amountHeld) || 0, exited: !!p.isExited };
      positions.push(row);
      w.bought += row.boughtUsd;
      if (row.exited) { w.realized += pnl; w.closed++; } else { w.unrealized += pnl; w.open++; }
    }
    wallets.push(w);
  }
  const sum = (k) => wallets.reduce((x, w) => x + (Number(w[k]) || 0), 0);
  const data = {
    at: Date.now(), solPrice,
    totals: { valueUsd: sum('valueUsd'), sol: sum('sol'), realized: sum('realized'), unrealized: sum('unrealized'), bought: sum('bought'), open: sum('open'), closed: sum('closed') },
    wallets, positions: positions.sort((x, y) => y.pnlUsd - x.pnlUsd),
  };
  data.totals.pnl = data.totals.realized + data.totals.unrealized;
  data.totals.pct = data.totals.bought > 0 ? data.totals.pnl / data.totals.bought * 100 : null;
  pnlCache = { at: Date.now(), key, data };
  saveSnap('pnlSnap', key, data);
  return data;
}

// ---------------- bundle trade log + all-wallet portfolio ----------------
// Callouts and sends, for the Activity tab (bundle trades use tradeLog below).
async function logActivity(entry) {
  try {
    const log = (await local.get('activityLog')) || [];
    log.unshift(entry);
    await local.set('activityLog', log.slice(0, 60));
  } catch {}
}
async function distributeLogged(msg) {
  const base = { kind: 'send', at: Date.now(), from: msg.from, asset: { kind: msg.asset?.kind, mint: msg.asset?.mint || null }, label: String(msg.label || '').slice(0, 40) || null, per: String(msg.perRecipient), decimals: msg.asset?.kind === 'SOL' ? 9 : (msg.asset?.decimals ?? 0), recipients: [...new Set(msg.recipients || [])].filter(r => r !== msg.from) };
  try {
    const r = await distribute(msg);
    await logActivity({ ...base, notSent: r.notSent, signatures: r.results.filter(x => x.ok).map(x => x.signature), error: r.results.find(x => !x.ok)?.error || null });
    return r;
  } catch (e) {
    await logActivity({ ...base, notSent: base.recipients, signatures: [], error: e.message });
    throw e;
  }
}
async function logTrade(job) {
  try {
    const log = (await local.get('tradeLog')) || [];
    log.unshift({ at: job.startedAt, side: job.side, mint: job.mint, pct: job.pct || null,
      rows: job.rows.map(r => ({ address: r.address, state: r.state, lamports: r.lamports || null, tokenRaw: r.tokenRaw || null, decimals: r.decimals ?? null, signature: r.signature || null, solChange: r.solChange ?? null, error: r.error || null })) });
    await local.set('tradeLog', log.slice(0, 60));
  } catch {}
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
const metaCache = new Map(); // mint -> { symbol, name, icon, at }
async function tokenMeta(mints) {
  const out = {}, need = [];
  for (const m of new Set(mints)) { const c = metaCache.get(m); if (c && Date.now() - c.at < 3600000) out[m] = c; else need.push(m); }
  for (const part of chunk(need, 50)) {
    try {
      const j = await fetchJson('https://lite-api.jup.ag/tokens/v2/search?query=' + part.join(','));
      for (const t of Array.isArray(j) ? j : []) { const v = { symbol: t.symbol || null, name: t.name || null, icon: t.icon || null, at: Date.now() }; metaCache.set(t.id, v); out[t.id] = v; }
    } catch {}
  }
  return out;
}
// Last result per wallet set, kept in storage so the popup can show it instantly (even after Chrome
// stops the service worker) while fresh numbers load in the background.
async function saveSnap(name, key, data) {
  try {
    const all = (await local.get(name)) || {};
    all[key] = data;
    const keys = Object.keys(all);
    if (keys.length > 6) for (const k of keys.sort((x, y) => (all[x]?.at || 0) - (all[y]?.at || 0)).slice(0, keys.length - 6)) delete all[k];
    await local.set(name, all);
  } catch {}
}
async function loadSnap(name, key) { try { return ((await local.get(name)) || {})[key] || null; } catch { return null; } }
const scopeKey = async () => (await scopedWallets()).map(w => w.address).join(',');

// Token accounts of one wallet (both token programs, fetched at the same time).
async function tokenAccounts(rpcUrl, a) {
  const [l1, l2] = await Promise.all([S.TOKEN_PROGRAM, S.TOKEN_2022_PROGRAM].map(pid =>
    S.rpc(rpcUrl, 'getTokenAccountsByOwner', [a, { programId: pid }, { encoding: 'jsonParsed', commitment: 'confirmed' }], 2).then(r => ({ pid, r }))));
  const toks = [], empty = [];
  for (const { pid, r } of [l1, l2]) for (const acc of r.value) {
    const t = acc.account.data.parsed.info;
    if (t.tokenAmount.amount !== '0') toks.push({ mint: t.mint, account: acc.pubkey, program: pid, raw: t.tokenAmount.amount, decimals: t.tokenAmount.decimals, ui: Number(t.tokenAmount.uiAmountString) });
    else if (t.state !== 'frozen') empty.push({ account: acc.pubkey, program: pid, lamports: String(acc.account.lamports || 0), mint: t.mint });
  }
  return { toks, empty };
}

let portCache = { at: 0, key: '', data: null };
const TOK_MAX_AGE = 120000; // re-scan a wallet's coins at least every 2 minutes even if its SOL didn't move
async function portfolioAll(force) {
  const wallets = await scopedWallets();
  const addresses = wallets.map(w => w.address);
  const key = addresses.join(',');
  if (!force && portCache.data && portCache.key === key && Date.now() - portCache.at < 30000) return portCache.data;
  const s = await settings();
  // PnL can take much longer (wallet history); use what's already known and let it refresh on its own.
  const pnlData = pnlCache.data && pnlCache.key === key ? pnlCache.data : await loadSnap('pnlSnap', key);
  // SOL balances first: one request per 100 wallets. Coin holdings cost 2 requests per wallet, so only
  // re-scan wallets whose SOL moved (any buy/sell/fee changes it), that had an error, or whose scan is
  // older than TOK_MAX_AGE. Idle refreshes go from ~2 requests per wallet to about one in total.
  const prev = portCache.data && portCache.key === key ? portCache.data : await loadSnap('portSnap', key);
  const prevBy = new Map((prev?.wallets || []).map(w => [w.address, w]));
  let bal;
  try { bal = await balances(s.rpc, addresses); }
  catch (e) {
    // Don't blank the whole wallet list on one failed balance read: keep the last known SOL and say so.
    if (!prev) throw e;
    bal = Object.fromEntries(addresses.map(a => [a, prevBy.get(a)?.lamports ?? '0']));
  }
  const holdings = await pool(addresses, 8, async (a) => {
    const pw = prevBy.get(a);
    if (!force && pw && !pw.error && pw.tokAcc && pw.empty && pw.lamports === String(bal[a] ?? 0) && Date.now() - (pw.tokAt || prev.at || 0) < TOK_MAX_AGE) {
      return { a, toks: pw.tokAcc.map(t => ({ ...t, ui: Number(t.raw) / 10 ** t.decimals })), empty: pw.empty, tokAt: pw.tokAt || prev.at, reused: true };
    }
    try { const { toks, empty } = await tokenAccounts(s.rpc, a); return { a, toks, empty, tokAt: Date.now() }; }
    catch (e) {
      // Keep the last good holdings for this wallet instead of showing it as empty.
      if (pw?.tokAcc) return { a, toks: pw.tokAcc.map(t => ({ ...t, ui: Number(t.raw) / 10 ** t.decimals })), empty: pw.empty || null, tokAt: pw.tokAt || prev.at, stale: e.message };
      return { a, toks: [], empty: null, error: e.message };
    }
  });
  // PnL history shares the same RPC key / rate limit, so start it only after balances are in.
  if (!(pnlCache.key === key && Date.now() - pnlCache.at < 20000)) pnlAll(addresses, false).catch(() => {});
  const mints = [...new Set(holdings.flatMap(h => h.toks.map(t => t.mint)))];
  const [prices, meta] = await Promise.all([usdPrices([WSOL_MINT, ...mints]), tokenMeta(mints)]);
  const solPrice = prices[WSOL_MINT] ?? pnlData?.solPrice ?? null;
  const pnlBy = new Map((pnlData?.positions || []).map(p => [p.wallet + ':' + p.mint, p]));
  const coins = new Map();
  const walletRows = addresses.map(a => {
    const h = holdings.find(x => x.a === a) || { toks: [] };
    const sol = Number(S.fromRaw(BigInt(bal[a] || 0), 9));
    let tokUsd = 0;
    for (const t of h.toks) {
      const usd = prices[t.mint] != null ? t.ui * prices[t.mint] : null;
      if (usd != null) tokUsd += usd;
      const p = pnlBy.get(a + ':' + t.mint);
      const c = coins.get(t.mint) || { mint: t.mint, symbol: meta[t.mint]?.symbol || null, name: meta[t.mint]?.name || null, icon: meta[t.mint]?.icon || null, price: prices[t.mint] ?? null, totalUi: 0, totalUsd: 0, pnlUsd: 0, hasPnl: false, holders: [] };
      c.totalUi += t.ui; if (usd != null) c.totalUsd += usd;
      let hp = p ? p.pnlUsd : null, hpct = p ? p.pct : null;
      if (p && !p.exited && p.costBasisUsd != null && usd != null) { hp = p.realizedUsd + usd - p.costBasisUsd; hpct = p.boughtUsd > 0 ? hp / p.boughtUsd * 100 : hpct; }
      if (p) { c.pnlUsd += hp; c.hasPnl = true; }
      c.holders.push({ address: a, ui: t.ui, raw: t.raw, decimals: t.decimals, usd, pnlUsd: hp, pct: hpct });
      coins.set(t.mint, c);
    }
    return { address: a, sol, lamports: String(bal[a] || 0), solUsd: solPrice != null ? sol * solPrice : null, tokenUsd: tokUsd, coinCount: h.toks.length, empty: h.empty || null, tokAcc: h.error ? null : h.toks.map(({ mint, account, program, raw, decimals }) => ({ mint, account, program, raw, decimals })), tokAt: h.tokAt || null, error: h.error || null, stale: h.stale || null };
  });
  const coinList = [...coins.values()].map(c => ({ ...c, holders: c.holders.sort((x, y) => (y.usd ?? 0) - (x.usd ?? 0)) }))
    .sort((x, y) => (y.totalUsd - x.totalUsd) || (y.holders.length - x.holders.length));
  const data = { at: Date.now(), solPrice, wallets: walletRows, coins: coinList,
    totals: { sol: walletRows.reduce((x, w) => x + w.sol, 0), usd: walletRows.reduce((x, w) => x + (w.solUsd || 0) + w.tokenUsd, 0), tokenUsd: walletRows.reduce((x, w) => x + w.tokenUsd, 0), coins: coinList.length } };
  portCache = { at: Date.now(), key, data };
  saveSnap('portSnap', key, data);
  return data;
}

// ---------------- sweep: move SOL or any coin from many wallets into one ----------------
// Each transaction carries several wallets' transfers (every source signs). When the destination is one of
// your wallets (and has a little SOL) it pays the fees, so sources can go to exactly 0. Empty token
// accounts, and coin accounts emptied by a 100% sweep, are closed in the same transactions; their rent
// goes to the destination.
const SWEEP_MAX_CLOSES = 12;
const RENT_MIN = 890_880n;          // a SOL account that isn't emptied must keep at least this
const ATA_RENT_MAX = 2_500_000n;    // destination token account (Token-2022 accounts can be a bit bigger)

async function sweepPlan({ addresses }) {
  const s = await settings();
  const uniq = [...new Set(addresses)].filter(a => b58.isAddress(a));
  const bal = await balances(s.rpc, uniq);
  // Token accounts: reuse the portfolio scan if it's recent, scan the rest now.
  const snap = portCache.data && Date.now() - portCache.at < 300000 ? portCache.data : null;
  const by = {}, need = [];
  for (const a of uniq) { const w = snap?.wallets.find(x => x.address === a); if (w?.empty && w?.tokAcc) by[a] = { empty: w.empty, toks: w.tokAcc }; else need.push(a); }
  await pool(need, 8, async (a) => { try { by[a] = await tokenAccounts(s.rpc, a); } catch { by[a] = { empty: [], toks: [] }; } });
  const mints = [...new Set(uniq.flatMap(a => (by[a]?.toks || []).map(t => t.mint)))];
  const meta = await tokenMeta(mints).catch(() => ({}));
  return {
    wallets: uniq.map(a => ({ address: a, lamports: bal[a] || '0', empty: by[a]?.empty || [], toks: (by[a]?.toks || []).map(({ mint, account, program, raw, decimals }) => ({ mint, account, program, raw, decimals })) })),
    meta: Object.fromEntries(mints.map(m => [m, { symbol: meta[m]?.symbol || null, name: meta[m]?.name || null, icon: meta[m]?.icon || null }])),
  };
}

function sweepFee(numSigners, cu, cuPrice) { return 5000n * BigInt(numSigners) + (cuPrice * BigInt(cu) + 999_999n) / 1_000_000n; }

// Build one batch.
//   payer: an address (destination or a fixed wallet) or null = the source with the most SOL in this batch
//   asset: null for SOL, or { mint, program, decimals, destAta } for a coin
//   pct:   1-100, share of each wallet's balance to send
function sweepBuild(items, to, payer, cuPrice, blockhash, asset, pct) {
  const P = BigInt(pct);
  const closes = items.reduce((n, it) => n + it.close.length, 0);
  const toks = asset ? items.reduce((n, it) => n + it.tok.length, 0) : 0;
  const cu = 1500 + 400 * items.length + 6000 * closes + (asset ? 35000 + 9000 * toks : 0);
  const pay = payer || items.reduce((m, it) => BigInt(it.lamports) > BigInt(m.lamports) ? it : m).address;
  const signers = new Set([pay, ...items.map(i => i.address)]);
  const fee = sweepFee(signers.size, cu, cuPrice);
  const ixs = [S.ix.setCuLimit(cu)];
  if (cuPrice > 0n) ixs.push(S.ix.setCuPrice(cuPrice));
  const sent = {};
  if (asset) {
    ixs.push(S.ix.createAtaIdempotent(pay, asset.destAta, to, asset.mint, asset.program));
    for (const it of items) {
      let total = 0n;
      for (const t of it.tok) {
        const amt = BigInt(t.raw) * P / 100n;
        if (amt > 0n) { ixs.push(S.ix.transferChecked(t.account, asset.mint, asset.destAta, it.address, amt, asset.decimals, asset.program)); total += amt; }
      }
      sent[it.address] = total;
    }
    const payItem = items.find(i => i.address === pay);
    const payLam = payItem ? BigInt(payItem.lamports) : null;
    if (payLam != null && payLam < fee + ATA_RENT_MAX) throw new Error('Not enough SOL in these wallets to pay the fee');
  }
  for (const it of items) for (const e of it.close) ixs.push(S.ix.closeAccount(e.account, to, it.address, e.program));
  if (!asset) {
    for (const it of items) {
      const lam = BigInt(it.lamports), isPay = it.address === pay;
      let amt = P === 100n ? lam : lam * P / 100n;
      if (isPay) amt = P === 100n ? lam - fee : amt;
      if (P !== 100n) { const keep = RENT_MIN + (isPay ? fee : 0n); if (lam - amt < keep) amt = lam - keep; }
      if (amt < 0n) { if (isPay) throw new Error('Not enough SOL to pay the fee'); amt = 0n; }
      sent[it.address] = amt;
      if (amt > 0n) ixs.push(S.ix.solTransfer(it.address, to, amt));
    }
  }
  const { message, numSigners: n } = S.compileMessage(pay, ixs, blockhash);
  return { message, numSigners: n, size: 1 + 64 * n + message.length, fee, payer: pay, sent };
}

// Fresh amounts for known token accounts, one call per 100 accounts.
async function freshTokenAmounts(rpcUrl, accounts) {
  const out = {};
  for (const part of chunk(accounts, 100)) {
    const r = await S.rpc(rpcUrl, 'getMultipleAccounts', [part, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
    part.forEach((acc, i) => { const v = r.value[i]; out[acc] = v?.data?.parsed?.info?.tokenAmount?.amount ?? '0'; });
  }
  return out;
}

async function sweepRun({ to, addresses, closeEmpty, mint, pct }) {
  const s = await settings();
  const keys = await session.get('keys');
  if (!keys) throw new Error('Wallet is locked');
  if (!b58.isAddress(to)) throw new Error("That isn't a valid Solana address");
  pct = Math.round(Number(pct) || 100);
  if (!(pct >= 1 && pct <= 100)) throw new Error('Percentage must be between 1 and 100');
  const seedOf = new Map(keys.map(k => [k.address, b58.decode(k.seed)]));
  const sources = [...new Set(addresses)].filter(a => a !== to && seedOf.has(a));
  if (!sources.length) throw new Error('Pick at least one wallet to sweep from');
  await touchLock();
  const cuPrice = BigInt(Math.max(0, Number(s.priorityMicroLamports) || 0));
  const isCoin = !!mint && mint !== 'SOL';

  const [plan, destBal] = await Promise.all([sweepPlan({ addresses: sources }), balances(s.rpc, [to])]);
  let asset = null, items;
  if (isCoin) {
    const accs = plan.wallets.flatMap(w => w.toks.filter(t => t.mint === mint));
    if (!accs.length) throw new Error('None of those wallets hold that coin');
    const fresh = await freshTokenAmounts(s.rpc, accs.map(t => t.account));
    const { program, decimals } = accs[0];
    asset = { mint, program, decimals, destAta: await S.getAta(to, mint, program) };
    items = plan.wallets.map(w => {
      const tok = w.toks.filter(t => t.mint === mint && t.account !== asset.destAta).map(t => ({ ...t, raw: fresh[t.account] || '0' })).filter(t => BigInt(t.raw) > 0n);
      // A 100% sweep empties these coin accounts, so close them and get their rent back.
      const close = pct === 100 && closeEmpty ? tok.map(t => ({ account: t.account, program: t.program, lamports: String(S.ATA_RENT_LAMPORTS) })) : [];
      return { address: w.address, lamports: w.lamports, tok, close };
    }).filter(it => it.tok.length);
  } else {
    items = plan.wallets.map(w => ({ address: w.address, lamports: w.lamports, tok: [], close: closeEmpty ? w.empty.slice(0, SWEEP_MAX_CLOSES) : [] }))
      .filter(it => BigInt(it.lamports) > 0n || it.close.length);
  }
  if (!items.length) throw new Error(isCoin ? 'Nothing to sweep. Those wallets have none of that coin.' : 'Nothing to sweep. Those wallets are already empty.');

  // Who pays fees: the destination if it's yours and funded; otherwise for coins the source with the most SOL
  // (one wallet for every batch), and for SOL the richest source within each batch.
  const destOwn = seedOf.has(to);
  const need = 300_000n + 6000n * BigInt(items.length * 2) + (isCoin ? ATA_RENT_MAX : 0n);
  let payer = null;
  if (destOwn && BigInt(destBal[to] || 0) >= need) payer = to;
  else if (isCoin) {
    const rich = items.reduce((m, it) => BigInt(it.lamports) > BigInt(m.lamports) ? it : m);
    if (BigInt(rich.lamports) < need) throw new Error(`Not enough SOL to pay fees. Put about ${S.fromRaw(need, 9)} SOL in ${destOwn ? 'the destination wallet' : 'one of these wallets'} first.`);
    payer = rich.address;
  } else for (const it of items) it.close = BigInt(it.lamports) > 50_000n ? it.close : []; // a wallet with no SOL can't pay to close

  // Pack wallets into transactions until the 1232-byte limit.
  const fits = (batch) => { try { return sweepBuild(batch, to, payer, cuPrice, S.SYSTEM_PROGRAM, asset, pct).size <= 1232; } catch { return false; } };
  const batches = []; let cur = [];
  for (const it0 of items) {
    const it = { ...it0, close: [...it0.close] };
    if (cur.length && !fits([...cur, it])) { batches.push(cur); cur = []; }
    while (it.close.length && !fits([...cur, it])) it.close.pop();
    cur.push(it);
  }
  if (cur.length) batches.push(cur);

  const { value } = await S.rpc(s.rpc, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const signBatch = async (batch) => {
    const b = sweepBuild(batch, to, payer, cuPrice, value.blockhash, asset, pct);
    let tx = S.serializeTx(b.message, Array.from({ length: b.numSigners }, () => new Uint8Array(64)));
    for (const a of new Set([b.payer, ...batch.map(i => i.address)])) tx = S.applySignature(tx, a, await K.sign(seedOf.get(a), b.message));
    return { tx, b };
  };

  const results = await Promise.all(batches.map(async (batch) => {
    const row = { addresses: batch.map(i => i.address), closed: 0, amount: '0', rent: '0', ok: false };
    try {
      let { tx, b } = await signBatch(batch);
      let signature;
      try { signature = await S.sendRawTx(s.rpc, tx); }
      catch (e) {
        if (!batch.some(i => i.close.length)) throw e;
        // A token account couldn't be closed (a coin with extra rules, or not empty any more): retry without closing.
        batch = batch.map(i => ({ ...i, close: [] })).filter(i => isCoin || BigInt(i.lamports) > 0n);
        if (!batch.length) throw e;
        ({ tx, b } = await signBatch(batch));
        signature = await S.sendRawTx(s.rpc, tx);
        row.addresses = batch.map(i => i.address);
        row.note = "Couldn't close some token accounts, sent without closing them";
      }
      Object.assign(row, { signature, signed: tx, fee: String(b.fee),
        closed: batch.reduce((n, i) => n + i.close.length, 0),
        amount: String(Object.values(b.sent).reduce((x, v) => x + v, 0n)),
        rent: String(batch.reduce((x, i) => x + i.close.reduce((y, e) => y + BigInt(e.lamports || 0), 0n), 0n)) });
    } catch (e) { row.error = e.message; }
    return row;
  }));

  const pendingRows = results.filter(r => r.signature);
  await S.confirmMany(s.rpc, pendingRows.map(r => ({ signature: r.signature, signed: r.signed })), {
    onDone: (entry, err) => { const r = pendingRows.find(x => x.signature === entry.signature); if (err) r.error = err.message; else r.ok = true; },
  });
  for (const r of results) delete r.signed;
  portCache.at = 0; pnlCache.at = 0;
  const done = results.filter(r => r.ok);
  return { to, mint: isCoin ? mint : 'SOL', decimals: isCoin ? asset.decimals : 9, pct, results,
    amount: String(done.reduce((x, r) => x + BigInt(r.amount), 0n)),
    rent: String(done.reduce((x, r) => x + BigInt(r.rent), 0n)),
    closed: done.reduce((n, r) => n + r.closed, 0),
    wallets: done.reduce((n, r) => n + r.addresses.length, 0) };
}

// ---------------- dapp approvals ----------------
const pending = new Map(); // id -> { req, resolve }

async function requestApproval(req) {
  const id = crypto.randomUUID();
  const p = new Promise(resolve => pending.set(id, { req, resolve }));
  const win = await chrome.windows.create({ url: `approve.html?id=${id}`, type: 'popup', width: 400, height: 640 });
  const onRemoved = (wid) => { if (wid === win.id && pending.has(id)) { pending.get(id).resolve(false); pending.delete(id); } };
  chrome.windows.onRemoved.addListener(onRemoved);
  const ok = await keepAlive(p);
  chrome.windows.onRemoved.removeListener(onRemoved);
  return ok;
}

async function isConnected(origin) { return ((await local.get('connectedOrigins')) || []).includes(origin); }

async function currentAccount() {
  const address = await local.get('selected');
  if (!address) throw new Error('No wallet selected in the extension');
  return address;
}

async function handleDapp(msg, origin) {
  if (!/^https:\/\/([a-z0-9-]+\.)*pump\.fun$/.test(origin)) throw new Error('Origin not allowed');
  const unlocked = !!(await session.get('keys'));

  if (msg.method === 'connect') {
    if (await isConnected(origin) && unlocked) return { address: await currentAccount() };
    if (msg.silent) return { address: null };
    const ok = await requestApproval({ kind: 'connect', origin });
    if (!ok) throw new Error('User rejected the request');
    const list = new Set((await local.get('connectedOrigins')) || []); list.add(origin);
    await local.set('connectedOrigins', [...list]);
    return { address: await currentAccount() };
  }
  if (msg.method === 'disconnect') {
    await local.set('connectedOrigins', ((await local.get('connectedOrigins')) || []).filter(o => o !== origin));
    return {};
  }
  if (!(await isConnected(origin))) throw new Error('Not connected');
  const address = await currentAccount();
  if (msg.address && msg.address !== address) throw new Error('Selected wallet changed — reconnect');

  if (msg.method === 'signMessage') {
    const message = Uint8Array.from(atob(msg.message), c => c.charCodeAt(0));
    const text = new TextDecoder('utf-8', { fatal: false }).decode(message);
    if (!(await requestApproval({ kind: 'signMessage', origin, address, text }))) throw new Error('User rejected the request');
    const sig = await K.sign(await seedFor(address), message);
    return { signature: b58.encode(sig) };
  }
  if (msg.method === 'signTransaction' || msg.method === 'signAndSendTransaction') {
    const txs = msg.transactions.map(t => Uint8Array.from(atob(t), c => c.charCodeAt(0)));
    for (const t of txs) if (!S.splitTx(t).signerKeys.includes(address)) throw new Error('Transaction does not need this wallet');
    const s = await settings();
    let simulation = null;
    try { simulation = await simulate(s.rpc, txs[0], address); } catch (e) { simulation = { error: e.message }; }
    if (!(await requestApproval({ kind: 'signTransaction', origin, address, count: txs.length, send: msg.method === 'signAndSendTransaction', simulation }))) throw new Error('User rejected the request');
    const seed = await seedFor(address);
    const out = [];
    for (const t of txs) {
      const { message } = S.splitTx(t);
      const signed = S.applySignature(t, address, await K.sign(seed, message));
      if (msg.method === 'signAndSendTransaction') out.push(await S.sendRawTx(s.rpc, signed));
      else { let str = ''; for (const b of signed) str += String.fromCharCode(b); out.push(btoa(str)); }
    }
    return { results: out };
  }
  throw new Error('Unsupported method');
}

// Preview what a transaction does to this wallet: SOL change plus token balances in/out.
const TOKEN_PROGRAMS = new Set([S.TOKEN_PROGRAM, S.TOKEN_2022_PROGRAM]);
function parseTokenAccount(b64, wantOwner) {
  try {
    const d = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    if (d.length < 165) return null;
    if (b58.encode(d.slice(32, 64)) !== wantOwner) return null;
    let amt = 0n; for (let i = 7; i >= 0; i--) amt = (amt << 8n) | BigInt(d[64 + i]);
    return { mint: b58.encode(d.slice(0, 32)), amount: amt };
  } catch { return null; }
}
function messageKeys(message) {
  let off = (message[0] & 0x80) ? 1 : 0;
  off += 3;
  const [n, l] = S.readCompactU16(message, off); off += l;
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(b58.encode(message.slice(off + i * 32, off + (i + 1) * 32)));
  return keys;
}
async function simulate(rpcUrl, tx, address) {
  let str = ''; for (const b of tx) str += String.fromCharCode(b);
  const { message } = S.splitTx(tx);
  // Static keys in the tx (v0 lookup-table keys aren't visible, so a buy through Jupiter may show only SOL).
  const keys = [...new Set([address, ...messageKeys(message)])].slice(0, 40);
  const [pre, sim] = await Promise.all([
    S.rpc(rpcUrl, 'getMultipleAccounts', [keys, { encoding: 'base64', commitment: 'confirmed' }]),
    S.rpc(rpcUrl, 'simulateTransaction', [btoa(str), { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed', accounts: { encoding: 'base64', addresses: keys } }]),
  ]);
  if (sim.value.err) {
    const logs = (sim.value.logs || []).filter(l => /error|failed|insufficient/i.test(l)).slice(-2).join(' · ');
    return { error: 'Simulation failed: ' + (logs || JSON.stringify(sim.value.err)) };
  }
  const out = { solChange: null, tokens: [] };
  const deltas = new Map();
  keys.forEach((k, i) => {
    const a = pre.value[i], b = sim.value.accounts?.[i];
    if (k === address) { if (b && a) out.solChange = (Number(b.lamports) - Number(a.lamports)) / 1e9; return; }
    const before = a && TOKEN_PROGRAMS.has(a.owner) ? parseTokenAccount(a.data[0], address) : null;
    const after = b && TOKEN_PROGRAMS.has(b.owner) ? parseTokenAccount(b.data[0], address) : null;
    const mint = (after || before)?.mint; if (!mint) return;
    deltas.set(mint, (deltas.get(mint) || 0n) + (after?.amount || 0n) - (before?.amount || 0n));
  });
  const mints = [...deltas].filter(([, d]) => d !== 0n).map(([m]) => m);
  if (mints.length) {
    let meta = {};
    try {
      const info = await S.rpc(rpcUrl, 'getMultipleAccounts', [mints, { encoding: 'jsonParsed' }]);
      mints.forEach((m, i) => { meta[m] = { decimals: info.value[i]?.data?.parsed?.info?.decimals ?? 0 }; });
      const assets = await S.rpc(rpcUrl, 'getAssetBatch', { ids: mints }).catch(() => null);
      for (const a of assets || []) if (a?.id && meta[a.id]) meta[a.id].symbol = a.content?.metadata?.symbol || a.token_info?.symbol;
    } catch {}
    for (const m of mints) out.tokens.push({ mint: m, symbol: meta[m]?.symbol || null, change: S.fromRaw(deltas.get(m) < 0n ? -deltas.get(m) : deltas.get(m), meta[m]?.decimals ?? 0), negative: deltas.get(m) < 0n });
  }
  return out;
}

// ---------------- message router ----------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    // Messages from pump.fun pages come through the content-script bridge.
    if (msg.type === 'dapp' || msg.type === 'captured' || msg.type === 'captureLog' || msg.type === 'thesisSign' || msg.type === 'recNeeded') {
      const origin = new URL(sender.url || sender.tab?.url).origin;
      if (!/^https:\/\/([a-z0-9-]+\.)*pump\.fun$/.test(origin)) throw new Error('Origin not allowed');
      if (msg.type === 'captured') return storeCaptured(msg.kind, msg.tpl);
      if (msg.type === 'captureLog') return appendTeachLog(msg.entry || {});
      if (msg.type === 'thesisSign') return thesisSign(msg, sender.tab?.id);
      if (msg.type === 'recNeeded') return recNeeded();
      return handleDapp(msg, origin);
    }
    // Everything else must come from the extension's own pages.
    if (sender.id !== chrome.runtime.id || !String(sender.url || '').startsWith(chrome.runtime.getURL(''))) throw new Error('Forbidden');
    switch (msg.type) {
      case 'getState': return state();
      case 'setup': {
        if (await local.get('vault')) throw new Error('Vault already exists');
        if (!msg.password || msg.password.length < 8) throw new Error('Use at least 8 characters');
        await saveVault(msg.password, []);
        await touchLock();
        return state();
      }
      case 'unlock': await unlock(msg.password); return state();
      case 'lock': await lock(); return state();
      case 'addWallet': {
        const keys = await unlock(msg.password);
        const kp = await K.keypairFromSecret(msg.secret);
        if (keys.some(k => k.address === kp.address)) throw new Error('Wallet already added');
        keys.push({ name: msg.name || `Wallet ${keys.length + 1}`, address: kp.address, seed: b58.encode(kp.seed) });
        await saveVault(msg.password, keys);
        if (!(await local.get('selected'))) { await local.set('selected', kp.address); broadcastAccount(); }
        return state();
      }
      case 'addWallets': {
        const keys = await unlock(msg.password);
        const report = { added: [], skipped: [] };
        for (const [n, e] of (msg.entries || []).entries()) {
          try {
            const kp = await K.keypairFromSecret(e.secret);
            if (keys.some(k => k.address === kp.address)) { report.skipped.push({ line: n + 1, reason: 'already added' }); continue; }
            keys.push({ name: e.name || `Wallet ${keys.length + 1}`, address: kp.address, seed: b58.encode(kp.seed) });
            report.added.push(kp.address);
          } catch (err) { report.skipped.push({ line: n + 1, reason: err.message }); }
        }
        if (report.added.length) {
          await saveVault(msg.password, keys);
          if (!(await local.get('selected'))) { await local.set('selected', report.added[0]); broadcastAccount(); }
        }
        return { ...(await state()), report };
      }
      case 'createWallet': {
        const keys = await unlock(msg.password);
        const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
        const seed = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).slice(16);
        const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
        const address = b58.encode(pub);
        keys.push({ name: msg.name || `Wallet ${keys.length + 1}`, address, seed: b58.encode(seed) });
        await saveVault(msg.password, keys);
        if (!(await local.get('selected'))) { await local.set('selected', address); broadcastAccount(); }
        // Shown once so it can be backed up (same format Phantom imports).
        return { ...(await state()), created: { address, secret: b58.encode(new Uint8Array([...seed, ...pub])) } };
      }
      case 'createWallets': {
        const n = Math.floor(Number(msg.count));
        if (!(n >= 1 && n <= 500)) throw new Error('Make between 1 and 500 wallets at a time');
        const keys = await unlock(msg.password);
        const prefix = String(msg.prefix || '').trim().slice(0, 30) || 'Wallet';
        const created = [];
        for (let i = 0; i < n; i++) {
          const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
          const seed = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).slice(16);
          const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
          const address = b58.encode(pub);
          let k = 1, name = `${prefix} ${k}`;
          while (keys.some(x => x.name === name)) name = `${prefix} ${++k}`;
          keys.push({ name, address, seed: b58.encode(seed) });
          created.push({ name, address, secret: b58.encode(new Uint8Array([...seed, ...pub])) });
        }
        await saveVault(msg.password, keys);
        if (!(await local.get('selected'))) { await local.set('selected', created[0].address); broadcastAccount(); }
        return { ...(await state()), createdMany: created };
      }
      case 'removeWallet': {
        const keys = (await unlock(msg.password)).filter(k => k.address !== msg.address);
        await saveVault(msg.password, keys);
        if ((await local.get('selected')) === msg.address) { await local.set('selected', keys[0]?.address || null); broadcastAccount(); }
        return state();
      }
      case 'removeWallets': {
        const drop = new Set(msg.addresses || []);
        if (!drop.size) throw new Error('Pick at least one wallet');
        const all = await unlock(msg.password);
        const keys = all.filter(k => !drop.has(k.address));
        await saveVault(msg.password, keys);
        if (drop.has(await local.get('selected'))) { await local.set('selected', keys[0]?.address || null); broadcastAccount(); }
        return { ...(await state()), removed: all.length - keys.length };
      }
      case 'renameWallet': {
        const wallets = (await local.get('wallets')) || [];
        const name = String(msg.name || '').trim().slice(0, 40);
        if (!name) throw new Error('Name can\'t be empty');
        const w = wallets.find(x => x.address === msg.address); if (w) w.name = name;
        await local.set('wallets', wallets);
        const keys = await session.get('keys');
        if (keys) { const k = keys.find(x => x.address === msg.address); if (k) k.name = name; await session.set('keys', keys); }
        return state();
      }
      case 'select': { await local.set('selected', msg.address); const g = await groupsInfo(); const r = (await local.get('groupSelected')) || {}; r[g.active] = msg.address; await local.set('groupSelected', r); await broadcastAccount(); return state(); }
      case 'saveFriends': {
        for (const f of msg.friends) if (!b58.isAddress(f.address)) throw new Error('Bad address: ' + f.address);
        await local.set('friends', msg.friends); return state();
      }
      case 'saveSettings': await local.set('settings', { ...(await settings()), ...msg.settings }); return state();
      case 'holdings': {
        const h = await S.getHoldings((await settings()).rpc, msg.address);
        const prices = await usdPrices([WSOL_MINT, ...h.tokens.map(t => t.mint)]);
        for (const t of h.tokens) { const p = prices[t.mint]; t.usd = p == null ? null : Number(t.ui) * p; }
        const solUsd = prices[WSOL_MINT] == null ? null : Number(S.fromRaw(h.lamports, 9)) * prices[WSOL_MINT];
        return { sol: S.fromRaw(h.lamports, 9), lamports: h.lamports.toString(), tokens: h.tokens, solUsd, solPrice: prices[WSOL_MINT] ?? null };
      }
      case 'prices': return usdPrices(msg.mints);
      case 'portfolio': return portfolioAll(!!msg.force);
      case 'portfolioCached': { const k = await scopeKey(); return portCache.data && portCache.key === k ? portCache.data : loadSnap('portSnap', k); }
      case 'pnlCached': { const k = await scopeKey(); return pnlCache.data && pnlCache.key === k ? pnlCache.data : loadSnap('pnlSnap', k); }
      case 'sweepPlan': return sweepPlan(msg);
      case 'sweepRun': return keepAlive(sweepRun(msg));
      case 'tradeLog': return (await local.get('tradeLog')) || [];
      case 'activityLog': return (await local.get('activityLog')) || [];
      case 'pnl': return pnlAll((await scopedWallets()).map(w => w.address), !!msg.force);
      case 'groupCreate': case 'groupSwitch': case 'groupRename': case 'groupDelete': case 'walletMove': return groupCall(msg);
      case 'distribute': return keepAlive(distributeLogged(msg));
      case 'getPending': {
        const p = pending.get(msg.id); if (!p) throw new Error('Request expired');
        return { ...p.req, unlocked: !!(await session.get('keys')), wallets: (await local.get('wallets')) || [] };
      }
      case 'approval': {
        const p = pending.get(msg.id); if (!p) throw new Error('Request expired');
        if (msg.approved && !(await session.get('keys'))) await unlock(msg.password);
        pending.delete(msg.id); p.resolve(!!msg.approved);
        return {};
      }
      case 'balances': return balances((await settings()).rpc, msg.addresses);
      case 'thesisRun': return runThesis(msg);
      case 'followRun': return runFollow(msg);
      case 'unfollowRun': return runUnfollow(msg);
      case 'likeRun': return runLike(msg);
      case 'selfView': return keepAlive(runSelfView(msg));
      case 'buyRun': return runBuy(msg);
      case 'sellRun': return runSell(msg);
      case 'tokenBalances': return tokenBalances((await settings()).rpc, msg.mint, msg.addresses);
      case 'clearJob': await session.del('job_' + msg.kind); return state();
      case 'forgetTeach': await local.set('pumpTpl', {}); await session.del('teachLog'); await setRecording(true); return state();
      case 'clearTeachLog': await session.del('teachLog'); return state();
      case 'teachDump': {
        // Templates only hold placeholders, but mask any long literal header/body values just in case.
        const t = (await local.get('pumpTpl')) || {};
        const mask = (o) => typeof o === 'string' ? (o.length > 24 && !/\{\{/.test(o) && !/^https?:/.test(o) && !/\s/.test(o) ? o.slice(0, 6) + '…' + o.slice(-4) : o) : Array.isArray(o) ? o.map(mask) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, mask(v)])) : o;
        return JSON.stringify(mask(t), null, 1);
      }
      case 'disconnectAll': await local.set('connectedOrigins', []); return state();
      default: throw new Error('Unknown message ' + msg.type);
    }
  })().then(r => sendResponse({ ok: true, result: r }), e => sendResponse({ ok: false, error: e.message }));
  return true;
});
