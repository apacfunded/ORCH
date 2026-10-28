import { verifyMessage } from './keys';
import { b58decode } from './base58';
import { isValidAddress } from './addresses';
import { clientError } from './http';

export function linkMessage(wallet: string, chain: string, address: string, issuedAt: number): string {
  return ['Hashrate payout address', `Wallet: ${wallet}`, `Chain: ${chain}`, `Address: ${address}`, `Issued: ${new Date(issuedAt).toISOString()}`].join('\n');
}

export function verifyLink(req: Record<string, unknown>, now = Date.now()) {
  const wallet = String(req.wallet ?? '');
  const chain = String(req.chain ?? '').toUpperCase();
  const address = String(req.address ?? '').trim();
  const issuedAt = Number(req.issuedAt);
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) throw clientError('Bad wallet.');
  if (!isValidAddress(chain, address)) throw clientError(`That doesn't look like a ${chain} address. Check it and paste it again.`);
  if (!(Math.abs(now - issuedAt) < 10 * 60_000)) throw clientError('This signature has expired. Sign the message again.');
  const sigStr = String(req.signature ?? '');
  const candidates: Uint8Array[] = [];
  try { const b = b58decode(sigStr); if (b.length === 64) candidates.push(b); } catch { /* not base58 */ }
  try { const b = new Uint8Array(Buffer.from(sigStr, 'base64')); if (b.length === 64) candidates.push(b); } catch { /* not base64 */ }
  if (!candidates.length) throw clientError('The signature is not readable. Sign the message again.');
  const msg = new TextEncoder().encode(linkMessage(wallet, chain, address, issuedAt));
  let ok = false;
  for (const sig of candidates) { try { if (verifyMessage(wallet, msg, sig)) { ok = true; break; } } catch { /* try next */ } }
  if (!ok) throw clientError('The signature does not match this wallet. Sign with the wallet that holds the coin.');
  return { wallet, chain, address };
}
