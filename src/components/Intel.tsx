import { CELL_COUNT } from '../game/hex.ts';
import {
  BEE_LEVELS,
  LEVEL_NAMES,
  MAX_MULTIPLIER,
  boosted,
  emptyInfo,
  formatMultiplier,
  honeyChance,
  honeyLayouts,
  multiplierOf,
  oddsFor,
  payoutFor,
  START,
  type BeeLevel,
  type Fair,
  type Odds,
} from '../game/math.ts';
import { formatMoney, formatPercent } from '../game/money.ts';
import type { Phase } from '../game/useGame.ts';
import { BeeIcon, DropIcon } from './Icons.tsx';

/** First pick on an empty hive, per level: same for every cell. */
const FIRST = BEE_LEVELS.map((level) => {
  const odds = oddsFor(level, emptyInfo());
  return { level, chance: honeyChance(odds, 0), multiplier: multiplierOf(boosted(START, odds, 0)) };
});

export function Intel({
  phase,
  level,
  onLevel,
  roundLevel,
  odds,
  value,
  bet,
  currency,
  focus,
  opened,
  showOdds,
  onShowOdds,
}: {
  phase: Phase;
  /** The level the next round will use. */
  level: BeeLevel;
  onLevel: (l: BeeLevel) => void;
  /** The level of the round on the board. */
  roundLevel: BeeLevel | null;
  odds: Odds | null;
  value: Fair;
  bet: number;
  currency: string;
  focus: number | null;
  opened: Map<number, number>;
  showOdds: boolean;
  onShowOdds: (on: boolean) => void;
}) {
  const live = phase === 'live' && odds !== null && roundLevel !== null;

  if (!live) {
    return (
      <aside className="intel">
        <h3>THE HIVE</h3>
        <p className="intel-lead">
          Bees hide in some of the 19 cells. Choose how many: more bees, bigger boosts.
        </p>
        <ol className="levels">
          {FIRST.map((f) => (
            <li key={f.level}>
              <button className={`level-row ${f.level === level ? 'on' : ''}`} onClick={() => onLevel(f.level)} disabled={phase === 'loading'}>
                <span className="level-name">
                  <b>{f.level}</b> {LEVEL_NAMES[f.level]}
                </span>
                <span className="level-first">
                  {formatPercent(f.chance)} <small>first cell</small>
                </span>
                <span className="level-mult">{formatMultiplier(f.multiplier)}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="intel-key">
          <span className="key-clue">2</span>
          <span>An open cell counts the bees touching it. Use the clues to find honey.</span>
        </div>
        <div className="intel-key">
          <DropIcon />
          <span>No bees nearby: the cells around it open for free.</span>
        </div>
        <p className="intel-foot">Top prize ×{MAX_MULTIPLIER} · every boost matches its odds · RTP 97%</p>
      </aside>
    );
  }

  const closed = CELL_COUNT - opened.size;
  const beesLeft = roundLevel;
  let sureHoney = 0;
  let sureBee = 0;
  for (let c = 0; c < CELL_COUNT; c++) {
    if (opened.has(c)) continue;
    if (odds.bees[c] === 0) sureHoney++;
    if (honeyLayouts(odds, c) === 0) sureBee++;
  }
  const cell = focus !== null && !opened.has(focus) ? focus : null;
  const chance = cell !== null ? honeyChance(odds, cell) : 0;
  const next = cell !== null && chance > 0 ? multiplierOf(boosted(value, odds, cell)) : 0;

  return (
    <aside className="intel">
      <div className="intel-head">
        <h3>CELL INTEL</h3>
        <label className="toggle">
          <input type="checkbox" checked={showOdds} onChange={(e) => onShowOdds(e.target.checked)} />
          <span>Odds</span>
        </label>
      </div>

      {cell === null ? (
        <div className="focus-card empty">
          <BeeIcon />
          <p>
            <span className="only-mouse">Point at a closed cell to read its odds.</span>
            <span className="only-touch">Tap a closed cell to read its odds, tap again to open it.</span>
          </p>
        </div>
      ) : (
        <div className={`focus-card ${chance === 1 ? 'sure' : chance === 0 ? 'doom' : ''}`}>
          <div className="focus-chance">
            <b>{formatPercent(chance)}</b> honey
            <span>{formatPercent(1 - chance)} bee</span>
          </div>
          {chance === 1 ? (
            <p className="focus-note">The clues prove this cell is honey. It's free to open: boost ×1.</p>
          ) : chance === 0 ? (
            <p className="focus-note">The clues prove a bee is in here.</p>
          ) : (
            <dl className="focus-grid">
              <dt>Boost</dt>
              <dd>×{(1 / chance).toFixed(3)}</dd>
              <dt>If honey</dt>
              <dd className="lime">
                {formatMultiplier(next)} <small>{formatMoney(payoutFor(bet, next), currency)}</small>
              </dd>
            </dl>
          )}
        </div>
      )}

      <dl className="hive-stats">
        <dt>Bees hidden</dt>
        <dd>{beesLeft}</dd>
        <dt>Closed cells</dt>
        <dd>{closed}</dd>
        <dt>Honey left</dt>
        <dd>{closed - beesLeft}</dd>
        <dt>Proven honey</dt>
        <dd className={sureHoney ? 'lime' : ''}>{sureHoney}</dd>
        <dt>Proven bees</dt>
        <dd className={sureBee ? 'warn' : ''}>{sureBee}</dd>
      </dl>
      <p className="intel-foot">
        Odds count every bee layout that fits the clues. Boost = 1 ÷ chance, so reading the board cuts your risk, not the
        house edge: RTP 97%.
      </p>
    </aside>
  );
}
