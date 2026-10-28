// Injected wallet (Phantom / Solflare / Backpack). Reads the address and signs messages; never sends transactions.
let current = null;
const listeners = new Set();
function findProvider() {
    return window.phantom?.solana ?? window.solflare ?? window.backpack ?? window.solana ?? null;
}
export const walletAddress = () => current?.address ?? null;
export function onWallet(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export async function connectWallet() {
    const p = findProvider();
    if (!p)
        throw new Error('No Solana wallet found. Install Phantom, Solflare or Backpack, then reload.');
    const r = await p.connect();
    current = { provider: p, address: r.publicKey.toString() };
    listeners.forEach((f) => f(current.address));
    return current.address;
}
export async function disconnectWallet() {
    try {
        await current?.provider.disconnect?.();
    }
    catch { /* ignore */ }
    current = null;
    listeners.forEach((f) => f(null));
}
const WALLET_B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function toB58(bytes) {
    let n = 0n;
    for (const b of bytes)
        n = n * 256n + BigInt(b);
    let s = '';
    while (n > 0n) {
        s = WALLET_B58[Number(n % 58n)] + s;
        n /= 58n;
    }
    for (const b of bytes) {
        if (b === 0)
            s = '1' + s;
        else
            break;
    }
    return s;
}
/** Signs a text message with the connected wallet; returns the base58 signature. */
export async function signText(text) {
    if (!current)
        throw new Error('Connect your wallet first.');
    const r = await current.provider.signMessage(new TextEncoder().encode(text), 'utf8');
    const sig = r instanceof Uint8Array ? r : r.signature;
    return toB58(sig);
}
