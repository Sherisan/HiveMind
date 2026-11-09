import { ALL_CELLS, CELL_COUNT, NEIGHBORS, has, popcount } from './hex.ts';

/*
 * HIVE MIND math. The server (HiveRules) implements exactly the same rules.
 *
 * Bees hide in `level` of the 19 cells, every layout equally likely. An open honey cell shows its clue: how many bees
 * touch it. Before each pick, the odds of every closed cell come from counting the bee layouts that agree with every
 * clue on the board:
 *
 *     P(cell is honey) = layouts with honey in that cell / layouts that fit the clues
 *
 * Picking honey multiplies the round's fair value by 1 / P, the cell's boost. The RTP is applied ONCE, to the whole
 * round:
 *
 *     multiplier = floor(970 × fair value) / 1000        (fair value = Π layouts / Π layouts-with-honey-there)
 *
 * capped at ×500. Whatever the player picks, using the clues or not, the fair value is a martingale: every pick is a
 * fair bet at its true odds. So no strategy returns more than 97%, and rounding down only takes a little more off.
 * A cell the clues prove safe has boost ×1: reading the board lowers the risk, never the house edge.
 *
 * Products are exact (BigInt), so the client, the server and the verifier never disagree on a rounding edge.
 */

export const RTP = 0.97;
const RTP_MILLI = 970n;
/** Top prize. Reaching it settles the round automatically. */
export const MAX_MULTIPLIER = 500;
const MAX_MILLI = BigInt(MAX_MULTIPLIER * 1000);

export const BEE_LEVELS = [3, 5, 7, 10] as const;
export type BeeLevel = (typeof BEE_LEVELS)[number];
export const LEVEL_NAMES: Record<BeeLevel, string> = { 3: 'Calm', 5: 'Buzzing', 7: 'Angry', 10: 'Swarm' };
export const isLevel = (n: unknown): n is BeeLevel => BEE_LEVELS.includes(n as BeeLevel);

const layoutCache = new Map<number, Int32Array>();

/** Every way to hide `level` bees in the hive, as cell masks: C(19, level), from 969 (3 bees) to 92,378 (10). */
export function layouts(level: number): Int32Array {
  let all = layoutCache.get(level);
  if (!all) {
    const out: number[] = [];
    for (let m = 0; m <= ALL_CELLS; m++) if (popcount(m) === level) out.push(m);
    all = Int32Array.from(out);
    layoutCache.set(level, all);
  }
  return all;
}

/** What the board shows: the open honey cells and their clues. */
export interface Info {
  opened: number;
  /** Per cell: its clue once open, -1 while closed. */
  clues: number[];
}

export const emptyInfo = (): Info => ({ opened: 0, clues: new Array<number>(CELL_COUNT).fill(-1) });

export interface Odds {
  /** Bee layouts that fit every clue on the board. */
  total: number;
  /** Per cell: how many of those layouts put a bee there. */
  bees: number[];
}

/** Count the layouts that fit the board, and how many put a bee in each cell. */
export function oddsFor(level: number, info: Info): Odds {
  const near: number[] = [];
  const clue: number[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (!has(info.opened, i)) continue;
    near.push(NEIGHBORS[i] & ~info.opened);
    clue.push(info.clues[i]);
  }
  const bees = new Array<number>(CELL_COUNT).fill(0);
  let total = 0;
  const all = layouts(level);
  scan: for (let j = 0; j < all.length; j++) {
    const m = all[j];
    if (m & info.opened) continue;
    for (let c = 0; c < near.length; c++) if (popcount(m & near[c]) !== clue[c]) continue scan;
    total++;
    for (let x = m; x !== 0; x &= x - 1) bees[31 - Math.clz32(x & -x)]++;
  }
  return { total, bees };
}

export const honeyLayouts = (o: Odds, cell: number) => o.total - o.bees[cell];
export const honeyChance = (o: Odds, cell: number) => (o.total > 0 ? honeyLayouts(o, cell) / o.total : 0);

/** The round's fair value, num / den: the stake grows by every boost. */
export interface Fair {
  num: bigint;
  den: bigint;
}

export const START: Fair = { num: 1n, den: 1n };

/** The fair value after picking honey in `cell`: × total / honey. */
export const boosted = (v: Fair, o: Odds, cell: number): Fair => ({
  num: v.num * BigInt(o.total),
  den: v.den * BigInt(honeyLayouts(o, cell)),
});

/** Cash-out multiplier for a fair value: 97% of it, floored to 0.001, capped at ×500. */
export function multiplierOf(v: Fair): number {
  const milli = (RTP_MILLI * v.num) / v.den;
  return Number(milli > MAX_MILLI ? MAX_MILLI : milli) / 1000;
}

export const isMaxed = (multiplier: number) => multiplier >= MAX_MULTIPLIER;

/** bet × multiplier, floored to the cent. Exact: bet has 2 decimals and the multiplier 3. */
export function payoutFor(bet: number, multiplier: number): number {
  return Math.floor((Math.round(bet * 100) * Math.round(multiplier * 1000)) / 1000) / 100;
}

export function roundMoney(amount: number): number {
  return Math.round(amount * 100 + 1e-9) / 100;
}

/** "×1.316" */
export const formatMultiplier = (m: number) => `×${m.toFixed(3)}`;

// ── Playing a round out ─────────────────────────────────────────────────

export type Outcome = 'live' | 'stung' | 'cleared' | 'maxed';

export interface Step {
  cell: number;
  bee: boolean;
  /** The odds the pick was made at. */
  total: number;
  honey: number;
}

export interface Played {
  info: Info;
  value: Fair;
  steps: Step[];
  honeyPicks: number;
  outcome: Outcome;
  /** Every opened cell in the order it opened: each pick, then the cells its flood opened. */
  order: number[];
}

/**
 * Open a honey cell. A clue of 0 means no bee touches it, so its neighbours open too, and so on (they're certain
 * honey: boost ×1, the fair value doesn't move). Returns the cells opened, in order.
 */
export function openCell(info: Info, cell: number, clueOf: (cell: number) => number): number[] {
  const opened: number[] = [];
  const queue = [cell];
  while (queue.length) {
    const c = queue.shift()!;
    if (has(info.opened, c)) continue;
    const clue = clueOf(c);
    if (!(clue >= 0 && clue <= 6)) throw new Error(`No clue for cell ${c}`);
    info.opened |= 1 << c;
    info.clues[c] = clue;
    opened.push(c);
    if (clue === 0) for (let n = 0; n < CELL_COUNT; n++) if (has(NEIGHBORS[c], n) && !has(info.opened, n)) queue.push(n);
  }
  return opened;
}

/**
 * Replay a round's picks. `beeAt` and `clueOf` come from the board (engine, verifier) or from what the server showed
 * (the live UI): either way the steps, the fair value and the outcome are the same.
 */
export function play(
  level: number,
  picks: readonly number[],
  beeAt: (cell: number) => boolean,
  clueOf: (cell: number) => number,
): Played {
  const info = emptyInfo();
  let value = START;
  let honeyPicks = 0;
  let outcome: Outcome = 'live';
  const steps: Step[] = [];
  const order: number[] = [];
  for (const cell of picks) {
    if (outcome !== 'live') throw new Error('A pick after the round ended');
    if (!(cell >= 0 && cell < CELL_COUNT) || has(info.opened, cell)) throw new Error(`Cell ${cell} can't be picked`);
    const odds = oddsFor(level, info);
    const honey = honeyLayouts(odds, cell);
    const bee = beeAt(cell);
    steps.push({ cell, bee, total: odds.total, honey });
    if (bee) {
      outcome = 'stung';
      break;
    }
    if (honey === 0) throw new Error(`Cell ${cell} can't be honey`);
    value = boosted(value, odds, cell);
    honeyPicks++;
    order.push(...openCell(info, cell, clueOf));
    if (isMaxed(multiplierOf(value))) outcome = 'maxed';
    else if (popcount(info.opened) === CELL_COUNT - level) outcome = 'cleared';
  }
  return { info, value, steps, honeyPicks, outcome, order };
}

/** What cashing out now pays: nothing before the first honey. */
export const cashMultiplier = (p: Played) => (p.honeyPicks === 0 ? 0 : multiplierOf(p.value));
