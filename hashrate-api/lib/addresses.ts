import type { Chain } from './targets.js';

// Format checks for payout addresses. They catch typos and wrong-chain pastes;
// the node still has the final say when it sends.
const RULES: Record<Chain, RegExp[]> = {
  BTC: [/^(1|3)[1-9A-HJ-NP-Za-km-z]{25,34}$/, /^bc1[02-9ac-hj-np-z]{11,87}$/],
  LTC: [/^[LM3][1-9A-HJ-NP-Za-km-z]{26,33}$/, /^ltc1[02-9ac-hj-np-z]{11,87}$/],
  DOGE: [/^[DA9][1-9A-HJ-NP-Za-km-z]{25,34}$/],
  ZEC: [/^t[13][1-9A-HJ-NP-Za-km-z]{33}$/, /^zs1[02-9ac-hj-np-z]{75}$/, /^u1[02-9ac-hj-np-z]{100,}$/],
  KAS: [/^kaspa:[02-9ac-hj-np-z]{61,63}$/],
  XMR: [/^[48][1-9A-HJ-NP-Za-km-z]{94}$/, /^4[1-9A-HJ-NP-Za-km-z]{105}$/],
};

export const CHAINS = Object.keys(RULES) as Chain[];

export function isValidAddress(chain: string, address: string): boolean {
  const rules = RULES[chain as Chain];
  if (!rules) return false;
  return rules.some((r) => r.test(address.trim()));
}
