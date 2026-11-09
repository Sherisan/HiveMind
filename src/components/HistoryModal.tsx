import { useMemo, useState } from 'react';
import type { HistoryEntry, Snapshot } from '../game/engine.ts';
import { beeCellsFor, sha256Hex } from '../game/fair.ts';
import { CELLS, cellCenter, clueAt, has, maskOf } from '../game/hex.ts';
import { LEVEL_NAMES, cashMultiplier, formatMultiplier, payoutFor, play, type Played } from '../game/math.ts';
import { formatMoney, formatPercent } from '../game/money.ts';
import { CheckIcon } from './Icons.tsx';
import { Modal } from './Modal.tsx';

type Tab = 'history' | 'fairness';
type Verdict = 'pending' | 'ok' | 'bad';

const RESULT_LABEL = { cashed: 'Cashed', cleared: 'Cleared', maxed: 'Max win', stung: 'Stung' } as const;

function replayOf(e: HistoryEntry): Played | null {
  const bees = maskOf(e.beeCells);
  try {
    return play(
      e.bees,
      e.picks.map((p) => p.cell),
      (c) => has(bees, c),
      (c) => clueAt(c, bees),
    );
  } catch {
    return null;
  }
}

/**
 * Re-derive the round from the revealed seed: the hash, where the bees hid, the odds of every pick, the multiplier
 * and the payout.
 */
async function verify(e: HistoryEntry): Promise<boolean> {
  if ((await sha256Hex(e.serverSeed)) !== e.serverSeedHash) return false;
  const drawn = await beeCellsFor(e.serverSeed, e.clientSeed, e.nonce, e.bees);
  const sorted = (cells: number[]) => [...cells].sort((a, b) => a - b).join();
  if (sorted(drawn) !== sorted(e.beeCells)) return false;
  const bees = maskOf(drawn);
  let p: Played;
  try {
    p = play(
      e.bees,
      e.picks.map((x) => x.cell),
      (c) => has(bees, c),
      (c) => clueAt(c, bees),
    );
  } catch {
    return false;
  }
  if (p.steps.length !== e.picks.length || p.steps.some((s, i) => s.bee !== e.picks[i].bee)) return false;
  if (e.status === 'stung') return p.outcome === 'stung' && e.multiplier === 0 && e.payout === 0;
  // The server closes a round left idle before its first pick by returning the stake: ×1.
  if (e.picks.length === 0) return e.status === 'cashed' && e.multiplier === 1 && e.payout === e.bet;
  if ((p.outcome === 'live' ? 'cashed' : p.outcome) !== e.status) return false;
  const m = cashMultiplier(p);
  return m === e.multiplier && payoutFor(e.bet, m) === e.payout;
}

const MINI = CELLS.map((c) => {
  const p = cellCenter(c);
  return { x: p.x * 10, y: p.y * 10 };
});
const MINI_HEX = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i - Math.PI / 2;
  return `${(9.2 * Math.cos(a)).toFixed(2)},${(9.2 * Math.sin(a)).toFixed(2)}`;
}).join(' ');

/** The finished hive in miniature: honey picked, honey that flooded open, bees, and the sting. */
function MiniHive({ entry, played }: { entry: HistoryEntry; played: Played | null }) {
  const picked = new Set(entry.picks.filter((p) => !p.bee).map((p) => p.cell));
  const stung = entry.status === 'stung' ? entry.picks[entry.picks.length - 1]?.cell : undefined;
  const bees = new Set(entry.beeCells);
  return (
    <svg className="mini-hive" viewBox="-48 -42 96 84" aria-hidden>
      {MINI.map((p, i) => {
        const cls =
          i === stung ? 'm-sting' : picked.has(i) ? 'm-pick' : played && has(played.info.opened, i) ? 'm-open' : bees.has(i) ? 'm-bee' : 'm-closed';
        return <polygon key={i} className={cls} points={MINI_HEX} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`} />;
      })}
    </svg>
  );
}

function HistoryRow({
  e,
  open,
  onToggle,
  verdict,
  onVerify,
  currency,
}: {
  e: HistoryEntry;
  open: boolean;
  onToggle: () => void;
  verdict: Verdict | undefined;
  onVerify: () => void;
  currency: string;
}) {
  const played = useMemo(() => replayOf(e), [e]);
  return (
    <li className={`h-row h-${e.status}`}>
      <button className="h-main" onClick={onToggle}>
        <span className="h-time">{new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <span className="h-board">
          <MiniHive entry={e} played={played} />
          <em>
            {e.bees} bees · {e.picks.length} pick{e.picks.length === 1 ? '' : 's'}
          </em>
        </span>
        <span className="h-result">{e.status === 'stung' ? RESULT_LABEL.stung : formatMultiplier(e.multiplier)}</span>
        <span className="h-pay">{e.payout > 0 ? `+${formatMoney(e.payout, currency)}` : `−${formatMoney(e.bet, currency)}`}</span>
      </button>
      {open && (
        <div className="h-detail">
          <dl>
            <dt>Bet</dt>
            <dd>
              {formatMoney(e.bet, currency)} · {e.bees} bees ({LEVEL_NAMES[e.bees]})
            </dd>
            <dt>Result</dt>
            <dd>
              {RESULT_LABEL[e.status]}
              {e.status !== 'stung' && ` at ${formatMultiplier(e.multiplier)}`}
            </dd>
            <dt>Picks</dt>
            <dd>
              <ol className="h-picks">
                {(played?.steps ?? []).map((s, i) => (
                  <li key={i} className={s.bee ? 'bee' : ''}>
                    #{i + 1} cell {s.cell}: {formatPercent(s.honey / s.total)} honey ({s.honey.toLocaleString()} of {s.total.toLocaleString()} layouts),{' '}
                    {s.bee ? 'bee' : `honey, boost ×${(s.total / s.honey).toFixed(3)}`}
                  </li>
                ))}
              </ol>
            </dd>
            <dt>Bees in</dt>
            <dd className="mono">{e.beeCells.join(', ')}</dd>
            <dt>Server seed</dt>
            <dd className="mono">{e.serverSeed}</dd>
            <dt>Seed hash</dt>
            <dd className="mono">{e.serverSeedHash}</dd>
            <dt>Client seed</dt>
            <dd className="mono">{e.clientSeed}</dd>
            <dt>Nonce</dt>
            <dd className="mono">{e.nonce}</dd>
          </dl>
          <button className={`verify ${verdict ?? ''}`} onClick={onVerify} disabled={verdict === 'pending'}>
            {verdict === 'ok' ? (
              <>
                <CheckIcon width={16} height={16} /> Verified
              </>
            ) : verdict === 'bad' ? (
              'Verification failed'
            ) : (
              'Verify round'
            )}
          </button>
        </div>
      )}
    </li>
  );
}

export function HistoryModal({
  snap,
  initialTab,
  canChangeSeed,
  onSetClientSeed,
  onClose,
}: {
  snap: Snapshot;
  initialTab: Tab;
  canChangeSeed: boolean;
  onSetClientSeed: (seed: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [open, setOpen] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [seed, setSeed] = useState(snap.fairness.clientSeed);

  const runVerify = async (e: HistoryEntry) => {
    setVerdicts((v) => ({ ...v, [e.id]: 'pending' }));
    let ok = false;
    try {
      ok = await verify(e);
    } catch {
      ok = false;
    }
    setVerdicts((v) => ({ ...v, [e.id]: ok ? 'ok' : 'bad' }));
  };

  return (
    <Modal title={tab === 'history' ? 'BET HISTORY' : 'PROVABLY FAIR'} onClose={onClose}>
      <div className="tabs">
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
          History
        </button>
        <button className={tab === 'fairness' ? 'on' : ''} onClick={() => setTab('fairness')}>
          Fairness
        </button>
      </div>

      {tab === 'history' ? (
        snap.history.length === 0 ? (
          <p className="muted">No rounds yet. Press PLAY to get started.</p>
        ) : (
          <ul className="history">
            {snap.history.map((e) => (
              <HistoryRow
                key={e.id}
                e={e}
                open={open === e.id}
                onToggle={() => setOpen(open === e.id ? null : e.id)}
                verdict={verdicts[e.id]}
                onVerify={() => runVerify(e)}
                currency={snap.currency}
              />
            ))}
          </ul>
        )
      ) : (
        <div className="fair">
          <p className="muted">
            Before every round you see a SHA-256 hash of the secret server seed. The cells start as the list 0 to 18, and bee{' '}
            <i>k</i> takes the cell at position <code>HMAC_SHA256(serverSeed, clientSeed:nonce:k) → 0…cells left−1</code>,
            which then leaves the list. When the round ends the server seed is revealed, so you can check it matches the hash,
            find the same bees, and replay the odds of every pick.
          </p>
          <label>Next server seed (hashed)</label>
          <div className="mono field">{snap.fairness.serverSeedHash}</div>
          <label htmlFor="client-seed">Client seed</label>
          <div className="seed-row">
            <input id="client-seed" className="mono field" value={seed} onChange={(e) => setSeed(e.target.value)} disabled={!canChangeSeed} />
            <button className="btn" disabled={!canChangeSeed || seed.trim() === snap.fairness.clientSeed} onClick={() => onSetClientSeed(seed)}>
              Change
            </button>
          </div>
          <label>Nonce</label>
          <div className="mono field">{snap.fairness.nonce}</div>
        </div>
      )}
    </Modal>
  );
}
