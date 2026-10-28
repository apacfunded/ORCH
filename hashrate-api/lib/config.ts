// Environment-driven settings for the serverless Hashrate backend.
export const CFG = {
  live: process.env.LIVE === 'true', // false = never touch pump.fun or move SOL
  rpc: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  pinataJwt: process.env.PINATA_JWT || '',
  masterSeed: process.env.MASTER_SEED || '',
  forwardAddress: process.env.FEE_FORWARD_ADDRESS || '',
  priorityFeeSol: Number(process.env.PRIORITY_FEE_SOL || 0.0005),
  walletReserveSol: Number(process.env.WALLET_RESERVE_SOL || 0.01),
  createFeeSol: Number(process.env.CREATE_FEE_SOL || 0.025),
  gasSol: Number(process.env.LAUNCH_GAS_SOL || 0.01),
  allowOrigin: process.env.ALLOW_ORIGIN || '*',
};
