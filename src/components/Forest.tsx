/*
 * The backdrop: the hive hangs in an old oak in a sunlit forest. The painted layers are one static SVG; the light
 * shafts, bokeh, pollen and the sprigs swaying in the top corners are separate elements animated with transform and
 * opacity only, so the browser composites them without repainting the scene.
 */
import type { CSSProperties } from 'react';

const W = 1600;
const H = 1000;

/** Seeded, so the forest is the same on every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = rng(7331);
const between = (a: number, b: number) => a + random() * (b - a);
const f1 = (v: number) => v.toFixed(1);

/** A trunk rising from below the frame to above it: flared roots, a slight taper and lean. */
function trunk(x: number, w: number, lean: number): string {
  const b = H + 40;
  const top = -80;
  const tw = w * 0.72;
  const flare = w * 0.45;
  const xt = x + lean;
  return [
    `M${f1(x - w / 2 - flare)} ${b}`,
    `C${f1(x - w / 2)} ${b - 60} ${f1(x - w / 2)} ${b - 160} ${f1(x - w / 2 + lean * 0.25)} ${b - 280}`,
    `L${f1(xt - tw / 2)} ${top}`,
    `L${f1(xt + tw / 2)} ${top}`,
    `L${f1(x + w / 2 + lean * 0.25)} ${b - 280}`,
    `C${f1(x + w / 2)} ${b - 160} ${f1(x + w / 2)} ${b - 60} ${f1(x + w / 2 + flare)} ${b}`,
    'Z',
  ].join(' ');
}

/** A tapering limb from (x, y) at `angle` (radians; 0 = right, negative = up), sagging a little, `w` thick at the base. */
function limb(x: number, y: number, len: number, angle: number, w: number): string {
  const ex = x + Math.cos(angle) * len;
  const ey = y + Math.sin(angle) * len;
  const nx = -Math.sin(angle) * w;
  const ny = Math.cos(angle) * w;
  const mx = x + Math.cos(angle) * len * 0.5;
  const my = y + Math.sin(angle) * len * 0.5 + len * 0.07;
  return `M${f1(x + nx)} ${f1(y + ny)} Q${f1(mx + nx * 0.45)} ${f1(my + ny * 0.45)} ${f1(ex)} ${f1(ey)} Q${f1(mx - nx * 0.45)} ${f1(my - ny * 0.45)} ${f1(x - nx)} ${f1(y - ny)}Z`;
}

/** A fern frond or grass blade from (x, y). */
function blade(x: number, y: number, len: number, angle: number, w: number, bend: number): string {
  const ex = x + Math.cos(angle + bend) * len;
  const ey = y + Math.sin(angle + bend) * len;
  const mx = x + Math.cos(angle) * len * 0.55;
  const my = y + Math.sin(angle) * len * 0.55;
  const nx = -Math.sin(angle) * w;
  const ny = Math.cos(angle) * w;
  return `M${f1(x)} ${f1(y)} Q${f1(mx + nx)} ${f1(my + ny)} ${f1(ex)} ${f1(ey)} Q${f1(mx - nx)} ${f1(my - ny)} ${f1(x)} ${f1(y)}Z`;
}

const FAR = Array.from({ length: 12 }, (_, i) => trunk(30 + i * 140 + between(-40, 40), between(22, 54), between(-40, 40)));

const MID = [
  { x: 170, w: 86, lean: 24 },
  { x: 352, w: 52, lean: -26 },
  { x: 1080, w: 64, lean: 18 },
  { x: 1290, w: 96, lean: -18 },
  { x: 1480, w: 58, lean: 22 },
].map((t) => trunk(t.x, t.w, t.lean));

const LIMBS = [
  limb(196, 300, 240, -2.45, 13),
  limb(184, 540, 190, -0.5, 11),
  limb(352, 420, 150, -0.75, 8),
  limb(1086, 380, 210, -0.62, 10),
  limb(1284, 250, 270, -2.6, 15),
  limb(1300, 540, 180, -0.42, 11),
];

const NEAR = [trunk(56, 200, 14), trunk(1572, 150, -10)];

/** Dark masses of foliage closing the canopy, with a gap where the sun gets through. */
const CANOPY_MASSES = [
  { cx: 40, cy: -30, rx: 260, ry: 120 },
  { cx: 620, cy: -50, rx: 240, ry: 100 },
  { cx: 860, cy: -20, rx: 220, ry: 110 },
  { cx: 1090, cy: -40, rx: 260, ry: 120 },
  { cx: 1330, cy: -10, rx: 240, ry: 130 },
  { cx: 1580, cy: -30, rx: 220, ry: 140 },
  { cx: 140, cy: 60, rx: 150, ry: 70 },
  { cx: 1480, cy: 90, rx: 170, ry: 80 },
];

const LEAF_TONES = ['#1b2b11', '#233816', '#2d461b'];
const CANOPY = Array.from({ length: 190 }, () => {
  const x = between(-40, W + 40);
  const y = -40 + Math.pow(random(), 1.7) * 260;
  const lit = x > 120 && x < 760 && y < 170 && random() < 0.45; // backlit by the sun
  return {
    x,
    y,
    r: between(0, 360),
    s: between(0.9, 2.4),
    fill: lit ? (random() < 0.5 ? '#88aa3c' : '#a8c856') : LEAF_TONES[Math.floor(random() * LEAF_TONES.length)],
    o: lit ? 0.85 : 1,
  };
});

const FERNS = [40, 230, 420, 610, 800, 990, 1180, 1370, 1560].flatMap((x0) => {
  const n = 6 + Math.floor(random() * 4);
  const base = H - between(10, 50);
  return Array.from({ length: n }, (_, i) => ({
    d: blade(
      x0 + between(-20, 20),
      base,
      between(110, 230),
      -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.2 + between(-0.15, 0.15),
      between(9, 16),
      between(-0.4, 0.4),
    ),
    fill: random() < 0.5 ? '#16230d' : '#1f3013',
  }));
});

const RAYS = [
  { left: 3, width: 7, dur: 9, delay: 0 },
  { left: 12, width: 11, dur: 12, delay: -4 },
  { left: 23, width: 6, dur: 8, delay: -2 },
  { left: 32, width: 13, dur: 14, delay: -7 },
  { left: 46, width: 8, dur: 10, delay: -5 },
];

const BOKEH = Array.from({ length: 18 }, () => ({
  left: between(0, 100),
  top: between(0, 55),
  size: between(18, 110),
  dur: between(6, 13),
  delay: between(-13, 0),
  cool: random() < 0.3,
}));

const POLLEN = Array.from({ length: 28 }, () => ({
  left: between(0, 100),
  top: between(10, 100),
  size: between(2, 4.5),
  dur: between(16, 34),
  delay: between(-34, 0),
  dx: between(-60, 60),
  dy: between(-260, -120),
}));

/** A twig with leaves, hanging into a top corner. */
const SPRIG = (() => {
  const r = rng(99);
  const p = [
    [0, 20],
    [110, 34],
    [210, 70],
    [330, 150],
  ];
  const leaves: { x: number; y: number; ang: number; s: number; dark: boolean }[] = [];
  for (let i = 0; i < 11; i++) {
    const t = 0.12 + (i / 10) * 0.86;
    const u = 1 - t;
    const x = 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0];
    const y = u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1];
    const dx = 3 * u * u * (p[1][0] - p[0][0]) + 6 * u * t * (p[2][0] - p[1][0]) + 3 * t * t * (p[3][0] - p[2][0]);
    const dy = 3 * u * u * (p[1][1] - p[0][1]) + 6 * u * t * (p[2][1] - p[1][1]) + 3 * t * t * (p[3][1] - p[2][1]);
    const side = i % 2 ? 1 : -1;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI + side * (35 + r() * 30) + 18;
    leaves.push({ x, y, ang, s: 0.8 + r() * 0.55, dark: r() < 0.4 });
  }
  return leaves;
})();

function Sprig({ className }: { className: string }) {
  return (
    <svg className={`forest-sprig ${className}`} viewBox="0 0 400 300" aria-hidden>
      <defs>
        <linearGradient id={`${className}-leaf`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3f6220" />
          <stop offset="1" stopColor="#24390f" />
        </linearGradient>
      </defs>
      <path d="M0 20C110 34 210 70 330 150" stroke="#2b1d10" strokeWidth="7" fill="none" strokeLinecap="round" />
      {SPRIG.map((l, i) => (
        <g key={i} transform={`translate(${f1(l.x)} ${f1(l.y)}) rotate(${f1(l.ang)}) scale(${l.s.toFixed(2)})`}>
          <path d="M0 0C16-18 52-22 84 0 52 22 16 18 0 0z" fill={l.dark ? '#1c2e0e' : `url(#${className}-leaf)`} stroke="#4a6e26" strokeWidth="1.2" />
          <path d="M4 0H76" stroke="#5f8a30" strokeWidth="1.4" opacity="0.7" />
        </g>
      ))}
    </svg>
  );
}

export function Forest() {
  return (
    <div className="forest" aria-hidden>
      <svg className="forest-paint" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="f-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a2911" />
            <stop offset="0.3" stopColor="#3a5226" />
            <stop offset="0.62" stopColor="#30461f" />
            <stop offset="1" stopColor="#0e170a" />
          </linearGradient>
          <radialGradient id="f-sun" cx="0.21" cy="0.02" r="0.75">
            <stop offset="0" stopColor="#fff0c0" stopOpacity="0.85" />
            <stop offset="0.22" stopColor="#f7c86a" stopOpacity="0.45" />
            <stop offset="0.6" stopColor="#c99a3a" stopOpacity="0.1" />
            <stop offset="1" stopColor="#c99a3a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="f-mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c8d890" stopOpacity="0" />
            <stop offset="0.6" stopColor="#c8d890" stopOpacity="0.13" />
            <stop offset="1" stopColor="#c8d890" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="f-far" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8a9a5c" />
            <stop offset="1" stopColor="#5e7040" />
          </linearGradient>
          <linearGradient id="f-mid" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#5d5634" />
            <stop offset="0.35" stopColor="#38331d" />
            <stop offset="1" stopColor="#1e1b0f" />
          </linearGradient>
          <linearGradient id="f-near" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#1a1009" />
            <stop offset="0.55" stopColor="#3a2614" />
            <stop offset="0.82" stopColor="#5e4024" />
            <stop offset="1" stopColor="#2a1a0d" />
          </linearGradient>
          <radialGradient id="f-vignette" cx="0.5" cy="0.5" r="0.75">
            <stop offset="0.55" stopColor="#060a03" stopOpacity="0" />
            <stop offset="1" stopColor="#060a03" stopOpacity="0.75" />
          </radialGradient>
          <filter id="f-blur-far" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <filter id="f-blur-mid" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
          <filter id="f-blur-top" x="-10%" y="-30%" width="120%" height="160%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          <filter id="f-blur-mass" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          {/* Bark: stretched noise turned into dark furrows, laid over the trunk's own shading. */}
          <filter id="f-bark" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.05 0.005" numOctaves="3" seed="4" result="noise" />
            <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0.08  0 0 0 0 0.05  0 0 0 0 0.02  -2.6 0 0 0 1.45" result="grain" />
            <feComposite in="grain" in2="SourceGraphic" operator="atop" />
          </filter>
          <path id="f-leaf" d="M0 0C9-11 30-13 46 0 30 13 9 11 0 0z" />
        </defs>

        <rect width={W} height={H} fill="url(#f-sky)" />
        <rect width={W} height={H} fill="url(#f-sun)" />
        <g filter="url(#f-blur-far)" opacity="0.5">
          {FAR.map((d, i) => (
            <path key={i} d={d} fill="url(#f-far)" />
          ))}
        </g>
        <rect y={H * 0.42} width={W} height={H * 0.45} fill="url(#f-mist)" />
        <g filter="url(#f-blur-mid)">
          {MID.map((d, i) => (
            <path key={i} d={d} fill="url(#f-mid)" />
          ))}
          {LIMBS.map((d, i) => (
            <path key={i} d={d} fill="#2c2816" />
          ))}
        </g>
        <path d={`M0 ${H}V902C200 882 400 906 600 893S1000 900 1200 889 1500 896 1600 886V${H}Z`} fill="#0f180a" />
        {FERNS.map((f, i) => (
          <path key={i} d={f.d} fill={f.fill} />
        ))}
        {NEAR.map((d, i) => (
          <path key={i} d={d} fill="url(#f-near)" filter="url(#f-bark)" />
        ))}
        <g filter="url(#f-blur-mass)" fill="#132009">
          {CANOPY_MASSES.map((m, i) => (
            <ellipse key={i} cx={m.cx} cy={m.cy} rx={m.rx} ry={m.ry} />
          ))}
        </g>
        <g filter="url(#f-blur-top)">
          {CANOPY.map((l, i) => (
            <use
              key={i}
              href="#f-leaf"
              transform={`translate(${f1(l.x)} ${f1(l.y)}) rotate(${f1(l.r)}) scale(${l.s.toFixed(2)})`}
              fill={l.fill}
              opacity={l.o}
            />
          ))}
        </g>
        <rect width={W} height={H} fill="url(#f-vignette)" />
      </svg>

      <div className="forest-rays">
        {RAYS.map((r, i) => (
          <i key={i} style={{ left: `${r.left}%`, width: `${r.width}vw`, '--dur': `${r.dur}s`, '--delay': `${r.delay}s` } as CSSProperties} />
        ))}
      </div>
      <div className="forest-bokeh">
        {BOKEH.map((b, i) => (
          <i
            key={i}
            className={b.cool ? 'cool' : undefined}
            style={
              {
                left: `${f1(b.left)}%`,
                top: `${f1(b.top)}%`,
                width: `${f1(b.size)}px`,
                height: `${f1(b.size)}px`,
                '--dur': `${f1(b.dur)}s`,
                '--delay': `${f1(b.delay)}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="forest-pollen">
        {POLLEN.map((p, i) => (
          <i
            key={i}
            style={
              {
                left: `${f1(p.left)}%`,
                top: `${f1(p.top)}%`,
                width: `${f1(p.size)}px`,
                height: `${f1(p.size)}px`,
                '--dur': `${f1(p.dur)}s`,
                '--delay': `${f1(p.delay)}s`,
                '--dx': `${f1(p.dx)}px`,
                '--dy': `${f1(p.dy)}px`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <Sprig className="tl" />
      <Sprig className="tr" />
    </div>
  );
}
