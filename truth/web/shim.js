// Truth on the web: stands in for the Chrome extension APIs so the extension's own
// background engine (background.js) and screens (popup.js) run together in one page.
// Vault and settings live in this browser's localStorage; unlocked keys stay in memory only.

const LP = 'truthweb.local.', SP = 'truthweb.session.';
const clone = (v) => (v === undefined ? undefined : structuredClone(v));

function makeArea(store, prefix, memoryOnly = new Set()) {
  const mem = new Map();
  const read = (k) => {
    if (memoryOnly.has(k)) return mem.has(k) ? clone(mem.get(k)) : undefined;
    try { const v = store.getItem(prefix + k); return v == null ? undefined : JSON.parse(v); } catch { return undefined; }
  };
  const write = (k, v) => {
    if (memoryOnly.has(k)) { mem.set(k, clone(v)); return; }
    try { store.setItem(prefix + k, JSON.stringify(v)); }
    catch (e) { throw new Error('This browser blocked saving (' + e.message + ').'); }
  };
  const del = (k) => { mem.delete(k); try { store.removeItem(prefix + k); } catch {} };
  const allKeys = () => {
    const out = new Set(mem.keys());
    try { for (let i = 0; i < store.length; i++) { const k = store.key(i); if (k.startsWith(prefix)) out.add(k.slice(prefix.length)); } } catch {}
    return [...out];
  };
  return {
    async get(keys) {
      const out = {};
      if (keys == null) { for (const k of allKeys()) out[k] = read(k); return out; }
      if (typeof keys === 'string') keys = [keys];
      if (Array.isArray(keys)) { for (const k of keys) { const v = read(k); if (v !== undefined) out[k] = v; } return out; }
      for (const [k, d] of Object.entries(keys)) { const v = read(k); out[k] = v === undefined ? d : v; }
      return out;
    },
    async set(obj) { for (const [k, v] of Object.entries(obj)) write(k, v); },
    async remove(keys) { for (const k of [].concat(keys)) del(k); },
    async clear() { for (const k of allKeys()) del(k); },
  };
}

function makeEvent() {
  const fns = new Set();
  return { addListener: (f) => fns.add(f), removeListener: (f) => fns.delete(f), hasListener: (f) => fns.has(f), _fire: (...a) => [...fns].map(f => f(...a)), _fns: fns };
}

const ID = 'truth-web';
const BASE = new URL('./', location.href).href;
const onMessage = makeEvent();
const runtime = {
  id: ID,
  lastError: undefined,
  getURL: (p = '') => BASE + String(p).replace(/^\//, ''),
  getManifest: () => ({ name: 'Truth', version: '3.12.7 web' }),
  getPlatformInfo: (cb) => { const r = { os: 'web' }; if (cb) cb(r); return Promise.resolve(r); },
  onMessage,
  sendMessage(msg, cb) {
    const p = new Promise((resolve) => {
      const sender = { id: ID, url: BASE + 'index.html' };
      let done = false;
      const sendResponse = (r) => { if (!done) { done = true; resolve(clone(r)); } };
      let asyncReply = false;
      for (const f of onMessage._fns) { if (f(clone(msg), sender, sendResponse) === true) asyncReply = true; }
      if (!asyncReply && !done) resolve(undefined);
    });
    if (cb) { p.then(cb); return; }
    return p;
  },
};

// No browser tabs to drive from a website: pump.fun page actions report that plainly.
const NO_TAB = 'This needs the Truth extension on a pump.fun tab.';
const tabs = {
  query: async () => [],
  get: async () => { throw new Error(NO_TAB); },
  update: async () => { throw new Error(NO_TAB); },
  sendMessage: async () => { throw new Error(NO_TAB); },
};

const alarmTimers = new Map();
const onAlarm = makeEvent();
const alarms = {
  create(name, info = {}) {
    clearTimeout(alarmTimers.get(name));
    const ms = info.when ? info.when - Date.now() : (Number(info.delayInMinutes) || 1) * 60000;
    alarmTimers.set(name, setTimeout(() => { alarmTimers.delete(name); onAlarm._fire({ name, scheduledTime: Date.now() }); }, Math.max(0, ms)));
  },
  clear: async (name) => { clearTimeout(alarmTimers.get(name)); return alarmTimers.delete(name); },
  onAlarm,
};

const windows = {
  create: async () => { throw new Error('Site connections only work in the Truth extension.'); },
  onRemoved: makeEvent(),
};

const permissions = { contains: async () => true, request: async () => true };

globalThis.chrome = {
  runtime, tabs, alarms, windows, permissions,
  storage: {
    local: makeArea(localStorage, LP),
    // Unlocked keys never touch disk; jobs and other session state survive a refresh.
    session: makeArea(sessionStorage, SP, new Set(['keys'])),
  },
};
