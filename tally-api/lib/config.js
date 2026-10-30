// Tally market configuration. Edit COINS to change what's listed.

export const FEE = 0.03;            // fee taken from winnings only (never the stake)
export const START_BAL = 10;        // play SOL every new wallet starts with
export const REFILL = 10;           // play SOL per daily refill (only when under 1)
export const MIN_BET = 0.01;
export const MAX_BET = 25;

// Risk gates: a coin only gets markets if it trades enough to be hard to push around.
export const MIN_VOL_24H = Number(process.env.MIN_VOL_24H || 50_000);        // USD on-chain, any market (raise before real money)
export const MIN_VOL_24H_FAST = Number(process.env.MIN_VOL_24H_FAST || 250_000); // USD on-chain, needed for 5m and 15m rounds

export const TF = { '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };
export const TF_ORDER = ['5m', '15m', '1h', '4h', '1d'];

// Betting locks before close: at least 1 minute, or 5% of the round (1d locks 72 min early).
export const lockMs = dur => Math.max(60_000, Math.round(dur * 0.05));

// Contract addresses verified against Solflare / DEXTools / Bitquery listings (Oct 2026).
export const COINS = [
  { sym: 'FARTCOIN', name: 'Fartcoin',            mint: '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', color: '#c48a12', tfs: ['5m', '15m', '1h', '4h', '1d'] },
  { sym: 'MOODENG',  name: 'Moo Deng',            mint: 'ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY', color: '#db2777', tfs: ['5m', '15m', '1h', '4h', '1d'] },
  { sym: 'PNUT',     name: 'Peanut the Squirrel', mint: '2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump', color: '#ea580c', tfs: ['15m', '1h', '4h', '1d'] },
  { sym: 'ARC',      name: 'AI Rig Complex',      mint: '61V8vBaqAGMpgDQi4JcAwo1dmBGHsyhzodcPqnEVpump', color: '#2563eb', tfs: ['5m', '15m', '1h', '4h', '1d'] },
  { sym: 'BAN',      name: 'Comedian',            mint: '9PR7nCP9DpcUotnDPVLUBUZKu5WAYkwrCUx9wDnSpump', color: '#ca8a04', tfs: ['1h', '4h', '1d'] },
  { sym: 'ZEREBRO',  name: 'Zerebro',             mint: '8x5VqbHA8D7NkD52uNuS5nnt3PwA8pLD34ymskeSo2Wn', color: '#7c3aed', tfs: ['15m', '1h', '4h', '1d'] },
  { sym: 'GOAT',     name: 'Goatseus Maximus',    mint: 'CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump', color: '#0f9d6b', tfs: ['1h', '4h', '1d'] }
];

// Daily price ladder: strikes as multiples of the day's opening market cap (rounded to clean numbers).
export const LADDER = [0.8, 0.9, 1.1, 1.25, 1.5];

// Head-to-head: which coin gains more (in %) from the market's start to the daily close.
export const PAIRS = [['PNUT', 'MOODENG'], ['ARC', 'ZEREBRO'], ['GOAT', 'FARTCOIN']];

export const TICK_MIN_MS = 10_000;   // engine runs at most this often
export const PRICE_STALE_MS = 120_000;
