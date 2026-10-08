export interface ProfileFields {
  handle: string;
  displayName: string;
  bio: string;
  followers: number;
}

export type ProfileChange =
  | { type: "rename"; from: string; to: string }
  | { type: "display_name"; from: string; to: string }
  | { type: "bio"; from: string; to: string }
  | { type: "followers"; from: number; to: number; pct: number };

export interface ProfileRules {
  followerSpikePct: number;
  /** Ignore follower swings on tiny accounts, where +20% is a handful of people. */
  minFollowersForSpike?: number;
}

export function diffProfile(prev: ProfileFields, next: ProfileFields, rules: ProfileRules): ProfileChange[] {
  const changes: ProfileChange[] = [];
  if (prev.handle.toLowerCase() !== next.handle.toLowerCase()) {
    changes.push({ type: "rename", from: prev.handle, to: next.handle });
  }
  if (prev.displayName !== next.displayName) {
    changes.push({ type: "display_name", from: prev.displayName, to: next.displayName });
  }
  if (prev.bio.trim() !== next.bio.trim()) {
    changes.push({ type: "bio", from: prev.bio, to: next.bio });
  }
  const minFollowers = rules.minFollowersForSpike ?? 500;
  if (prev.followers >= minFollowers && prev.followers > 0) {
    const pct = ((next.followers - prev.followers) / prev.followers) * 100;
    if (Math.abs(pct) >= rules.followerSpikePct) {
      changes.push({ type: "followers", from: prev.followers, to: next.followers, pct: Math.round(pct * 10) / 10 });
    }
  }
  return changes;
}
