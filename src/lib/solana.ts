import { isSolanaAddress } from "./base58";

interface ParsedTokenAccount {
  account: { data: { parsed: { info: { tokenAmount: { uiAmountString?: string; uiAmount?: number | null } } } } };
}

/**
 * Sum of a wallet's balance of one SPL token (works for both the Token and Token-2022 programs, because the
 * `mint` filter is program-agnostic). Throws on RPC errors so callers can keep the last known balance.
 */
export async function getTokenBalance(
  rpcUrl: string,
  owner: string,
  mint: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  if (!isSolanaAddress(owner) || !isSolanaAddress(mint)) throw new Error("Invalid owner or mint address");
  const res = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const body = (await res.json()) as { result?: { value: ParsedTokenAccount[] }; error?: { message: string } };
  if (body.error) throw new Error(`RPC error: ${body.error.message}`);
  let total = 0;
  for (const acc of body.result?.value ?? []) {
    const amt = acc.account.data.parsed.info.tokenAmount;
    total += Number(amt.uiAmountString ?? amt.uiAmount ?? 0);
  }
  return total;
}

const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // SPL Token
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", // Token-2022
]);

/**
 * Is `mint` a real token mint on chain? "missing" means the RPC answered and there is no such mint
 * (usually a typo). "unknown" means the RPC couldn't be reached, so we can't tell.
 */
export async function checkMint(rpcUrl: string, mint: string, fetchImpl: typeof fetch = fetch): Promise<"ok" | "missing" | "unknown"> {
  if (!isSolanaAddress(mint)) return "missing";
  try {
    const res = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [mint, { encoding: "base64", commitment: "confirmed" }] }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return "unknown";
    const body = (await res.json()) as { result?: { value: { owner: string } | null }; error?: unknown };
    if (body.error || !body.result) return "unknown";
    const v = body.result.value;
    return v && TOKEN_PROGRAMS.has(v.owner) ? "ok" : "missing";
  } catch {
    return "unknown";
  }
}
