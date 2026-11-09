import { formatMoney } from '../game/money.ts';
import { ClockIcon, HelpIcon, ShieldIcon, SoundIcon } from './Icons.tsx';

export function Logo() {
  return (
    <div className="logo" aria-label="Hive Mind">
      <svg className="logo-hex" viewBox="0 0 40 46" aria-hidden>
        <polygon points="20,2 38,12.5 38,33.5 20,44 2,33.5 2,12.5" />
        <path d="M20 13c4.5 6 7.5 9.4 7.5 13a7.5 7.5 0 01-15 0c0-3.6 3-7 7.5-13z" />
      </svg>
      <span className="logo-hive">HIVE</span>
      <span className="logo-mind">MIND</span>
    </div>
  );
}

export function Hud({
  balance,
  currency,
  demo,
  muted,
  onToggleSound,
  onRules,
  onHistory,
  onFairness,
}: {
  balance: number;
  currency: string;
  demo: boolean;
  muted: boolean;
  onToggleSound: () => void;
  onRules: () => void;
  onHistory: () => void;
  onFairness: () => void;
}) {
  return (
    <header className="hud">
      <Logo />
      <div className="hud-right">
        <div className="balance">
          <span className="balance-label">{demo ? 'DEMO BALANCE' : 'BALANCE'}</span>
          <span className="balance-value">{formatMoney(balance, currency)}</span>
        </div>
        <button className="icon-btn fair-btn" onClick={onFairness} aria-label="Provably fair" title="Provably fair">
          <ShieldIcon />
        </button>
        <button className="icon-btn" onClick={onHistory} aria-label="Bet history" title="Bet history">
          <ClockIcon />
        </button>
        <button className="icon-btn" onClick={onRules} aria-label="How to play" title="How to play">
          <HelpIcon />
        </button>
        <button className="icon-btn" onClick={onToggleSound} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
          <SoundIcon muted={muted} />
        </button>
      </div>
    </header>
  );
}
