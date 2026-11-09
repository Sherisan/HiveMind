import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BetPanel } from './components/BetPanel.tsx';
import { Forest } from './components/Forest.tsx';
import { HistoryModal } from './components/HistoryModal.tsx';
import { Honeycomb } from './components/Honeycomb.tsx';
import { Hud } from './components/Hud.tsx';
import { Intel } from './components/Intel.tsx';
import { ResultOverlay } from './components/ResultOverlay.tsx';
import { RulesModal } from './components/RulesModal.tsx';
import { Effects, type Den } from './game/effects.ts';
import { createLocalEngine } from './game/engine.ts';
import { hexDistance } from './game/hex.ts';
import { createHttpEngine } from './game/httpEngine.ts';
import { START, formatMultiplier, isLevel, oddsFor, payoutFor, play, type BeeLevel, type Played } from './game/math.ts';
import { formatMoney } from './game/money.ts';
import { sound } from './game/sound.ts';
import { useGame } from './game/useGame.ts';

// The game API by default; ?demo (or VITE_DEMO=1) plays offline against the in-browser engine with a demo wallet.
const demo = import.meta.env.VITE_DEMO === '1' || new URLSearchParams(window.location.search).has('demo');
const engine = demo ? createLocalEngine() : createHttpEngine();

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

type ModalKind = 'rules' | 'history' | 'fairness' | null;

function stored<T>(key: string, fallback: T, ok: (v: unknown) => v is T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return ok(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

export default function App() {
  const game = useGame(engine);
  const { snap, round, phase, actions } = game;
  const [amount, setAmount] = useState(5);
  const [level, setLevelState] = useState<BeeLevel>(() => stored('hivemind.level', 5 as BeeLevel, isLevel));
  const [showOdds, setShowOddsState] = useState(() => stored('hivemind.odds', true, isBool));
  const [focus, setFocus] = useState<number | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [muted, setMuted] = useState(sound.isMuted());
  const [flash, setFlash] = useState({ key: 0, strength: 0 });
  const worldRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fx = useRef<Effects | null>(null);

  const setLevel = (l: BeeLevel) => {
    setLevelState(l);
    store('hivemind.level', l);
  };
  const setShowOdds = (on: boolean) => {
    setShowOddsState(on);
    store('hivemind.odds', on);
  };

  const live = phase === 'live';
  const currency = snap?.currency ?? 'ZAR';
  // The finished board stays up until its result is dismissed; then a fresh hive waits for the next bet.
  const board = round && (live || (phase === 'ended' && !game.resting)) ? round : null;

  // Replay what the server showed (picks and clues) into the board state, the fair value and the live odds.
  const derived = useMemo(() => {
    if (!board) return null;
    const clues = new Map(board.opened.map((o) => [o.cell, o.clue]));
    const bees = new Map(board.picks.map((p) => [p.cell, p.bee]));
    let played: Played | null = null;
    try {
      played = play(
        board.bees,
        board.picks.map((p) => p.cell),
        (c) => bees.get(c) ?? false,
        (c) => clues.get(c) ?? -1,
      );
    } catch {
      played = null;
    }
    const odds = board.status === 'live' && played ? oddsFor(board.bees, played.info) : null;
    return { clues, played, odds };
  }, [board]);

  // Keep the stake inside the table limits once the server sends them.
  const minBet = snap?.limits.minBet;
  const maxBet = snap?.limits.maxBet;
  useEffect(() => {
    if (minBet !== undefined && maxBet !== undefined) setAmount((a) => Math.min(maxBet, Math.max(minBet, a)));
  }, [minBet, maxBet]);

  /** Shake everything, backdrop included, as if the camera took the hit. */
  const shake = useCallback((strength: number) => {
    const el = worldRef.current;
    if (!el || reducedMotion()) return;
    const a = 12 * strength;
    el.animate(
      [0, -1, 0.8, -0.55, 0.35, -0.15, 0].map((k, i) => ({
        transform: `translate(${(k * a).toFixed(1)}px, ${((i % 2 ? 0.7 : -0.6) * Math.abs(k) * a).toFixed(1)}px) rotate(${(k * 0.35 * strength).toFixed(2)}deg)`,
      })),
      { duration: 380 + 260 * strength, easing: 'ease-out' },
    );
  }, []);

  // The effects canvas covers the whole screen, so the swarm can fly out over everything.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const effects = new Effects(canvas);
    effects.onImpact = (strength) => {
      shake(strength);
      setFlash((f) => ({ key: f.key + 1, strength }));
      sound.impact();
    };
    effects.onFlyBy = (pan) => sound.flyBy(pan);
    fx.current = effects;
    // 1.5× is plenty for soft, fast-moving bees, and saves a lot of fill on high-density screens.
    const fit = () => effects.resize(window.innerWidth, window.innerHeight, Math.min(1.5, window.devicePixelRatio || 1));
    fit();
    window.addEventListener('resize', fit);
    return () => {
      window.removeEventListener('resize', fit);
      effects.stop();
      fx.current = null;
    };
  }, [shake]);

  const combRect = useCallback(() => stageRef.current?.querySelector('.comb-back')?.getBoundingClientRect() ?? null, []);

  // Where the comb is on screen: the idle bees and the angry cloud circle it.
  const measureHive = useCallback(() => {
    const r = combRect();
    if (r && r.width > 0) fx.current?.setHive({ x: r.left, y: r.top, w: r.width, h: r.height });
  }, [combRect]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    measureHive();
    const ro = new ResizeObserver(measureHive);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [measureHive]);

  const resting = !board;
  useEffect(() => {
    fx.current?.setAmbient(resting);
  }, [resting]);

  /** Centre of a cell on screen. */
  const cellPoint = useCallback((cell: number) => {
    const el = stageRef.current?.querySelector(`[data-cell="${cell}"]`)?.getBoundingClientRect();
    return el ? { x: el.left + el.width / 2, y: el.top + el.height / 2 } : null;
  }, []);
  /** A cell's width on screen (the comb is about 5.7 cells wide, rim included). */
  const cellSize = useCallback(() => (combRect()?.width ?? 456) / 5.7, [combRect]);

  // React to each new pick: honey splashes (and the cells a flood opens splash after it); a bee empties the hive.
  const seen = useRef({ id: '', picks: 0, opened: 0 });
  useEffect(() => {
    if (!round) return;
    const was = seen.current;
    seen.current = { id: round.id, picks: round.picks.length, opened: round.opened.length };
    if (was.id !== round.id) {
      if (round.status === 'live') fx.current?.calm();
      return;
    }
    if (round.picks.length <= was.picks) return;
    const last = round.picks[round.picks.length - 1];
    const at = cellPoint(last.cell);
    const size = cellSize();
    if (last.bee) {
      sound.sting();
      sound.swarm();
      shake(0.35);
      setFlash((f) => ({ key: f.key + 1, strength: 0.45 }));
      const dens: Den[] = [];
      for (const c of round.beeCells ?? []) {
        const p = c === last.cell ? null : cellPoint(c);
        // The same ripple the hive uses to show the bees.
        if (p) dens.push({ ...p, delay: (hexDistance(last.cell, c) * 90 + 150) / 1000 });
      }
      if (at) fx.current?.swarm(at, dens, size);
    } else {
      sound.honey(round.picks.length);
      if (at) fx.current?.honey(at, size);
      const flooded = round.opened.slice(was.opened).map((o) => o.cell).filter((c) => c !== last.cell);
      if (flooded.length) sound.flood(flooded.length);
      for (const c of flooded) {
        const p = cellPoint(c);
        if (p) fx.current?.honey(p, size, { delay: (hexDistance(last.cell, c) * 70) / 1000, small: true });
      }
    }
  }, [round, cellPoint, cellSize, shake]);

  // Confetti for a win, not for a finished round restored on load.
  const lastStatus = useRef(round?.status);
  useEffect(() => {
    const status = round?.status;
    if (lastStatus.current === 'live' && (status === 'cashed' || status === 'cleared' || status === 'maxed')) {
      fx.current?.confetti(status === 'cashed' ? 70 : 150);
    }
    lastStatus.current = status;
  }, [round?.status]);

  useEffect(() => {
    if (!live) setFocus(null);
  }, [live]);

  // Keyboard: Space plays or cashes out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modal || (e.target as HTMLElement).tagName === 'INPUT' || e.code !== 'Space') return;
      if ((e.target as HTMLElement).closest?.('.cell')) return; // Space on a focused cell opens it
      e.preventDefault();
      if (e.repeat) return;
      if (live) {
        if ((round?.multiplier ?? 0) > 0 && game.pending === 0 && !game.closing) actions.cashOut();
      } else if (phase !== 'loading' && game.pending === 0) actions.bet(amount, level);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, live, phase, round, amount, level, actions, game.pending, game.closing]);

  const toggleSound = () => {
    sound.setMuted(!muted);
    setMuted(!muted);
  };

  const multiplier = board?.multiplier ?? 0;
  const opened = derived?.clues ?? new Map<number, number>();

  return (
    <div className="world" ref={worldRef}>
      <Forest />

      <div className="game-root">
        <Hud
          balance={snap?.balance ?? 0}
          currency={currency}
          demo={demo}
          muted={muted}
          onToggleSound={toggleSound}
          onRules={() => setModal('rules')}
          onHistory={() => setModal('history')}
          onFairness={() => setModal('fairness')}
        />

        <main className="stage" ref={stageRef}>
          <div className="hive-wrap">
            <Honeycomb
              roundKey={board?.id ?? 'rest'}
              live={live && !game.closing}
              busy={game.pending > 0}
              opened={opened}
              picks={board?.picks ?? []}
              beeCells={board?.beeCells ?? null}
              odds={derived?.odds ?? null}
              showOdds={showOdds}
              opening={game.opening}
              focus={focus}
              onFocus={setFocus}
              onPick={(cell) => void actions.pick(cell)}
            />
          </div>

          <div className="stage-foot">
            {live &&
              (multiplier > 0 ? (
                <div className="mult">
                  <b key={multiplier} className="mult-value">
                    {formatMultiplier(multiplier)}
                  </b>
                  <span>{formatMoney(payoutFor(board!.bet, multiplier), currency)}</span>
                </div>
              ) : (
                <div className="mult waiting">
                  <b className="mult-value">PICK A CELL</b>
                  <span>Clues count the bees next door</span>
                </div>
              ))}
            {!board && game.resting && phase !== 'loading' && (
              <div className="idle-card">
                <h1>
                  Read the buzz. <span>Find the honey.</span>
                </h1>
                <p>Cash out before the sting. Choose your bees and press PLAY.</p>
              </div>
            )}
          </div>

          <ResultOverlay round={board} currency={currency} visible={game.showResult} onClose={actions.dismissResult} />
        </main>

        <Intel
          phase={board ? phase : 'idle'}
          level={level}
          onLevel={setLevel}
          roundLevel={board?.bees ?? null}
          odds={derived?.odds ?? null}
          value={derived?.played?.value ?? START}
          bet={board?.bet ?? amount}
          currency={currency}
          focus={focus}
          opened={opened}
          showOdds={showOdds}
          onShowOdds={setShowOdds}
        />

        <BetPanel
          phase={phase}
          round={round}
          amount={amount}
          setAmount={setAmount}
          level={level}
          setLevel={setLevel}
          balance={snap?.balance ?? 0}
          currency={currency}
          limits={snap?.limits ?? { minBet: 1, maxBet: 10 }}
          pending={game.pending}
          closing={game.closing}
          onBet={() => actions.bet(amount, level)}
          onCashOut={actions.cashOut}
          onRefill={demo ? actions.refill : undefined}
        />

        {game.error && (
          <div className="toast" role="alert">
            {game.error}
          </div>
        )}

        {modal === 'rules' && <RulesModal onClose={() => setModal(null)} />}
        {(modal === 'history' || modal === 'fairness') && snap && (
          <HistoryModal
            snap={snap}
            initialTab={modal}
            canChangeSeed={!live}
            onSetClientSeed={actions.setClientSeed}
            onClose={() => setModal(null)}
          />
        )}
      </div>

      <canvas className="fx" ref={canvasRef} aria-hidden />
      {flash.key > 0 && <div key={flash.key} className="impact-flash" style={{ '--flash': flash.strength } as CSSProperties} aria-hidden />}
    </div>
  );
}
