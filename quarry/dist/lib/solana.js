// Thin wrapper around @solana/web3.js, loaded as a global (window.solanaWeb3) from the CDN in index.html.
// Only the few pieces the launch flow needs: a fresh mint keypair, (de)serializing and co-signing a v0 tx.
function web3() {
    const w = window.solanaWeb3;
    if (!w)
        throw new Error("Wallet library did not load. Refresh the page and try again.");
    return w;
}
export const newMintKeypair = () => web3().Keypair.generate();
export const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
export const bytesToB64 = (b) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000)
    s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
export const deserializeTx = (b64) => web3().VersionedTransaction.deserialize(b64ToBytes(b64));
/** Re-parse whatever object the wallet returned with our own web3.js copy, then add extra signatures. */
export function cosign(walletSigned, signers) {
    const tx = web3().VersionedTransaction.deserialize(walletSigned.serialize());
    tx.sign(signers);
    return bytesToB64(tx.serialize());
}
