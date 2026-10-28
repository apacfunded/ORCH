// Launch pipeline on Vercel: request → wait for SOL → create on pump.fun (PumpPortal) → register coin.
import { randomUUID } from 'node:crypto';
import { CFG } from './config';
import { list, putJson, readAll, getJson, logLine } from './store';
import { creatorFor, mintFor } from './wallets';
import { signSerializedTx } from './keys';
import { SolanaRpc } from './rpc';
import { getTarget } from './targets';

export interface LaunchReq {
  id: string; ts: number; name: string; ticker: string; description: string; target: string; rentShare: number;
  devBuySol: number; needSol: number; wallet: string; imageBase64?: string; imageType?: string; socials: { x?: string; tg?: string; web?: string };
}
export interface Coin { mint: string; ticker: string; name: string; target: string; rent_share: number; created_at: number; creator: string; launchId: string; socials?: LaunchReq['socials'] }

const PUMPPORTAL = 'https://pumpportal.fun/api/trade-local';

export async function createLaunch(body: Record<string, unknown>) {
  const target = String(body.target ?? '');
  getTarget(target);
  const ticker = String(body.ticker ?? '').replace(/^\$/, '').toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(ticker)) throw new Error('Ticker must be 2–10 letters or numbers.');
  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 32) throw new Error('Name must be 2–32 characters.');
  const rentShare = Number(body.rentShare);
  if (!(rentShare >= 0 && rentShare <= 1)) throw new Error('Rent share must be between 0 and 1.');
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : undefined;
  if (imageBase64 && imageBase64.length > 4_000_000) throw new Error('Image must be under 3 MB.');
  const devBuySol = Math.max(0, Number(body.devBuySol ?? 0) || 0);
  const needSol = Math.round((CFG.createFeeSol + devBuySol + CFG.gasSol) * 1e4) / 1e4;
  const id = randomUUID();
  const wallet = creatorFor(id).publicKey;
  const socials = (body.socials && typeof body.socials === 'object' ? body.socials : {}) as LaunchReq['socials'];
  const req: LaunchReq = { id, ts: Date.now(), name, ticker, description: String(body.description ?? '').slice(0, 1000), target, rentShare, devBuySol, needSol, wallet,
    imageBase64, imageType: typeof body.imageType === 'string' ? body.imageType : undefined, socials };
  await putJson(`launches/${id}/req.json`, req);
  return { id, wallet, needSol, devBuySol };
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
  if (by('launching.json')) return { req, state: await getJson<Outcome>(by('launching.json')!.url) };
  return { req, state: null };
}

export async function launchStatus(id: string) {
  const { req, state } = await outcome(id);
  if (!req) return undefined;
  const base = { id, wallet: req.wallet, needSol: req.needSol, devBuySol: req.devBuySol, ticker: req.ticker, name: req.name, target: req.target };
  if (!state) return { ...base, status: 'awaiting_funds' as const };
  if (state.status === 'live') return { ...base, status: 'live' as const, mint: state.mint, sig: state.sig };
  if (state.status === 'failed') return { ...base, status: 'failed' as const, error: state.error };
  // A launch stuck in "launching" for over 10 minutes is treated as failed so the launcher isn't left hanging.
  if (Date.now() - state.ts > 10 * 60_000) return { ...base, status: 'failed' as const, error: 'The launch timed out. Contact support with your launch id.' };
  return { ...base, status: 'launching' as const };
}

async function pinata(file: Blob, filename: string): Promise<string> {
  if (!CFG.pinataJwt) throw new Error('PINATA_JWT is not set.');
  const fd = new FormData();
  fd.append('network', 'public');
  fd.append('file', file, filename);
  const r = await fetch('https://uploads.pinata.cloud/v3/files', { method: 'POST', headers: { authorization: `Bearer ${CFG.pinataJwt}` }, body: fd });
  const j = (await r.json().catch(() => ({}))) as { data?: { cid: string } };
  if (!r.ok || !j.data?.cid) throw new Error(`Pinata upload failed (${r.status}).`);
  return `https://ipfs.io/ipfs/${j.data.cid}`;
}

async function execute(req: LaunchReq, rpc: SolanaRpc) {
  const creator = creatorFor(req.id);
  const mintKp = mintFor(req.id);
  let imageUri = '';
  if (req.imageBase64) imageUri = await pinata(new Blob([Buffer.from(req.imageBase64, 'base64')], { type: req.imageType || 'image/png' }), 'image');
  const meta = { name: req.name, symbol: req.ticker, description: req.description, image: imageUri, twitter: req.socials.x ?? '', telegram: req.socials.tg ?? '', website: req.socials.web ?? '', showName: true };
  const uri = await pinata(new Blob([JSON.stringify(meta)], { type: 'application/json' }), 'metadata.json');

  const res = await fetch(PUMPPORTAL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ publicKey: creator.publicKey, action: 'create', tokenMetadata: { name: req.name, symbol: req.ticker, uri }, mint: mintKp.publicKey,
      denominatedInSol: 'true', amount: req.devBuySol, slippage: 10, priorityFee: CFG.priorityFeeSol, pool: 'pump' }),
  });
  if (res.status !== 200) throw new Error(`PumpPortal create failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  let tx: Uint8Array = new Uint8Array(await res.arrayBuffer());
  tx = signSerializedTx(tx, mintKp);
  tx = signSerializedTx(tx, creator);
  const sig = await rpc.sendRaw(tx);
  await rpc.confirm(sig);
  const coin: Coin = { mint: mintKp.publicKey, ticker: req.ticker, name: req.name, target: req.target, rent_share: req.rentShare, created_at: Date.now(), creator: creator.publicKey, launchId: req.id, socials: req.socials };
  await putJson(`coins/${coin.mint}.json`, coin);
  await putJson(`launches/${req.id}/live.json`, { status: 'live', mint: coin.mint, sig, ts: Date.now() });
  await logLine({ mint: coin.mint, kind: 'claim', amount: 0, unit: 'SOL', ref: sig, status: 'done', note: `launched $${req.ticker} on pump.fun` });
  return coin;
}

/** Every tick: any launch whose wallet now holds enough SOL gets created. */
export async function processLaunches(rpc = new SolanaRpc(CFG.rpc)) {
  const metas = await list('launches/');
  const ids = new Set(metas.map((m) => m.pathname.split('/')[1]).filter(Boolean));
  const out: { id: string; result: string }[] = [];
  for (const id of ids) {
    const files = metas.filter((m) => m.pathname.startsWith(`launches/${id}/`));
    const has = (n: string) => files.some((f) => f.pathname.endsWith('/' + n));
    if (has('live.json') || has('failed.json') || has('launching.json')) continue;
    const reqMeta = files.find((f) => f.pathname.endsWith('/req.json'));
    if (!reqMeta) continue;
    const req = await getJson<LaunchReq>(reqMeta.url);
    if (Date.now() - req.ts > 7 * 86400_000) continue;
    try {
      const bal = await rpc.balanceSol(req.wallet);
      if (bal + 1e-9 < req.needSol) continue;
      if (!CFG.live) { out.push({ id, result: 'funded (LIVE=false, not launching)' }); continue; }
      // Lock first so a concurrent tick can't launch twice. The write fails if the lock already exists.
      await putJson(`launches/${id}/launching.json`, { status: 'launching', ts: Date.now() });
      try {
        const coin = await execute(req, rpc);
        out.push({ id, result: `live ${coin.mint}` });
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
