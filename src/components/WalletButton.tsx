"use client";

import { getWallets } from "@wallet-standard/app";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { base58Encode } from "@/lib/base58";
import type { Tier } from "@/lib/gate";

// Minimal Wallet Standard shapes (Phantom, Solflare, Backpack… all implement these).
interface StdAccount {
  address: string;
  chains: readonly string[];
}
interface StdWallet {
  name: string;
  icon: string;
  chains: readonly string[];
  features: Record<string, unknown>;
}
type ConnectFeature = { connect: () => Promise<{ accounts: readonly StdAccount[] }> };
type SignMessageFeature = {
  signMessage: (...inputs: { account: StdAccount; message: Uint8Array }[]) => Promise<readonly { signature: Uint8Array }[]>;
};

function solanaWallets(): StdWallet[] {
  const list = getWallets().get() as unknown as StdWallet[];
  return list
    .filter((w) => w.chains.some((c) => c.startsWith("solana:")) && "standard:connect" in w.features && "solana:signMessage" in w.features)
    .sort((a, b) => (a.name === "Phantom" ? -1 : b.name === "Phantom" ? 1 : a.name.localeCompare(b.name)));
}

const TIER_LABEL: Record<Tier, string> = { public: "Delayed", holder: "Holder · live", whale: "Whale · live" };

export function WalletButton(props: { wallet: string | null; tier: Tier; isAdmin: boolean }) {
  const router = useRouter();
  const [wallets, setWallets] = useState<StdWallet[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setWallets(solanaWallets());
    const { on } = getWallets();
    const off = on("register", () => setWallets(solanaWallets()));
    return () => off();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  async function signIn(w: StdWallet) {
    setMenuOpen(false);
    setBusy(true);
    setError(null);
    try {
      const { accounts } = await (w.features["standard:connect"] as ConnectFeature).connect();
      const account = accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? accounts[0];
      if (!account) throw new Error("No account was shared by the wallet.");

      const nonceRes = await fetch(`/api/auth/nonce?wallet=${encodeURIComponent(account.address)}`, { cache: "no-store" });
      const nonceBody = await nonceRes.json();
      if (!nonceRes.ok) throw new Error(nonceBody.error ?? "Couldn't start sign-in.");

      const [signed] = await (w.features["solana:signMessage"] as SignMessageFeature).signMessage({
        account,
        message: new TextEncoder().encode(nonceBody.message),
      });
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: account.address, nonce: nonceBody.nonce, signature: base58Encode(signed.signature) }),
      });
      const verifyBody = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyBody.error ?? "Sign-in failed.");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(/reject|denied|cancel/i.test(msg) ? "Sign-in cancelled in your wallet." : msg);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  function onConnectClick() {
    if (wallets.length === 0) {
      setError("No Solana wallet found in this browser. Install Phantom, then reload.");
      return;
    }
    if (wallets.length === 1) void signIn(wallets[0]);
    else setMenuOpen((o) => !o);
  }

  if (props.wallet) {
    return (
      <div className="wallet">
        <span className={`tier tier--${props.tier}`}>{TIER_LABEL[props.tier]}</span>
        <span className="wallet__addr" title={props.wallet}>
          {props.wallet.slice(0, 4)}…{props.wallet.slice(-4)}
        </span>
        {props.isAdmin ? <a className="btn btn--ghost btn--sm" href="/admin">Admin</a> : null}
        <button type="button" className="btn btn--ghost btn--sm" onClick={signOut}>Sign out</button>
      </div>
    );
  }

  return (
    <div className="wallet" ref={menuRef}>
      <button type="button" className="btn btn--primary" onClick={onConnectClick} disabled={busy} aria-haspopup={wallets.length > 1 ? "menu" : undefined} aria-expanded={menuOpen}>
        {busy ? "Check your wallet…" : "Connect wallet"}
      </button>
      {menuOpen ? (
        <div className="menu" role="menu">
          {wallets.map((w) => (
            <button key={w.name} type="button" role="menuitem" className="menu__item" onClick={() => signIn(w)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.icon} alt="" width={20} height={20} />
              {w.name}
            </button>
          ))}
        </div>
      ) : null}
      {error ? (
        <p className="wallet__error" role="alert">
          {error}{" "}
          {wallets.length === 0 ? <a href="https://phantom.com/download" target="_blank" rel="noreferrer">Get Phantom</a> : null}
        </p>
      ) : null}
    </div>
  );
}
