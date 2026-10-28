// Tiny Solana JSON-RPC client (no dependencies).

export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const LAMPORTS = 1_000_000_000;

export class SolanaRpc {
  private url: string;
  constructor(url: string) { this.url = url; }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`Solana RPC ${method} returned HTTP ${res.status}`);
    const j = (await res.json()) as { result?: T; error?: { message: string } };
    if (j.error) throw new Error(`Solana RPC ${method}: ${j.error.message}`);
    return j.result as T;
  }

  async balanceSol(pubkey: string): Promise<number> {
    const r = await this.call<{ value: number }>('getBalance', [pubkey, { commitment: 'confirmed' }]);
    return r.value / LAMPORTS;
  }

  async sendRaw(tx: Uint8Array): Promise<string> {
    return this.call<string>('sendTransaction', [Buffer.from(tx).toString('base64'), { encoding: 'base64', maxRetries: 3 }]);
  }

  /** Waits until a signature is confirmed or fails; throws on error or timeout. */
  async confirm(sig: string, timeoutMs = 60_000): Promise<void> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const r = await this.call<{ value: ({ err: unknown; confirmationStatus?: string } | null)[] }>('getSignatureStatuses', [[sig]]);
      const s = r.value[0];
      if (s?.err) throw new Error(`Transaction ${sig} failed: ${JSON.stringify(s.err)}`);
      if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return;
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`Transaction ${sig} not confirmed after ${timeoutMs / 1000}s`);
  }

  /**
   * Every wallet holding `mint`, summed across token accounts.
   * Checks both token programs (newer pump.fun coins use Token-2022).
   * Wallets owned by programs (bonding curve, AMM pools) are removed.
   */
  async holders(mint: string): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const program of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
      const filters: unknown[] = [{ memcmp: { offset: 0, bytes: mint } }];
      if (program === TOKEN_PROGRAM) filters.push({ dataSize: 165 });
      const accts = await this.call<{ account: { data: { parsed: { info: { owner: string; tokenAmount: { uiAmount: number } } } } } }[]>(
        'getProgramAccounts',
        [program, { encoding: 'jsonParsed', filters, commitment: 'confirmed' }],
      );
      for (const a of accts) {
        const info = a.account.data.parsed?.info;
        const amt = info?.tokenAmount?.uiAmount ?? 0;
        if (!info || amt <= 0) continue;
        out.set(info.owner, (out.get(info.owner) ?? 0) + amt);
      }
    }
    // Drop program-owned owners (PDAs): real wallets are owned by the System Program or have no account.
    const owners = [...out.keys()];
    for (let i = 0; i < owners.length; i += 100) {
      const chunk = owners.slice(i, i + 100);
      const r = await this.call<{ value: ({ owner: string } | null)[] }>('getMultipleAccounts', [chunk, { encoding: 'base64' }]);
      r.value.forEach((acc, j) => {
        if (acc && acc.owner !== SYSTEM_PROGRAM) out.delete(chunk[j]);
      });
    }
    return out;
  }
}
