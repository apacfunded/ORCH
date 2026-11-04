// Launch pipeline: request → launcher sends SOL to a launch wallet → worker creates the coin on pump.fun (PumpPortal) → register coin.
import { randomUUID } from 'node:crypto';
import { CFG } from './config.js';
import { list, putJson, putFile, readAll, getJson, logLine } from './store.js';
import { creatorFor, mintFor } from './wallets.js';
import { signSerializedTx } from './keys.js';
import { SolanaRpc } from './rpc.js';

export const PAIR_TYPES = ['x', 'github', 'youtube', 'twitch', 'ai', 'company', 'wallet', 'token', 'stock'] as const;
export type PairType = (typeof PAIR_TYPES)[number];

export interface LaunchReq {
  id: string; ts: number; name: string; ticker: string; description: string; pairType: PairType; pairWith: string;
  needSol: number; wallet: string; imageBase64?: string; imageType?: string; socials: { x?: string; tg?: string; web?: string };
}
export interface Coin {
  mint: string; ticker: string; name: string; description: string; image: string; pairType: PairType; pairWith: string;
  created_at: number; creator: string; launchId: string; socials?: LaunchReq['socials'];
}

const PUMPPORTAL = 'https://pumpportal.fun/api/trade-local';
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export async function createLaunch(body: Record<string, unknown>) {
  const ticker = String(body.ticker ?? '').replace(/^\$/, '').trim().toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(ticker)) throw new Error('Ticker must be 2–10 letters or numbers.');
  const name = clean(body.name, 32);
  if (name.length < 2) throw new Error('Name must be 2–32 characters.');
  const pairType = String(body.pairType ?? '') as PairType;
  if (!PAIR_TYPES.includes(pairType)) throw new Error('Pick who the coin is paired with.');
  const pairWith = clean(body.pairWith, 64).replace(/^@/, '');
  if (pairWith.length < 2) throw new Error('Add the account, handle or address the coin is paired with.');
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  const imageType = typeof body.imageType === 'string' ? body.imageType : '';
  if (!imageBase64) throw new Error('Add a coin image.');
  if (!IMAGE_TYPES.includes(imageType)) throw new Error('The image must be PNG, JPG, GIF or WEBP.');
  if (imageBase64.length > 4_000_000) throw new Error('The image must be under 3 MB.');
  const s = (body.socials && typeof body.socials === 'object' ? body.socials : {}) as Record<string, unknown>;
  const socials = { x: clean(s.x, 200) || undefined, tg: clean(s.tg, 200) || undefined, web: clean(s.web, 200) || undefined };
  const needSol = Math.round((CFG.createFeeSol + CFG.gasSol) * 1e4) / 1e4;
  const id = randomUUID();
  const wallet = creatorFor(id).publicKey;
  const req: LaunchReq = { id, ts: Date.now(), name, ticker, description: clean(body.description, 500), pairType, pairWith, needSol, wallet, imageBase64, imageType, socials };
  await putJson(`launches/${id}/req.json`, req);
  return { id, wallet, needSol };
}

type Outcome = { status: 'live'; mint: string; sig: string; ts: number } | { status: 'failed'; error: string; ts: number } | { status: 'launching'; ts: number };

async function outcome(id: string): Promise<{ req?: LaunchReq; state: Outcome | null }> {
  const files = await list(`launches/${id}/`);
  const by = (n: string) => files.find((f) => f.pathname.endsWith('/' + n));
  const reqMeta = by('req.json');
  if (!reqMeta) return { state: null };
  const req = await getJson<LaunchReq>(reqMeta.url);
  if (by('live.json')) return { req, state: await getJson<Outcome>(by('live.json')!.url) };
  if (by('failed.json')) return { req, state: await getJson<Outcome>(by('failed.json')!.url) };
  const locks = files.filter((f) => /\/launching(-\d+)?\.json$/.test(f.pathname)).sort((a, b) => a.pathname.localeCompare(b.pathname));
  if (locks.length) return { req, state: await getJson<Outcome>(locks[locks.length - 1].url) };
  return { req, state: null };
}

export async function launchStatus(id: string) {
  const { req, state } = await outcome(id);
  if (!req) return undefined;
  const base = { id, wallet: req.wallet, needSol: req.needSol, ticker: req.ticker, name: req.name, pairType: req.pairType, pairWith: req.pairWith };
  if (!state) return { ...base, status: 'awaiting_funds' as const };
  if (state.status === 'live') return { ...base, status: 'live' as const, mint: state.mint, sig: state.sig };
  if (state.status === 'failed') return { ...base, status: 'failed' as const, error: state.error };
  if (Date.now() - state.ts > 15 * 60_000) return { ...base, status: 'failed' as const, error: 'The launch timed out. Send @paired_lol your launch id.' };
  return { ...base, status: 'launching' as const };
}

async function execute(req: LaunchReq, rpc: SolanaRpc): Promise<Coin | null> {
  const creator = creatorFor(req.id);
  const mintKp = mintFor(req.id);
  const ext = (req.imageType || 'image/png').split('/')[1].replace('jpeg', 'jpg');
  const slug = `${req.ticker.toLowerCase()}-${req.id.slice(0, 8)}`;
  const image = await putFile(`media/${slug}.${ext}`, Buffer.from(req.imageBase64 || '', 'base64'), req.imageType || 'image/png');
  const meta = { name: req.name, symbol: req.ticker, description: req.description, image, twitter: req.socials.x ?? '', telegram: req.socials.tg ?? '', website: req.socials.web ?? 'https://orch.lol/paired', showName: true, createdOn: 'https://orch.lol/paired' };
  const uri = await putFile(`meta/${slug}.json`, JSON.stringify(meta), 'application/json');

  const res = await fetch(PUMPPORTAL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ publicKey: creator.publicKey, action: 'create', tokenMetadata: { name: req.name, symbol: req.ticker, uri }, mint: mintKp.publicKey,
      denominatedInSol: 'true', amount: 0, slippage: 10, priorityFee: CFG.priorityFeeSol, pool: 'pump' }),
  });
  if (res.status !== 200) throw new Error(`PumpPortal create failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  let tx: Uint8Array = new Uint8Array(await res.arrayBuffer());
  tx = signSerializedTx(tx, mintKp);
  tx = signSerializedTx(tx, creator);
  const sig = await rpc.sendRaw(tx);
  // Record the sent tx before waiting, so a function timeout can't lose a coin that actually landed.
  await putJson(`launches/${req.id}/sent.json`, { sig, mint: mintKp.publicKey, image, ts: Date.now() });
  try { await rpc.confirm(sig, 25_000); }
  catch (e) {
    if (/not confirmed after/.test((e as Error).message)) return null; // still pending: the next tick finishes it
    throw e;
  }
  return finalize(req, mintKp.publicKey, sig, image);
}

async function finalize(req: LaunchReq, mint: string, sig: string, image: string): Promise<Coin> {
  const coin: Coin = { mint, ticker: req.ticker, name: req.name, description: req.description, image, pairType: req.pairType, pairWith: req.pairWith,
    created_at: Date.now(), creator: creatorFor(req.id).publicKey, launchId: req.id, socials: req.socials };
  await putJson(`coins/${coin.mint}.json`, coin, true);
  await putJson(`launches/${req.id}/live.json`, { status: 'live', mint: coin.mint, sig, ts: Date.now() }, true);
  await logLine({ mint: coin.mint, kind: 'launch', amount: 0, unit: 'SOL', ref: sig, status: 'done', note: `launched $${req.ticker} on pump.fun` });
  return coin;
}

async function settleSent(id: string, req: LaunchReq, sentUrl: string, rpc: SolanaRpc): Promise<string> {
  const sent = await getJson<{ sig: string; mint: string; image: string; ts: number }>(sentUrl);
  const r = await rpc.call<{ value: ({ err: unknown; confirmationStatus?: string } | null)[] }>('getSignatureStatuses', [[sent.sig], { searchTransactionHistory: true }]);
  const st = r.value[0];
  if (st?.err) { await putJson(`launches/${id}/failed.json`, { status: 'failed', error: `create tx failed: ${JSON.stringify(st.err)}`, ts: Date.now() }); return 'failed on-chain'; }
  if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) { const c = await finalize(req, sent.mint, sent.sig, sent.image); return `live ${c.mint}`; }
  if (Date.now() - sent.ts > 3 * 60_000) { await putJson(`launches/${id}/failed.json`, { status: 'failed', error: 'The create transaction was dropped by the network.', ts: Date.now() }); return 'dropped'; }
  return 'pending confirmation';
}

/** Every tick: any launch whose wallet now holds enough SOL gets created. */
export async function processLaunches(rpc = new SolanaRpc(CFG.rpc)) {
  const metas = await list('launches/');
  const ids = new Set(metas.map((m) => m.pathname.split('/')[1]).filter(Boolean));
  const out: { id: string; result: string }[] = [];
  for (const id of ids) {
    const files = metas.filter((m) => m.pathname.startsWith(`launches/${id}/`));
    const has = (n: string) => files.some((f) => f.pathname.endsWith('/' + n));
    if (has('live.json') || has('failed.json')) continue;
    const reqMeta = files.find((f) => f.pathname.endsWith('/req.json'));
    if (!reqMeta) continue;
    const sentMeta = files.find((f) => f.pathname.endsWith('/sent.json'));
    const locks = files.filter((f) => /\/launching(-\d+)?\.json$/.test(f.pathname));
    if (locks.length) {
      if (sentMeta) {
        try { out.push({ id, result: await settleSent(id, await getJson<LaunchReq>(reqMeta.url), sentMeta.url, rpc) }); }
        catch (e) { out.push({ id, result: 'settle error: ' + (e as Error).message }); }
        continue;
      }
      const newest = Math.max(...locks.map((l) => new Date(l.uploadedAt).getTime()));
      if (Date.now() - newest < 3 * 60_000) continue;
      if (locks.length >= 3) { await putJson(`launches/${id}/failed.json`, { status: 'failed', error: 'The launch did not complete after 3 attempts.', ts: Date.now() }); out.push({ id, result: 'gave up' }); continue; }
    }
    const req = await getJson<LaunchReq>(reqMeta.url);
    if (Date.now() - req.ts > 7 * 86400_000) continue;
    try {
      const bal = await rpc.balanceSol(req.wallet);
      if (bal + 1e-9 < req.needSol) continue;
      if (!CFG.live) { out.push({ id, result: 'funded (LIVE=false, not launching)' }); continue; }
      await putJson(`launches/${id}/launching-${locks.length + 1}.json`, { status: 'launching', ts: Date.now() });
      try {
        const coin = await execute(req, rpc);
        out.push({ id, result: coin ? `live ${coin.mint}` : 'sent, confirming' });
      } catch (e) {
        await putJson(`launches/${id}/failed.json`, { status: 'failed', error: (e as Error).message, ts: Date.now() });
        out.push({ id, result: 'failed: ' + (e as Error).message });
      }
    } catch (e) { out.push({ id, result: 'skipped: ' + (e as Error).message }); }
  }
  return out;
}

export async function allCoins(): Promise<Coin[]> {
  return (await readAll<Coin>('coins/')).map((c) => c.data).sort((a, b) => b.created_at - a.created_at);
}
