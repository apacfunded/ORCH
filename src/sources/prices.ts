import type { PriceSource } from "./types";

interface DexPair {
  chainId: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
}

/** DexScreener public API — free, no key. Picks the most liquid Solana pair for the mint. */
export class DexScreenerPrices implements PriceSource {
  readonly name = "dexscreener";
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async getMarketCap(ca: string): Promise<number | null> {
    const res = await this.fetchImpl(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(ca)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`);
    const body = (await res.json()) as { pairs?: DexPair[] | null };
    const pairs = (body.pairs ?? []).filter((p) => p.chainId === "solana");
    if (pairs.length === 0) return null;
    pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const top = pairs[0];
    return top.marketCap ?? top.fdv ?? null;
  }
}
