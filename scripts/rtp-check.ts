/*
 * Exact RTP check: every strategy below is played on EVERY possible bee layout (C(19, bees) of them, each equally
 * likely), so the returns are exact, not sampled.
 *
 *   fair     97% × the fair value when the round ends: must be exactly 97.0000% (the fair value is a martingale)
 *   R10, R1  what the round really pays at that stake: rounded down to 0.001 and to the cent, capped at ×500
 *
 * Fails (exit 1) if any strategy returns more than 97%.
 *   npm run rtp
 */
import { CELL_COUNT, clueAt, has, popcount } from '../src/game/hex.ts';
import {
  BEE_LEVELS,
  START,
  boosted,
  emptyInfo,
  honeyChance,
  honeyLayouts,
  isMaxed,
  layouts,
  multiplierOf,
  oddsFor,
  openCell,
  payoutFor,
  type Fair,
  type Info,
  type Odds,
} from '../src/game/math.ts';

interface State {
  info: Info;
  odds: Odds;
  value: Fair;
  honeyPicks: number;
  multiplier: number;
}
type Action = number | 'cash';
interface Strategy {
  name: string;
  next(s: State): Action;
}

const closed = (s: State) => Array.from({ length: CELL_COUNT }, (_, c) => c).filter((c) => !has(s.info.opened, c));
const safestCell = (s: State) => closed(s).reduce((best, c) => (honeyChance(s.odds, c) > honeyChance(s.odds, best) ? c : best));
const riskiestCell = (s: State) =>
  closed(s)
    .filter((c) => honeyLayouts(s.odds, c) > 0)
    .reduce((best, c) => (honeyChance(s.odds, c) < honeyChance(s.odds, best) ? c : best));

const strategies = (level: number): Strategy[] => {
  const deep = { 3: 8, 5: 6, 7: 5, 10: 4 }[level]!;
  const list: Strategy[] = [
    ...[0, 1, 4, 9].map((cell) => ({
      name: `one pick, ${['corner', 'edge', 'inner', 'centre'][[0, 1, 4, 9].indexOf(cell)]} cell`,
      next: (s: State): Action => (s.honeyPicks === 0 ? cell : 'cash'),
    })),
    ...[2, 3, deep].map((k) => ({ name: `${k} safest picks`, next: (s: State): Action => (s.honeyPicks < k ? safestCell(s) : 'cash') })),
    ...[2, 3].map((k) => ({ name: `${k} riskiest picks`, next: (s: State): Action => (s.honeyPicks < k ? riskiestCell(s) : 'cash') })),
    ...[1.5, 3, 10].map((x) => ({
      name: `safest until ×${x}`,
      next: (s: State): Action => (s.multiplier >= x || s.honeyPicks >= deep ? 'cash' : safestCell(s)),
    })),
    {
      name: 'riskiest until ×5',
      next: (s: State): Action => (s.multiplier >= 5 || s.honeyPicks >= deep ? 'cash' : riskiestCell(s)),
    },
  ];
  if (level === 3) list.push({ name: 'clear the hive (safest first)', next: (s) => safestCell(s) });
  return list;
};

function run(level: number, strategy: Strategy) {
  const memo = new Map<string, Odds>();
  let fair = 0;
  let paid10 = 0;
  let paid1 = 0;
  const boards = layouts(level);
  for (const bees of boards) {
    const info = emptyInfo();
    let value = START;
    let honeyPicks = 0;
    let ended: number | null = null; // the multiplier the round paid at
    let fairEnd = 0;
    for (;;) {
      const key = `${info.opened}:${info.clues.join(',')}`;
      let odds = memo.get(key);
      if (!odds) memo.set(key, (odds = oddsFor(level, info)));
      const multiplier = honeyPicks ? multiplierOf(value) : 0;
      const action = strategy.next({ info, odds, value, honeyPicks, multiplier });
      if (action === 'cash') {
        if (!honeyPicks) throw new Error(`${strategy.name}: cashed out before the first honey`);
        ended = multiplier;
        fairEnd = Number((value.num * 10n ** 12n) / value.den) / 1e12;
        break;
      }
      if (has(bees, action)) {
        ended = 0;
        break;
      }
      value = boosted(value, odds, action);
      honeyPicks++;
      openCell(info, action, (c) => clueAt(c, bees));
      const m = multiplierOf(value);
      if (isMaxed(m) || popcount(info.opened) === CELL_COUNT - level) {
        ended = m;
        fairEnd = Number((value.num * 10n ** 12n) / value.den) / 1e12;
        break;
      }
    }
    fair += 0.97 * fairEnd;
    paid10 += payoutFor(10, ended);
    paid1 += payoutFor(1, ended);
  }
  const n = boards.length;
  return { fair: fair / n, r10: paid10 / n / 10, r1: paid1 / n / 1, states: memo.size };
}

const pct = (x: number) => `${(x * 100).toFixed(4)}%`.padStart(9);
let worst = 0;
let broken = false;
const t0 = Date.now();
for (const level of BEE_LEVELS) {
  console.log(`\n${level} bees (${layouts(level).length.toLocaleString()} layouts)        fair       R10       R1`);
  for (const s of strategies(level)) {
    const r = run(level, s);
    console.log(`  ${s.name.padEnd(30)} ${pct(r.fair)} ${pct(r.r10)} ${pct(r.r1)}`);
    worst = Math.max(worst, r.r10, r.r1);
    if (Math.abs(r.fair - 0.97) > 1e-9 || r.r10 > 0.97 || r.r1 > 0.97) broken = true;
  }
}
console.log(`\nBest real return: ${pct(worst).trim()}   (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
if (broken) {
  console.log('FAIL: a strategy beat 97%, or the fair value is not a martingale');
  process.exit(1);
}
console.log('OK: the fair value is a martingale, and no strategy returns more than 97%');
