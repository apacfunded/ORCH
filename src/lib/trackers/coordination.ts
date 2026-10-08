export interface Mention {
  accountId: number;
  ca: string;
  at: Date;
}

export interface CoordinatedPush {
  ca: string;
  accountIds: number[];
  firstAt: Date;
  lastAt: Date;
}

export interface CoordinationRules {
  minAccounts: number;
  windowMinutes: number;
}

/**
 * Finds coins that `minAccounts` or more distinct watched accounts mentioned inside any rolling window of
 * `windowMinutes`. Returns the densest window per coin (most accounts, then earliest).
 */
export function detectCoordinated(mentions: Mention[], rules: CoordinationRules): CoordinatedPush[] {
  const windowMs = rules.windowMinutes * 60_000;
  const byCa = new Map<string, Mention[]>();
  for (const m of mentions) {
    const arr = byCa.get(m.ca) ?? [];
    arr.push(m);
    byCa.set(m.ca, arr);
  }

  const pushes: CoordinatedPush[] = [];
  for (const [ca, list] of byCa) {
    list.sort((a, b) => a.at.getTime() - b.at.getTime());
    let best: CoordinatedPush | null = null;
    let lo = 0;
    for (let hi = 0; hi < list.length; hi++) {
      while (list[hi].at.getTime() - list[lo].at.getTime() > windowMs) lo++;
      const accounts = new Set<number>();
      for (let i = lo; i <= hi; i++) accounts.add(list[i].accountId);
      if (accounts.size >= rules.minAccounts && (!best || accounts.size > best.accountIds.length)) {
        best = { ca, accountIds: [...accounts].sort((a, b) => a - b), firstAt: list[lo].at, lastAt: list[hi].at };
      }
    }
    if (best) pushes.push(best);
  }
  return pushes.sort((a, b) => b.accountIds.length - a.accountIds.length);
}
