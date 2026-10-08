/**
 * Deleted-tweet detection as a small state machine.
 *
 * A single failed fetch is never a deletion: rate limits, outages and suspensions all look like "missing".
 * A tweet is marked DELETED only after `confirmFails` consecutive "missing" results spread over at least
 * `confirmGapMinutes`. Until then it is UNCONFIRMED and never shown as a receipt.
 */

export type TweetStatus = "live" | "unconfirmed" | "deleted";

export interface DeletionState {
  status: TweetStatus;
  failCount: number;
  firstFailedAt: Date | null;
}

export type FetchOutcome = { kind: "found"; text: string } | { kind: "missing" } | { kind: "error" };

export type DeletionEvent = "deleted" | "restored" | null;

export interface DeletionRules {
  confirmFails: number;
  confirmGapMinutes: number;
}

export function nextDeletionState(
  state: DeletionState,
  outcome: FetchOutcome,
  now: Date,
  rules: DeletionRules,
): { state: DeletionState; event: DeletionEvent } {
  if (outcome.kind === "error") return { state, event: null };

  if (outcome.kind === "found") {
    if (state.status === "live" && state.failCount === 0) return { state, event: null };
    // Back after looking missing (or even after a confirmed delete: e.g. an account un-suspended).
    return {
      state: { status: "live", failCount: 0, firstFailedAt: null },
      event: state.status === "deleted" ? "restored" : null,
    };
  }

  // missing
  if (state.status === "deleted") return { state, event: null };
  const failCount = state.failCount + 1;
  const firstFailedAt = state.firstFailedAt ?? now;
  const gapMs = now.getTime() - firstFailedAt.getTime();
  const confirmed = failCount >= rules.confirmFails && gapMs >= rules.confirmGapMinutes * 60_000;
  if (confirmed) {
    return { state: { status: "deleted", failCount, firstFailedAt }, event: "deleted" };
  }
  return { state: { status: "unconfirmed", failCount, firstFailedAt }, event: null };
}

/**
 * When most of one account's recent tweets vanish at once, the account went private/suspended or the
 * source is misbehaving. We skip that batch instead of minting a wall of false "deleted" receipts.
 */
export function looksLikeAccountOutage(checked: number, missing: number): boolean {
  if (checked < 5) return false;
  return missing / checked >= 0.8;
}
