// What a coin's fees can mine. A target is one rental algorithm that pays out
// in one or more chains (Scrypt merged mining pays both LTC and DOGE).

export type Chain = 'BTC' | 'LTC' | 'DOGE' | 'ZEC' | 'KAS' | 'XMR';

export interface MineTarget {
  id: string;
  label: string;
  /** Algorithm name as each rental market spells it. */
  algo: { nicehash: string; mrr: string };
  /** Chains the pool pays out in; mined value is shared across them. */
  payoutChains: Chain[];
  /** How a direct-buy budget is split across payoutChains (sums to 1). */
  buyWeights: Record<string, number>;
}

export const TARGETS: Record<string, MineTarget> = {
  LTC_DOGE: {
    id: 'LTC_DOGE',
    label: 'LTC + DOGE',
    algo: { nicehash: 'SCRYPT', mrr: 'scrypt' },
    payoutChains: ['LTC', 'DOGE'],
    buyWeights: { LTC: 0.5, DOGE: 0.5 },
  },
  ZEC: {
    id: 'ZEC',
    label: 'ZEC',
    algo: { nicehash: 'EQUIHASH', mrr: 'equihash' },
    payoutChains: ['ZEC'],
    buyWeights: { ZEC: 1 },
  },
  KAS: {
    id: 'KAS',
    label: 'KAS',
    algo: { nicehash: 'KHEAVYHASH', mrr: 'kheavyhash' },
    payoutChains: ['KAS'],
    buyWeights: { KAS: 1 },
  },
  BTC: {
    id: 'BTC',
    label: 'BTC',
    algo: { nicehash: 'SHA256ASICBOOST', mrr: 'sha256' },
    payoutChains: ['BTC'],
    buyWeights: { BTC: 1 },
  },
  XMR: {
    id: 'XMR',
    label: 'XMR',
    algo: { nicehash: 'RANDOMXMONERO', mrr: 'randomx' },
    payoutChains: ['XMR'],
    buyWeights: { XMR: 1 },
  },
};

export function getTarget(id: string): MineTarget {
  const t = TARGETS[id];
  if (!t) throw new Error(`Unknown mine target "${id}". Use one of: ${Object.keys(TARGETS).join(', ')}`);
  return t;
}
