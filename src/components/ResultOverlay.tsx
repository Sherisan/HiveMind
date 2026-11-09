import type { RoundView } from '../game/engine.ts';
import { formatMultiplier } from '../game/math.ts';
import { formatMoney } from '../game/money.ts';

export function ResultOverlay({
  round,
  currency,
  visible,
  onClose,
}: {
  round: RoundView | null;
  currency: string;
  visible: boolean;
  onClose: () => void;
}) {
  if (!visible || !round || round.status === 'live') return null;
  const honey = round.picks.filter((p) => !p.bee).length;
  const cells = `${honey} cell${honey === 1 ? '' : 's'}`;
  const win = `+${formatMoney(round.payout, currency)}`;

  const view = {
    cashed: { title: 'SWEET!', amount: win, meta: `Cashed out at ${formatMultiplier(round.multiplier)} after ${cells}` },
    cleared: { title: 'HIVE CLEARED!', amount: win, meta: `Every drop of honey found · ${formatMultiplier(round.multiplier)}` },
    maxed: { title: 'MAX WIN!', amount: win, meta: `${formatMultiplier(round.multiplier)} · the top prize` },
    stung: {
      title: 'STUNG!',
      amount: `−${formatMoney(round.bet, currency)}`,
      meta: round.multiplier > 0 ? `A bee was waiting in there · you had ${formatMultiplier(round.multiplier)}` : 'A bee was waiting in there',
    },
  }[round.status];

  return (
    <div className={`result result-${round.status}`} onClick={onClose} role="status">
      <div className="result-card">
        <div className="result-title">{view.title}</div>
        <div className="result-amount">{view.amount}</div>
        <div className="result-meta">{view.meta}</div>
        <small>Tap to continue</small>
      </div>
    </div>
  );
}
