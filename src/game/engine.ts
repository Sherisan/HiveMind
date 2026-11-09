import { beeCellsFor, randomHex, sha256Hex } from './fair.ts';
import { clueAt, has, maskOf } from './hex.ts';
import { cashMultiplier, isLevel, payoutFor, play, roundMoney, type BeeLevel, type Played } from './math.ts';

export type RoundStatus = 'live' | 'cashed' | 'cleared' | 'maxed' | 'stung';

export interface Pick {
  cell: number;
  bee: boolean;
}

export interface Opened {
  cell: number;
  /** Bees touching the cell. */
  clue: number;
}

/** What the client is allowed to see of a round. */
export interface RoundView {
  id: string;
  bet: number;
  bees: BeeLevel;
  /** Every cell the player picked, in order. Only the last pick of a stung round is a bee. */
  picks: Pick[];
  /** Every open honey cell with its clue, in the order they opened (picks and the cells their clue-0 floods opened). */
  opened: Opened[];
  /** Cash-out multiplier now: 0 before the first honey. For a stung round, what the player had. */
  multiplier: number;
  payout: number;
  status: RoundStatus;
  /** Where the bees were, once the round is over. */
  beeCells: number[] | null;
}

export interface Fairness {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface HistoryEntry {
  id: string;
  time: number;
  bet: number;
  bees: BeeLevel;
  picks: Pick[];
  multiplier: number;
  payout: number;
  status: Exclude<RoundStatus, 'live'>;
  beeCells: number[];
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface Snapshot {
  balance: number;
  currency: string;
  limits: { minBet: number; maxBet: number };
  fairness: Fairness;
  /** Current round, or the last finished one (kept so the hive can show how it ended). */
  round: RoundView | null;
  history: HistoryEntry[];
}

/** The contract a backend satisfies. Every call returns the full new state. */
export interface HiveApi {
  init(): Promise<Snapshot>;
  bet(amount: number, bees: BeeLevel): Promise<Snapshot>;
  pick(cell: number): Promise<Snapshot>;
  cashOut(): Promise<Snapshot>;
  setClientSeed(seed: string): Promise<Snapshot>;
  /** Demo only: top the wallet back up. */
  refill?(): Promise<Snapshot>;
}

interface InternalRound {
  id: string;
  bet: number;
  bees: BeeLevel;
  picks: Pick[];
  payout: number;
  status: RoundStatus;
  /** Secret until the round ends. */
  beeCells: number[];
}

interface Stored {
  balance: number;
  clientSeed: string;
  nonce: number;
  serverSeed: string;
  round: InternalRound | null;
  history: HistoryEntry[];
}

const STORAGE_KEY = 'hivemind.demo.v1';
const DEMO_BALANCE = 1000;
const LIMITS = { minBet: 1, maxBet: 100 };
const HISTORY_LIMIT = 50;

function playOut(r: InternalRound): Played {
  const bees = maskOf(r.beeCells);
  return play(
    r.bees,
    r.picks.map((p) => p.cell),
    (c) => has(bees, c),
    (c) => clueAt(c, bees),
  );
}

/**
 * In-browser stand-in for the game server so the game is fully playable offline (?demo).
 * It holds the secret seed and only exposes its hash until the round ends.
 */
export function createLocalEngine(): HiveApi {
  let s: Stored = load();
  let seedHash = '';

  function load(): Stored {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Stored;
    } catch {
      /* corrupt or blocked storage: start fresh */
    }
    return { balance: DEMO_BALANCE, clientSeed: randomHex(8), nonce: 0, serverSeed: randomHex(), round: null, history: [] };
  }

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      /* private mode: the session still works, it just won't survive a reload */
    }
  };

  async function snapshot(): Promise<Snapshot> {
    seedHash ||= await sha256Hex(s.serverSeed);
    const r = s.round;
    let round: RoundView | null = null;
    if (r) {
      const p = playOut(r);
      round = {
        id: r.id,
        bet: r.bet,
        bees: r.bees,
        picks: r.picks.map((x) => ({ ...x })),
        opened: p.order.map((cell) => ({ cell, clue: p.info.clues[cell] })),
        multiplier: cashMultiplier(p),
        payout: r.payout,
        status: r.status,
        beeCells: r.status === 'live' ? null : [...r.beeCells].sort((a, b) => a - b),
      };
    }
    return {
      balance: s.balance,
      currency: 'ZAR',
      limits: LIMITS,
      fairness: { serverSeedHash: seedHash, clientSeed: s.clientSeed, nonce: s.nonce },
      round,
      history: s.history,
    };
  }

  function live(): InternalRound {
    if (s.round?.status !== 'live') throw new Error('No round in play');
    return s.round;
  }

  /** Close the round, pay it, reveal the seed into history and rotate to a fresh one. */
  async function settle(r: InternalRound, status: HistoryEntry['status']) {
    const multiplier = status === 'stung' ? 0 : cashMultiplier(playOut(r));
    r.status = status;
    r.payout = payoutFor(r.bet, multiplier);
    s.balance = roundMoney(s.balance + r.payout);
    s.history = [
      {
        id: r.id,
        time: Date.now(),
        bet: r.bet,
        bees: r.bees,
        picks: r.picks.map((x) => ({ ...x })),
        multiplier,
        payout: r.payout,
        status,
        beeCells: [...r.beeCells].sort((a, b) => a - b),
        serverSeed: s.serverSeed,
        serverSeedHash: await sha256Hex(s.serverSeed),
        clientSeed: s.clientSeed,
        nonce: s.nonce,
      },
      ...s.history,
    ].slice(0, HISTORY_LIMIT);
    s.serverSeed = randomHex();
    s.nonce += 1;
    seedHash = '';
  }

  return {
    init: snapshot,

    async bet(amount, bees) {
      if (s.round?.status === 'live') throw new Error('Finish the round in play first');
      if (!isLevel(bees)) throw new Error('Choose 3, 5, 7 or 10 bees');
      if (!(amount >= LIMITS.minBet && amount <= LIMITS.maxBet)) {
        throw new Error(`Bet must be between ${LIMITS.minBet} and ${LIMITS.maxBet}`);
      }
      amount = roundMoney(amount);
      if (amount > s.balance) throw new Error('Insufficient balance');
      s.balance = roundMoney(s.balance - amount);
      s.round = {
        id: randomHex(6),
        bet: amount,
        bees,
        picks: [],
        payout: 0,
        status: 'live',
        beeCells: await beeCellsFor(s.serverSeed, s.clientSeed, s.nonce, bees),
      };
      save();
      return snapshot();
    },

    async pick(cell) {
      const r = live();
      const before = playOut(r);
      if (!(Number.isInteger(cell) && cell >= 0 && cell < 19) || has(before.info.opened, cell)) throw new Error('Pick a closed cell');
      r.picks.push({ cell, bee: r.beeCells.includes(cell) });
      const after = playOut(r);
      if (after.outcome !== 'live') await settle(r, after.outcome);
      save();
      return snapshot();
    },

    async cashOut() {
      const r = live();
      if (playOut(r).honeyPicks === 0) throw new Error('Open a cell first');
      await settle(r, 'cashed');
      save();
      return snapshot();
    },

    async setClientSeed(seed) {
      if (s.round?.status === 'live') throw new Error('Change seeds between rounds');
      const clean = seed.trim().slice(0, 64);
      if (!clean) throw new Error('Client seed cannot be empty');
      s.clientSeed = clean;
      save();
      return snapshot();
    },

    async refill() {
      if (s.round?.status === 'live') throw new Error('Finish the round in play first');
      s.balance = DEMO_BALANCE;
      save();
      return snapshot();
    },
  };
}
