/* The lobby thumbnail (see thumbnail.html). */
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/jetbrains-mono/700.css';
import '../src/styles/global.css';
import { Forest } from '../src/components/Forest.tsx';
import { Honeycomb } from '../src/components/Honeycomb.tsx';
import { BEE_LENGTH, BLURS, FRONT_SCALE, FRONT_SPAN, FRONT_SPRITE, SPRITE, makeFrontSprites, makeTopSprites } from '../src/game/beeArt.ts';
import { clueAt, maskOf } from '../src/game/hex.ts';
import { MAX_MULTIPLIER } from '../src/game/math.ts';

// The hive just emptied: its bee dens open, honey found in the middle. Every open cell's clue is the real count of
// bees around it, and none is 0 (a 0 would have flooded its neighbours open).
const BEES = [0, 1, 5, 10, 12];
const OPEN = [3, 4, 8, 9, 13, 14];
const beeMask = maskOf(BEES);
const opened = new Map(OPEN.map((c) => [c, clueAt(c, beeMask)]));

/** Top-view bees: [x, y, length px, heading rad, blur level]. Small ones at the hive, big soft ones near the camera. */
const SWARM: [number, number, number, number, number][] = [
  [700, 150, 34, -2.6, 0],
  [1188, 210, 38, -0.4, 0],
  [1205, 330, 32, -1.2, 0],
  [745, 612, 40, 2.4, 0],
  [640, 330, 46, 3.0, 0],
  [880, 640, 52, 1.9, 0],
  [1060, 118, 44, -0.9, 1],
  [560, 520, 70, 2.7, 1],
  [520, 120, 120, -2.3, 2],
  [1240, 690, 120, 0.7, 2],
];

function Bees() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const dpr = 2;
    canvas.width = 1280 * dpr;
    canvas.height = 720 * dpr;
    const ctx = canvas.getContext('2d')!;
    const top = makeTopSprites();
    const front = makeFrontSprites();
    const stamp = (img: HTMLCanvasElement, box: number, x: number, y: number, k: number, angle: number) => {
      const c = Math.cos(angle) * k * dpr;
      const s = Math.sin(angle) * k * dpr;
      ctx.setTransform(c, s, -s, c, x * dpr, y * dpr);
      ctx.drawImage(img, -box / 2, -box / 2);
    };
    SWARM.forEach(([x, y, len, heading, blur], i) => stamp(top[i % 4][Math.min(blur, BLURS.length - 1)], SPRITE, x, y, len / BEE_LENGTH, heading));
    // The one coming straight at you.
    stamp(front[1], FRONT_SPRITE, 1100, 520, 270 / FRONT_SPAN / FRONT_SCALE, -0.12);
  }, []);
  return <canvas ref={ref} className="thumb-bees" />;
}

function Thumbnail() {
  return (
    <div className="thumb">
      <Forest />
      <div className="thumb-hive">
        <Honeycomb
          roundKey="thumb"
          live={false}
          busy={false}
          opened={opened}
          picks={[]}
          beeCells={BEES}
          odds={null}
          showOdds={false}
          opening={null}
          focus={null}
          onFocus={() => {}}
          onPick={() => {}}
        />
      </div>
      <div className="thumb-shade" />
      <Bees />
      <div className="thumb-title">
        <div className="thumb-hive-word">HIVE</div>
        <div className="thumb-mind">
          MIND
          <svg viewBox="0 0 40 46" aria-hidden>
            <polygon points="20,2 38,12.5 38,33.5 20,44 2,33.5 2,12.5" />
            <path d="M20 13c4.5 6 7.5 9.4 7.5 13a7.5 7.5 0 01-15 0c0-3.6 3-7 7.5-13z" />
          </svg>
        </div>
        <div className="thumb-tag">READ THE BUZZ</div>
        <div className="thumb-sub">UP TO ×{MAX_MULTIPLIER} · PROVABLY FAIR</div>
      </div>
    </div>
  );
}

const css = `
  html, body { width: 1280px; height: 720px; overflow: hidden; }
  .thumb { position: relative; width: 1280px; height: 720px; overflow: hidden; background: #0d1508; }
  .thumb-hive { position: absolute; left: 600px; top: 24px; width: 600px; height: 672px; }
  .thumb-hive .cell-body, .thumb-hive .bee-glyph { animation: none !important; }
  .thumb-shade { position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(90deg, rgba(5, 9, 3, 0.94) 0%, rgba(5, 9, 3, 0.8) 30%, rgba(5, 9, 3, 0.25) 46%, rgba(5, 9, 3, 0) 56%); }
  .thumb-bees { position: absolute; inset: 0; width: 1280px; height: 720px; pointer-events: none; }
  .thumb-title { position: absolute; left: 64px; top: 50%; transform: translateY(-50%); font-family: 'Fredoka', sans-serif; }
  .thumb-hive-word { font-weight: 700; font-size: 40px; line-height: 1; letter-spacing: 0.55em;
    background: linear-gradient(180deg, #ffe680, #ff9a00); -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 0 14px rgba(255, 170, 30, 0.45)); }
  .thumb-mind { display: flex; align-items: center; gap: 18px; margin-top: 2px; font-weight: 700; font-size: 150px; line-height: 0.95;
    letter-spacing: 0.04em; color: #fff4d6; text-shadow: 0 0 34px rgba(255, 186, 60, 0.55), 0 5px 0 rgba(90, 40, 0, 0.7); }
  .thumb-mind svg { width: 62px; height: 72px; filter: drop-shadow(0 3px 0 rgba(90, 40, 0, 0.6)) drop-shadow(0 0 16px rgba(255, 180, 40, 0.5)); }
  .thumb-mind polygon { fill: #f7b62a; stroke: #ffe08a; stroke-width: 2.5; stroke-linejoin: round; }
  .thumb-mind path { fill: #8a4300; }
  .thumb-tag { margin-top: 34px; font-weight: 600; font-size: 26px; letter-spacing: 0.24em; color: #ffc21f; }
  .thumb-sub { margin-top: 14px; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 19px; letter-spacing: 0.14em; color: #e9dcc0; }
`;
document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
createRoot(document.getElementById('root')!).render(<Thumbnail />);
