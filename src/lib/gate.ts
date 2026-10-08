export type Tier = "public" | "holder" | "whale";

export interface TierInput {
  /** False until $RECEIPTS launches and RECEIPTS_MINT is set. */
  mintConfigured: boolean;
  isAdmin: boolean;
  /** Token balance in whole tokens, or null when unknown / not signed in. */
  balance: number | null;
  minHold: number;
  whaleHold: number;
}

export function resolveTier(i: TierInput): Tier {
  if (i.isAdmin) return "whale";
  if (!i.mintConfigured || i.balance === null) return "public";
  if (i.balance >= i.whaleHold) return "whale";
  if (i.balance >= i.minHold) return "holder";
  return "public";
}

export function isLive(tier: Tier): boolean {
  return tier !== "public";
}

/** The newest moment this viewer may see. Public viewers see everything older than the delay. */
export function feedCutoff(tier: Tier, now: Date, delayMinutes: number): Date {
  return isLive(tier) ? now : new Date(now.getTime() - delayMinutes * 60_000);
}

export function canView(createdAt: Date, tier: Tier, now: Date, delayMinutes: number): boolean {
  return createdAt.getTime() <= feedCutoff(tier, now, delayMinutes).getTime();
}

/** Minutes until a locked item becomes public (rounded up, at least 1). */
export function minutesUntilPublic(createdAt: Date, now: Date, delayMinutes: number): number {
  const ms = createdAt.getTime() + delayMinutes * 60_000 - now.getTime();
  return Math.max(1, Math.ceil(ms / 60_000));
}
