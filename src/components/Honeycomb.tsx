import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import type { Pick } from '../game/engine.ts';
import { CELLS, cellCenter, hexDistance } from '../game/hex.ts';
import { honeyChance, honeyLayouts, type Odds } from '../game/math.ts';
import { formatPercent } from '../game/money.ts';

const R = 50; // cell spacing (circumradius) in SVG units
const CELL_R = 46.5; // drawn size, leaving a seam of wax between cells
const SQ3 = Math.sqrt(3);
const PAD = 16;
/** Room above the comb for the branch it hangs from. */
const TOP = -4 * R - 58;
const VIEW = `${-2.5 * SQ3 * R - PAD} ${TOP} ${5 * SQ3 * R + 2 * PAD} ${4 * R + PAD - TOP}`;
const CENTER = 9;

const hexPoints = (r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
const HEX = hexPoints(CELL_R);
const HEX_INNER = hexPoints(CELL_R - 8);
// The wax slab behind the cells: every cell's hexagon grown a little; together they make a scalloped comb.
const HEX_SLAB = hexPoints(R + 11);
const HEX_RIM = hexPoints(R + 15);

const POS = CELLS.map((c) => {
  const p = cellCenter(c);
  return { x: p.x * R, y: p.y * R };
});
const at = (i: number) => `translate(${POS[i].x.toFixed(2)} ${POS[i].y.toFixed(2)})`;

/** Bee-risk band for a closed cell's rim: 0 = nearly safe … 3 = probably a bee. */
function riskBand(chance: number): number {
  if (chance >= 0.9) return 0;
  if (chance >= 0.7) return 1;
  if (chance >= 0.4) return 2;
  return 3;
}

/** [x, y, angle°, scale, lit] */
type LeafSpec = [number, number, number, number, boolean];
const LEAVES: LeafSpec[] = [
  // A twig reaching up on the left.
  [-432, -298, 200, 0.9, true],
  [-402, -292, 252, 0.78, false],
  [-382, -280, 160, 0.85, true],
  [-358, -270, 232, 0.7, false],
  // A sprig standing up from the branch.
  [172, -286, 336, 0.85, true],
  [150, -278, 286, 0.68, false],
  [134, -266, 18, 0.7, true],
  // Hanging on the right.
  [300, -162, 82, 0.92, true],
  [286, -182, 28, 0.8, false],
  [270, -197, 120, 0.75, true],
  // The tip of the branch.
  [604, -232, 330, 1.05, true],
  [600, -228, 18, 0.95, false],
  [596, -230, 58, 0.85, true],
  // Further along, for wide screens.
  [-620, -262, 250, 0.9, true],
  [-664, -250, 196, 0.8, false],
  [-900, -268, 292, 1, true],
  [-944, -244, 160, 0.9, false],
];

/** The oak branch the comb hangs from: drawn long, so it runs off the side of the screen. */
const BRANCH = (
  <g className="branch" aria-hidden>
    <path
      className="branch-wood"
      d="M-2600 -276C-1600 -262 -700 -254 0 -252C220 -251 420 -246 600 -236C616 -234 620 -228 604 -226C420 -224 220 -214 0 -212C-700 -210 -1600 -204 -2600 -190Z"
    />
    <path
      className="branch-grain"
      d="M-2600 -262C-1600 -250 -700 -244 0 -243C220 -242 420 -239 580 -234M-2600 -234C-1600 -228 -700 -232 0 -232C220 -232 420 -231 590 -231M-2600 -208C-1600 -210 -700 -220 0 -221C220 -221 420 -225 580 -228"
    />
    <path className="branch-light" d="M-2600 -270C-1600 -257 -700 -250 0 -248C220 -247 420 -243 590 -235" />
    <path className="twig" d="M-330 -254Q-370 -282-432 -298M120 -252Q140 -275 172 -286M250 -216Q276 -190 300 -162" />
    <g className="moss">
      <ellipse cx="-560" cy="-258" rx="34" ry="7" />
      <ellipse cx="-262" cy="-255" rx="30" ry="6" />
      <ellipse cx="-214" cy="-254" rx="18" ry="5" />
      <ellipse cx="190" cy="-251" rx="26" ry="5" />
      <ellipse cx="330" cy="-246" rx="20" ry="4.5" />
    </g>
    {LEAVES.map(([x, y, a, s, lit], i) => (
      <use key={i} href="#leaf" className={lit ? 'leaf lit' : 'leaf'} transform={`translate(${x} ${y}) rotate(${a}) scale(${s})`} />
    ))}
  </g>
);

/** The comb itself behind the cells: a dark rim, the wax that grips the branch, the slab. */
const COMB = (
  <g className="comb-back" aria-hidden>
    {POS.map((_, i) => (
      <polygon key={`r${i}`} className="comb-rim" points={HEX_RIM} transform={at(i)} />
    ))}
    <path className="comb-root" d="M-150 -221C-140 -218-128 -206-116 -182L116 -182C128 -206 140 -218 150 -221Z" />
    {POS.map((_, i) => (
      <polygon key={`s${i}`} className="comb-slab" points={HEX_SLAB} transform={at(i)} />
    ))}
  </g>
);

/**
 * The branch and the comb behind the cells, in an SVG of their own under the cells' SVG. They never change, so the
 * browser keeps them as one cached layer: their big soft shadows aren't redrawn every time a cell animates.
 * Pinned to the top like the cells: the comb always hangs from the top of the stage.
 */
const DECOR = (
  <svg className="hive-decor" viewBox={VIEW} preserveAspectRatio="xMidYMin meet" aria-hidden>
    <defs>
      <linearGradient id="comb-slab" x1="0.2" y1="0" x2="0.5" y2="1">
        <stop offset="0" stopColor="#c58019" />
        <stop offset="0.5" stopColor="#8f560c" />
        <stop offset="1" stopColor="#5c3406" />
      </linearGradient>
      <linearGradient id="bark" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8a643c" />
        <stop offset="0.35" stopColor="#5a3b20" />
        <stop offset="1" stopColor="#23150a" />
      </linearGradient>
      <linearGradient id="leaf-lit" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#9ccc4a" />
        <stop offset="1" stopColor="#4a7f1e" />
      </linearGradient>
      <linearGradient id="leaf-shade" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#557d26" />
        <stop offset="1" stopColor="#2a4812" />
      </linearGradient>
      <g id="leaf">
        <path d="M0 0C14-15 44-18 70 0 44 18 14 15 0 0z" />
        <path d="M3 0H64" fill="none" stroke="rgba(230, 245, 180, 0.45)" strokeWidth="1.5" />
      </g>
    </defs>
    {BRANCH}
    {COMB}
  </svg>
);

export function Honeycomb({
  roundKey,
  live,
  busy,
  opened,
  picks,
  beeCells,
  odds,
  showOdds,
  opening,
  focus,
  onFocus,
  onPick,
}: {
  /** Changes with every round, so per-round animations restart. */
  roundKey: string;
  /** Picks are allowed: a round is in play and not cashing out. */
  live: boolean;
  /** A call is in flight: wait before the next pick. */
  busy: boolean;
  opened: Map<number, number>;
  picks: Pick[];
  beeCells: number[] | null;
  odds: Odds | null;
  showOdds: boolean;
  opening: number | null;
  focus: number | null;
  onFocus: (cell: number | null) => void;
  onPick: (cell: number) => void;
}) {
  const pointer = useRef<string>('mouse');
  const lastPick = picks.length ? picks[picks.length - 1].cell : null;
  const stung = lastPick !== null && picks[picks.length - 1].bee ? lastPick : null;
  const bees = new Set(beeCells ?? []);

  const canPick = (cell: number) =>
    live && !busy && !opened.has(cell) && !(odds && honeyLayouts(odds, cell) === 0);

  const activate = (cell: number) => {
    // On touch there's no hover: the first tap shows a cell's odds, a second tap opens it.
    if (pointer.current === 'touch' && focus !== cell) {
      onFocus(cell);
      return;
    }
    if (canPick(cell)) onPick(cell);
    else onFocus(cell);
  };

  const onKey = (e: KeyboardEvent, cell: number) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (canPick(cell)) onPick(cell);
  };

  return (
    <>
      {DECOR}
      <svg className="hive" viewBox={VIEW} preserveAspectRatio="xMidYMin meet" role="grid" aria-label="The hive">
        <defs>
          <linearGradient id="wax" x1="0" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#ffeaa6" />
            <stop offset="0.45" stopColor="#f6c04f" />
            <stop offset="1" stopColor="#d88a14" />
          </linearGradient>
          <linearGradient id="wax-cap" x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor="#fff3cc" stopOpacity="0.9" />
            <stop offset="0.5" stopColor="#ffd774" stopOpacity="0.35" />
            <stop offset="1" stopColor="#c97a08" stopOpacity="0.25" />
          </linearGradient>
          <radialGradient id="honey" cx="0.42" cy="0.36" r="0.75">
            <stop offset="0" stopColor="#ffd860" />
            <stop offset="0.55" stopColor="#f59a06" />
            <stop offset="1" stopColor="#a85200" />
          </radialGradient>
          <radialGradient id="den" cx="0.5" cy="0.45" r="0.7">
            <stop offset="0" stopColor="#4a2e12" />
            <stop offset="1" stopColor="#1b1006" />
          </radialGradient>
          <radialGradient id="sting" cx="0.5" cy="0.45" r="0.7">
            <stop offset="0" stopColor="#ff6a3d" />
            <stop offset="1" stopColor="#7a0f00" />
          </radialGradient>
          <radialGradient id="bee-gold" cx="0.4" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#ffe680" />
            <stop offset="0.6" stopColor="#f7b21c" />
            <stop offset="1" stopColor="#a8650a" />
          </radialGradient>
          <clipPath id="bee-abdomen">
            <ellipse cx="25" cy="29" rx="17" ry="12.5" />
          </clipPath>
          <symbol id="bee" viewBox="0 0 64 48">
            <path d="M28 38l-3 7M35 39l-.5 6.5M41 37.5l3 6" stroke="#2b1a07" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <ellipse cx="25" cy="29" rx="17" ry="12.5" fill="url(#bee-gold)" />
            <g clipPath="url(#bee-abdomen)" fill="#2b1a07">
              <path d="M13 14h5.5v30H13zM23.5 14h5.5v30h-5.5z" />
            </g>
            <path d="M9 27l-7 2.5 7 2.5z" fill="#2b1a07" />
            <circle cx="40" cy="27" r="9" fill="#a8701f" />
            <circle cx="40" cy="27" r="9" fill="none" stroke="#ffd25a" strokeWidth="3" strokeDasharray="1.2 1.6" />
            <circle cx="51" cy="28" r="7.5" fill="#2b1a07" />
            <ellipse cx="53.5" cy="25.5" rx="3" ry="3.4" fill="#fff" />
            <circle cx="54.3" cy="26" r="1.7" fill="#140b03" />
            <path d="M53 21c1-5 4-7.5 8-8M49 21c0-5 1.5-8.5 4.5-10.5" stroke="#2b1a07" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <ellipse cx="30" cy="13" rx="12.5" ry="7" transform="rotate(-22 30 13)" fill="#eaf4ff" fillOpacity="0.85" stroke="#fff" strokeWidth="1.2" />
            <ellipse cx="40" cy="12" rx="10" ry="5.6" transform="rotate(24 40 12)" fill="#eaf4ff" fillOpacity="0.7" stroke="#fff" strokeWidth="1" />
          </symbol>
        </defs>

        <g className="comb">
          {CELLS.map(({ index: i }) => {
            const clue = opened.get(i);
            const isOpen = clue !== undefined;
            const isBee = !isOpen && bees.has(i);
            const chance = odds && !isOpen ? honeyChance(odds, i) : null;
            const sureHoney = chance === 1;
            const sureBee = chance === 0;
            const pickable = canPick(i);
            // Ripples: a flood opens outwards from the pick; at the end the bees show from the sting outwards.
            const origin = stung ?? lastPick;
            const delay = origin === null ? 0 : hexDistance(origin, i) * (isBee ? 90 : 70);
            // A fresh hive builds from the middle out.
            const enter = 40 + hexDistance(CENTER, i) * 70;
            const state = isOpen ? 'open' : isBee ? (i === stung ? 'bee stung' : 'bee') : 'closed';
            const label = isOpen
              ? `Honey, ${clue} bee${clue === 1 ? '' : 's'} next to it`
              : isBee
                ? 'Bee'
                : chance !== null
                  ? `Closed cell, ${formatPercent(chance)} honey`
                  : 'Closed cell';
            const cls = [
              'cell',
              state,
              !isOpen && !isBee && chance !== null && showOdds ? `risk-${riskBand(chance)}` : '',
              pickable ? 'pickable' : '',
              focus === i ? 'focus' : '',
              opening === i ? 'opening' : '',
              sureHoney ? 'sure-honey' : '',
              sureBee ? 'sure-bee' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <g
                key={`${roundKey}-${i}`}
                className={cls}
                data-cell={i}
                transform={at(i)}
                style={{ '--d': `${delay}ms`, '--in': `${enter}ms` } as CSSProperties}
                role="gridcell"
                tabIndex={pickable ? 0 : -1}
                aria-label={label}
                onPointerDown={(e) => (pointer.current = e.pointerType)}
                onPointerEnter={(e) => e.pointerType === 'mouse' && onFocus(i)}
                onPointerLeave={(e) => e.pointerType === 'mouse' && focus === i && onFocus(null)}
                onFocus={() => onFocus(i)}
                onClick={() => activate(i)}
                onKeyDown={(e) => onKey(e, i)}
              >
                <g className="cell-body">
                  {isOpen ? (
                    <>
                      <polygon className="cell-honey" points={HEX} />
                      <ellipse className="cell-gloss" cx="-13" cy="-18" rx="17" ry="9" transform="rotate(-24 -13 -18)" />
                      {clue! > 0 ? (
                        <>
                          <circle className="clue-badge" r="19" />
                          <text className={`clue clue-${clue}`} y="1">
                            {clue}
                          </text>
                        </>
                      ) : (
                        <path className="clue-empty" d="M0 -12c6 8 10.5 12.5 10.5 17.5a10.5 10.5 0 01-21 0C-10.5 0.5 -6 -4 0 -12z" />
                      )}
                    </>
                  ) : isBee ? (
                    <>
                      <polygon className="cell-den" points={HEX} />
                      <use href="#bee" x="-28" y="-21" width="56" height="42" className="bee-glyph" />
                    </>
                  ) : (
                    <>
                      <polygon className="cell-wax" points={HEX} />
                      <polygon className="cell-cap" points={HEX_INNER} />
                      <path className="cell-crack" d="M-14 -20l8 12-6 6 10 9M10 -18l-4 13 9 6" />
                      {chance !== null && showOdds && (
                        <g className="odds">
                          {sureHoney ? (
                            <text className="odds-sure" y="5">
                              SAFE
                            </text>
                          ) : sureBee ? (
                            <use href="#bee" x="-18" y="-13.5" width="36" height="27" className="odds-bee" />
                          ) : (
                            <>
                              <text className="odds-pct" y="2">
                                {formatPercent(chance)}
                              </text>
                              <text className="odds-boost" y="20">
                                ×{(1 / chance).toFixed(2)}
                              </text>
                            </>
                          )}
                        </g>
                      )}
                    </>
                  )}
                </g>
              </g>
            );
          })}
        </g>
      </svg>
    </>
  );
}
