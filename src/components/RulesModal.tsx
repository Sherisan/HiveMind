import { BEE_LEVELS, LEVEL_NAMES, MAX_MULTIPLIER, RTP, boosted, emptyInfo, formatMultiplier, honeyChance, multiplierOf, oddsFor, payoutFor, START } from '../game/math.ts';
import { formatPercent } from '../game/money.ts';
import { Modal } from './Modal.tsx';

const ROWS = BEE_LEVELS.map((level) => {
  const odds = oddsFor(level, emptyInfo());
  const chance = honeyChance(odds, 0);
  const m = multiplierOf(boosted(START, odds, 0));
  return { level, chance, m, rtp: (chance * payoutFor(10, m)) / 10 };
});

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="HOW TO PLAY" onClose={onClose}>
      <ol className="rules-steps">
        <li>Choose how many bees hide in the 19 cells (3, 5, 7 or 10) and your bet, then press PLAY.</li>
        <li>Open cells one at a time. Honey is safe and boosts your multiplier. A bee stings and the round is lost.</li>
        <li>
          Every honey cell shows a clue: how many bees are in the cells touching it. A cell with no bees around it opens its
          neighbours for free.
        </li>
        <li>
          Each closed cell shows its chance of honey, worked out from every clue on the board. Its boost is exactly 1 ÷ that
          chance: a 50% cell doubles your fair value, and a cell the clues prove safe adds nothing.
        </li>
        <li>
          Cash out any time after your first honey. Find every drop of honey to clear the hive, and ×{MAX_MULTIPLIER} ends the
          round as the top prize.
        </li>
      </ol>

      <h4>FIRST PICK</h4>
      <table className="rules-table">
        <thead>
          <tr>
            <th>Bees</th>
            <th>Honey</th>
            <th>Cash out</th>
            <th>Return</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.level}>
              <td>
                {r.level} <span className="muted">{LEVEL_NAMES[r.level]}</span>
              </td>
              <td>{formatPercent(r.chance)}</td>
              <td>{formatMultiplier(r.m)}</td>
              <td>{(r.rtp * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>WHY THE CLUES DON'T BEAT THE HOUSE</h4>
      <p>
        The odds on a cell count every way the bees could be hidden that agrees with all the clues you can see. Picking honey
        pays exactly 1 ÷ those odds, so every pick is a fair bet, whether it's a wild guess or a cell the clues all but
        prove. The {Math.round((1 - RTP) * 100)}% house edge is taken once, from the whole round: the multiplier is {Math.round(RTP * 100)}% of the fair value, rounded down.
        However you play, the return is {Math.round(RTP * 100)}% at most. Reading the board lowers your risk, not the edge.
      </p>

      <h4>PROVABLY FAIR</h4>
      <p className="muted">
        The bees are hidden by a server seed you only see hashed until the round ends, together with your own client seed.
        History lets you verify every round: where the bees were, the odds of each pick, the multiplier and the payout.
      </p>

      <h4>CONTROLS</h4>
      <p className="muted">
        Click a cell to open it, or point at it first to read its odds. On touch screens, tap a cell to read it and tap
        again to open it. <kbd>Space</kbd> plays or cashes out.
      </p>
    </Modal>
  );
}
