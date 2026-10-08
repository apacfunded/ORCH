import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/familjen-grotesk/500.css";
import "@fontsource/familjen-grotesk/600.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ComingSoon } from "@/components/ComingSoon";
import { CopyButton } from "@/components/CopyButton";
import { WalletButton } from "@/components/WalletButton";
import { config } from "@/config";
import { shortCa } from "@/lib/format";
import { kickWorker } from "@/server/kick";
import { getViewer } from "@/server/viewer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function generateMetadata(): Promise<Metadata> {
  const c = config();
  return {
    metadataBase: new URL(c.siteUrl),
    title: { default: "Receipts ($RECEIPTS) — the AI that keeps receipts on CT", template: "%s · Receipts" },
    description: "Deleted tweets don't disappear. They get receipts. Caller scorecards, deleted and edited calls, coordinated shills and account changes on crypto Twitter.",
    openGraph: { type: "website", siteName: "Receipts" },
    twitter: { card: "summary_large_image", site: `@${c.xHandle}` },
  };
}

export const viewport: Viewport = { themeColor: "#0b0b0b", colorScheme: "dark" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const c = config();
  const ready = Boolean(c.databaseUrl) || !c.onVercel;
  const viewer = ready ? await getViewer() : { wallet: null, tier: "public" as const, isAdmin: false };
  if (ready) kickWorker();
  return (
    <html lang="en">
      <body>
        {ready && c.dataSource === "mock" ? (
          <div className="demo-strip">Example data until launch: every handle, coin and price here is simulated.</div>
        ) : null}
        <header className="top">
          <div className="wrap top__in">
            <Link href="/" className="logo" aria-label="Receipts home">
              <span className="logo__mark" aria-hidden="true" />
              RECEIPTS
            </Link>
            <nav className="nav" aria-label="Main">
              <Link href="/">Feed</Link>
              <Link href="/leaderboard">Leaderboard</Link>
              <Link href="/about">How it works</Link>
            </nav>
            <div className="top__right">
              {c.mint ? (
                <span className="ca-chip">
                  CA {shortCa(c.mint)} <CopyButton value={c.mint} label="Copy CA" />
                </span>
              ) : null}
              <WalletButton wallet={viewer.wallet} tier={viewer.tier} isAdmin={viewer.isAdmin} />
            </div>
          </div>
        </header>
        <main>{ready ? children : <ComingSoon />}</main>
        <footer className="foot">
          <div className="wrap foot__in">
            <p style={{ margin: 0, maxWidth: "62ch" }}>
              Receipts states facts: what was posted, when it changed or disappeared, and what the price did. It doesn&apos;t
              accuse anyone. Public accounts only.
            </p>
            <div className="foot__links">
              <a href={`https://x.com/${c.xHandle}`} target="_blank" rel="noreferrer">@{c.xHandle}</a>
              {c.pumpUrl ? <a href={c.pumpUrl} target="_blank" rel="noreferrer">Buy on pump.fun</a> : null}
              {c.partnerHandle ? (
                <span>
                  Partnered with <a href={`https://x.com/${c.partnerHandle}`} target="_blank" rel="noreferrer">@{c.partnerHandle}</a>
                </span>
              ) : null}
              <Link href="/about#removal">Request removal</Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
