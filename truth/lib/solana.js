// Solana transaction building, PDA/ATA derivation and RPC helpers. No dependencies.
import * as b58 from './base58.js';

export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';
export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const ATA_RENT_LAMPORTS = 2_039_280n;

// ---------- ed25519 on-curve check (for PDA derivation) ----------
const P = (1n << 255n) - 19n;
const mod = (a) => ((a % P) + P) % P;
function powMod(b, e) { let r = 1n; b = mod(b); while (e > 0n) { if (e & 1n) r = mod(r * b); b = mod(b * b); e >>= 1n; } return r; }
const D = mod(-121665n * powMod(121666n, P - 2n));

export function isOnCurve(bytes) {
  const b = Uint8Array.from(bytes);
  b[31] &= 0x7f;
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(b[i]);
  if (y >= P) return false;
  const y2 = mod(y * y);
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);
  const x2 = mod(u * powMod(v, P - 2n));
  if (x2 === 0n) return true;
  return powMod(x2, (P - 1n) / 2n) === 1n;
}

async function sha256(bytes) { return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)); }
const concat = (...arrs) => { const n = arrs.reduce((a, x) => a + x.length, 0); const o = new Uint8Array(n); let i = 0; for (const a of arrs) { o.set(a, i); i += a.length; } return o; };
const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress');

export async function findProgramAddress(seeds, programId) {
  const prog = b58.decode(programId);
  for (let bump = 255; bump >= 0; bump--) {
    const h = await sha256(concat(...seeds, Uint8Array.of(bump), prog, PDA_MARKER));
    if (!isOnCurve(h)) return [b58.encode(h), bump];
  }
  throw new Error('No valid PDA found');
}

export async function getAta(owner, mint, tokenProgram = TOKEN_PROGRAM) {
  const [addr] = await findProgramAddress([b58.decode(owner), b58.decode(tokenProgram), b58.decode(mint)], ATA_PROGRAM);
  return addr;
}

// ---------- encoding ----------
export function compactU16(n) {
  const out = [];
  for (;;) { let b = n & 0x7f; n >>= 7; if (n === 0) { out.push(b); break; } out.push(b | 0x80); }
  return Uint8Array.from(out);
}
export function readCompactU16(buf, off) {
  let n = 0, shift = 0, len = 0;
  for (;;) { const b = buf[off + len]; n |= (b & 0x7f) << shift; len++; if (!(b & 0x80)) break; shift += 7; }
  return [n, len];
}
const u64le = (v) => { const o = new Uint8Array(8); let x = BigInt(v); for (let i = 0; i < 8; i++) { o[i] = Number(x & 0xffn); x >>= 8n; } return o; };
const u32le = (v) => { const o = new Uint8Array(4); new DataView(o.buffer).setUint32(0, v, true); return o; };

// ---------- instructions ----------
// keys: [{ pubkey, isSigner, isWritable }]
export const ix = {
  solTransfer(from, to, lamports) {
    return { programId: SYSTEM_PROGRAM, keys: [{ pubkey: from, isSigner: true, isWritable: true }, { pubkey: to, isSigner: false, isWritable: true }], data: concat(u32le(2), u64le(lamports)) };
  },
  createAtaIdempotent(payer, ata, owner, mint, tokenProgram) {
    return { programId: ATA_PROGRAM, data: Uint8Array.of(1), keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ] };
  },
  transferChecked(source, mint, dest, owner, amount, decimals, tokenProgram) {
    return { programId: tokenProgram, data: concat(Uint8Array.of(12), u64le(amount), Uint8Array.of(decimals)), keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: dest, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ] };
  },
  // Close an empty token account; its rent (~0.002 SOL) goes to `dest`.
  closeAccount(account, dest, owner, tokenProgram) {
    return { programId: tokenProgram, data: Uint8Array.of(9), keys: [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: dest, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
    ] };
  },
  setCuLimit(units) { return { programId: COMPUTE_BUDGET_PROGRAM, keys: [], data: concat(Uint8Array.of(2), u32le(units)) }; },
  setCuPrice(microLamports) { return { programId: COMPUTE_BUDGET_PROGRAM, keys: [], data: concat(Uint8Array.of(3), u64le(microLamports)) }; },
};

// Build a legacy message. Fee payer is always first.
export function compileMessage(feePayer, instructions, recentBlockhash) {
  const metas = new Map();
  const add = (pubkey, isSigner, isWritable) => {
    const m = metas.get(pubkey) || { pubkey, isSigner: false, isWritable: false };
    m.isSigner ||= isSigner; m.isWritable ||= isWritable; metas.set(pubkey, m);
  };
  add(feePayer, true, true);
  for (const i of instructions) { for (const k of i.keys) add(k.pubkey, k.isSigner, k.isWritable); add(i.programId, false, false); }
  const all = [...metas.values()];
  const payer = all.shift();
  const group = (s, w) => all.filter(m => m.isSigner === s && m.isWritable === w);
  const ordered = [payer, ...group(true, true), ...group(true, false), ...group(false, true), ...group(false, false)];
  const numSigners = ordered.filter(m => m.isSigner).length;
  const numRoSigned = ordered.filter(m => m.isSigner && !m.isWritable).length;
  const numRoUnsigned = ordered.filter(m => !m.isSigner && !m.isWritable).length;
  const index = new Map(ordered.map((m, i) => [m.pubkey, i]));

  const parts = [Uint8Array.of(numSigners, numRoSigned, numRoUnsigned), compactU16(ordered.length)];
  for (const m of ordered) parts.push(b58.decode(m.pubkey));
  parts.push(b58.decode(recentBlockhash));
  parts.push(compactU16(instructions.length));
  for (const i of instructions) {
    parts.push(Uint8Array.of(index.get(i.programId)));
    parts.push(compactU16(i.keys.length));
    parts.push(Uint8Array.from(i.keys.map(k => index.get(k.pubkey))));
    parts.push(compactU16(i.data.length));
    parts.push(i.data);
  }
  return { message: concat(...parts), numSigners };
}

export function serializeTx(message, signatures) {
  return concat(compactU16(signatures.length), ...signatures, message);
}

// Parse a serialized transaction (legacy or v0) just far enough to sign it.
export function splitTx(tx) {
  const [numSigs, len] = readCompactU16(tx, 0);
  const msgOff = len + numSigs * 64;
  const message = tx.slice(msgOff);
  let off = (message[0] & 0x80) ? 1 : 0;
  const numRequired = message[off];
  off += 3;
  const [numKeys, kl] = readCompactU16(message, off);
  off += kl;
  const signerKeys = [];
  for (let i = 0; i < Math.min(numRequired, numKeys); i++) signerKeys.push(b58.encode(message.slice(off + i * 32, off + (i + 1) * 32)));
  return { numSigs, sigOffset: len, message, signerKeys };
}

// Insert a signature for `address` into a serialized tx.
export function applySignature(tx, address, signature) {
  const { sigOffset, signerKeys, numSigs } = splitTx(tx);
  const idx = signerKeys.indexOf(address);
  if (idx < 0 || idx >= numSigs) throw new Error('This wallet is not a signer on the transaction');
  const out = Uint8Array.from(tx);
  out.set(signature, sigOffset + idx * 64);
  return out;
}

// ---------- RPC ----------
// Rate limits (429), RPC hiccups (5xx) and dropped connections get a quick retry instead of failing the
// whole wallet. Every call here is safe to repeat (resending a signed tx keeps the same signature).
let rpcId = 0;
// Keep reads under small RPC plans' per-second limits (free Helius allows only a few a second):
// at most 3 in flight and ~8 a second. Sending transactions skips the queue.
let RPC_MAX = 3, RPC_GAP_MS = 125;
// Paid RPC plans allow far more than the free default; Settings → "RPC requests per second" raises this.
export function setRpcRate(rps) {
  const r = Math.min(200, Math.max(1, Number(rps) || 8));
  RPC_GAP_MS = Math.max(4, Math.round(1000 / r));
  RPC_MAX = Math.max(3, Math.min(25, Math.ceil(r / 3)));
}
let rpcActive = 0, rpcLast = 0; const rpcQueue = [];
function rpcSlot() { return new Promise(res => { rpcQueue.push(res); rpcPump(); }); }
function rpcPump() {
  if (!rpcQueue.length || rpcActive >= RPC_MAX) return;
  const wait = rpcLast + RPC_GAP_MS - Date.now();
  if (wait > 0) { setTimeout(rpcPump, wait); return; }
  rpcActive++; rpcLast = Date.now(); rpcQueue.shift()();
  if (rpcQueue.length) setTimeout(rpcPump, RPC_GAP_MS);
}
function rpcDone() { rpcActive--; rpcPump(); }

// When the RPC says 429, everyone backs off together (instead of each request retrying on its own).
let rpcCoolUntil = 0;
export async function rpc(url, method, params = [], tries = 6) {
  const queued = method !== 'sendTransaction';
  for (let attempt = 1; ; attempt++) {
    if (queued) { const cool = rpcCoolUntil - Date.now(); if (cool > 0) await new Promise(r => setTimeout(r, cool)); await rpcSlot(); }
    let out;
    try { out = await rpcRaw(url, method, params, queued ? Math.min(2, tries) : tries, !queued); }
    catch (e) {
      if (queued && /RPC HTTP 429/.test(e.message) && attempt < tries) { rpcCoolUntil = Math.max(rpcCoolUntil, Date.now() + 700 * attempt); continue; }
      throw e;
    } finally { if (queued) rpcDone(); }
    return out;
  }
}
async function rpcRaw(url, method, params, tries, retry429 = true) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }), signal: AbortSignal.timeout(method === 'sendTransaction' ? 15000 : 8000) });
    } catch (e) {
      if (attempt >= tries) throw new Error(`RPC unreachable (${e?.name === 'TimeoutError' ? 'timed out' : 'network'})`);
      await new Promise(r => setTimeout(r, 150 * attempt)); continue;
    }
    if (((res.status === 429 && retry429) || res.status >= 500) && attempt < tries) {
      await new Promise(r => setTimeout(r, (res.status === 429 ? 600 : 200) * attempt + Math.random() * 200)); continue;
    }
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
    return j.result;
  }
}

export async function getHoldings(url, owner) {
  const [bal, t1, t2] = await Promise.all([
    rpc(url, 'getBalance', [owner, { commitment: 'confirmed' }]),
    rpc(url, 'getTokenAccountsByOwner', [owner, { programId: TOKEN_PROGRAM }, { encoding: 'jsonParsed', commitment: 'confirmed' }]),
    rpc(url, 'getTokenAccountsByOwner', [owner, { programId: TOKEN_2022_PROGRAM }, { encoding: 'jsonParsed', commitment: 'confirmed' }]).catch(() => ({ value: [] })),
  ]);
  const tokens = [];
  for (const [list, program] of [[t1.value, TOKEN_PROGRAM], [t2.value, TOKEN_2022_PROGRAM]]) {
    for (const a of list) {
      const info = a.account.data.parsed.info;
      const amt = info.tokenAmount;
      if (amt.amount === '0') continue;
      tokens.push({ mint: info.mint, account: a.pubkey, program, raw: amt.amount, decimals: amt.decimals, ui: amt.uiAmountString });
    }
  }
  // Token names via DAS (works on Helius and most paid RPCs); silently skipped otherwise.
  if (tokens.length) {
    try {
      const assets = await rpc(url, 'getAssetBatch', { ids: tokens.map(t => t.mint) });
      for (const a of assets || []) {
        const t = tokens.find(x => x.mint === a?.id);
        if (t) { t.name = a.content?.metadata?.name; t.symbol = a.content?.metadata?.symbol || a.token_info?.symbol; }
      }
    } catch { /* RPC has no DAS */ }
  }
  return { lamports: BigInt(bal.value), tokens };
}

export async function sendRawTx(url, tx, opts = {}) {
  let s = ''; for (const b of tx) s += String.fromCharCode(b);
  return rpc(url, 'sendTransaction', [btoa(s), { encoding: 'base64', skipPreflight: !!opts.skipPreflight, preflightCommitment: 'confirmed', maxRetries: opts.maxRetries ?? 5 }]);
}

// Confirm many transactions at once: one getSignatureStatuses call per tick for all of them (instead of one
// call per wallet), and keep re-sending each signed tx until it lands so it doesn't sit in a slow queue.
// entries: [{ signature, signed }]. Calls onDone(entry, error|null) as each one settles.
export async function confirmMany(url, entries, { timeoutMs = 60000, everyMs = 400, resendMs = 1500, onDone } = {}) {
  const open = new Map(entries.map(e => [e.signature, e]));
  const end = Date.now() + timeoutMs;
  let lastResend = Date.now();
  while (open.size && Date.now() < end) {
    await new Promise(r => setTimeout(r, everyMs));
    const sigs = [...open.keys()];
    for (let i = 0; i < sigs.length; i += 256) {
      let r;
      try { r = await rpc(url, 'getSignatureStatuses', [sigs.slice(i, i + 256)]); } catch { continue; } // try again next tick
      sigs.slice(i, i + 256).forEach((sig, k) => {
        const st = r.value[k];
        if (!st || !open.has(sig)) return;
        if (st.err) { onDone?.(open.get(sig), new Error('Transaction failed on-chain: ' + JSON.stringify(st.err))); open.delete(sig); }
        else if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') { onDone?.(open.get(sig), null); open.delete(sig); }
      });
    }
    if (open.size && Date.now() - lastResend >= resendMs) {
      lastResend = Date.now();
      for (const e of open.values()) if (e.signed) sendRawTx(url, e.signed, { skipPreflight: true, maxRetries: 0 }).catch(() => {});
    }
  }
  for (const e of open.values()) onDone?.(e, new Error('Not confirmed within 60s — check Solscan before retrying'));
}

export async function waitForConfirm(url, signature, timeoutMs = 60000, everyMs = 1500) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const r = await rpc(url, 'getSignatureStatuses', [[signature]]);
    const st = r.value[0];
    if (st?.err) throw new Error('Transaction failed on-chain: ' + JSON.stringify(st.err));
    if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return true;
    await new Promise(r => setTimeout(r, everyMs));
  }
  throw new Error('Not confirmed within 60s — check Solscan before retrying');
}

// Amount helpers (string <-> raw bigint), no floating point.
export function toRaw(str, decimals) {
  const s = String(str).trim();
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') throw new Error('Invalid amount');
  const [w, f = ''] = s.split('.');
  if (f.length > decimals) throw new Error(`Max ${decimals} decimal places`);
  return BigInt(w || '0') * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0');
}
export function fromRaw(raw, decimals) {
  raw = BigInt(raw);
  const d = 10n ** BigInt(decimals);
  const w = raw / d, f = raw % d;
  if (!decimals || f === 0n) return w.toString();
  return `${w}.${f.toString().padStart(decimals, '0').replace(/0+$/, '')}`;
}
