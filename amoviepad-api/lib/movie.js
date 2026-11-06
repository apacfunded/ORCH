// Movie math: every CLIP_SOL of creator fees unlocks the next clip, up to the runtime's shot count.
export const CLIP_SOL = 0.1;
export const SHOT_SECONDS = 8;
export const RUNTIMES = [1, 3, 5, 10, 30, 90];
export const LAMPORTS = 1_000_000_000;
export const shotsFor = (minutes) => Math.ceil(minutes * 60 / SHOT_SECONDS);
export function progress(coin, state) {
  const total = shotsFor(coin.minutes);
  const fees = Number(BigInt(state?.feesLamports || '0')) / LAMPORTS;
  const unlocked = Math.min(Math.floor(fees / CLIP_SOL + 1e-9), total);
  const intoNext = unlocked >= total ? CLIP_SOL : fees - unlocked * CLIP_SOL;
  return { feesSol: fees, clips: unlocked, totalClips: total, toNextSol: Math.max(0, CLIP_SOL - intoNext), done: unlocked >= total };
}
