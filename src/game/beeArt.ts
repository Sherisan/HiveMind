/*
 * Bee artwork for the effects canvas, drawn with canvas paths (no image assets).
 *
 * - `drawTopBee`: seen from above, facing +x. Turned along its flight path it reads right at any angle, so it's used
 *   for every bee flying around the hive or past the camera. Pre-rendered into sprites (wing-beat frames × depth-of-field
 *   blur levels) so a swarm of a hundred costs one drawImage each.
 * - `drawFrontBee`: head-on, for the bee that flies straight at you. Pre-rendered big (FRONT_SPRITE), so it stays
 *   smooth when it fills the screen.
 */

const TAU = Math.PI * 2;
const INK = '#21140a';

/** Sprite box (px), and the top-view bee's length inside it. */
export const SPRITE = 256;
export const BEE_LENGTH = 200;
/** Width of the head-on bee with its wings out, in its own units. */
export const FRONT_SPAN = 236;
/** Wing-beat frames per sprite set. */
export const FRAMES = 4;
/** Depth-of-field blur levels, px in sprite space (kept light: a bee in your face should still read as a bee). */
export const BLURS = [0, 2, 4.5, 8];

/** sprites[frame][blur] */
export type SpriteSet = HTMLCanvasElement[][];

/** Small seeded generator, so fur is drawn the same way every frame. */
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

function line(ctx: CanvasRenderingContext2D, pts: number[][], width: number, color = INK) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number, fill: string | CanvasGradient) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fill();
}

/** Fur: short strokes sprouting around an ellipse's rim (`inner` = how far in they start). */
function fur(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  count: number,
  len: number,
  colors: string[],
  seed: number,
  inner = 0.82,
) {
  const r = rng(seed);
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const a = r() * TAU;
    const k = inner + r() * (1.04 - inner);
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    const d = a + (r() - 0.5) * 0.9;
    const l = len * (0.45 + r() * 0.75);
    ctx.strokeStyle = colors[Math.floor(r() * colors.length)];
    ctx.lineWidth = 1 + r() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(d) * l, y + Math.sin(d) * l);
    ctx.stroke();
  }
}

/** A wing membrane rooted at the origin and pointing along +x. `side` mirrors it so the leading edge faces forward. */
function wing(ctx: CanvasRenderingContext2D, length: number, width: number, alpha: number, side: number) {
  ctx.save();
  ctx.scale(1, side);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(length * 0.22, -width * 0.95, length * 0.78, -width * 0.8, length, -width * 0.12);
  ctx.bezierCurveTo(length * 1.04, width * 0.28, length * 0.66, width * 0.58, length * 0.34, width * 0.42);
  ctx.bezierCurveTo(length * 0.14, width * 0.32, length * 0.03, width * 0.14, 0, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -width, length * 0.6, width);
  g.addColorStop(0, `rgba(250, 252, 255, ${0.62 * alpha})`);
  g.addColorStop(0.5, `rgba(214, 232, 255, ${0.36 * alpha})`);
  g.addColorStop(1, `rgba(190, 215, 250, ${0.26 * alpha})`);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.75 * alpha})`;
  ctx.stroke();
  // Veins.
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = `rgba(80, 55, 30, ${0.32 * alpha})`;
  ctx.beginPath();
  ctx.moveTo(1, -1);
  ctx.quadraticCurveTo(length * 0.45, -width * 0.42, length * 0.9, -width * 0.24);
  ctx.moveTo(length * 0.28, -width * 0.36);
  ctx.quadraticCurveTo(length * 0.42, -width * 0.02, length * 0.56, width * 0.3);
  ctx.moveTo(length * 0.5, -width * 0.34);
  ctx.lineTo(length * 0.6, -width * 0.04);
  ctx.lineTo(length * 0.8, -width * 0.12);
  ctx.stroke();
  // Sheen.
  oval(ctx, length * 0.42, -width * 0.36, length * 0.22, width * 0.12, -0.12, `rgba(255, 255, 255, ${0.22 * alpha})`);
  ctx.restore();
}

/** The blur of a beating wing: a faint fan between two angles. */
function beat(ctx: CanvasRenderingContext2D, a0: number, a1: number, length: number, alpha: number) {
  const g = ctx.createRadialGradient(0, 0, length * 0.15, 0, 0, length);
  g.addColorStop(0, `rgba(235, 244, 255, ${0.26 * alpha})`);
  g.addColorStop(0.75, `rgba(235, 244, 255, ${0.14 * alpha})`);
  g.addColorStop(1, 'rgba(235, 244, 255, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, length, Math.min(a0, a1), Math.max(a0, a1));
  ctx.closePath();
  ctx.fill();
}

/** Seen from above, facing +x, about BEE_LENGTH long and centred on the origin. `frame` picks the wing beat. */
export function drawTopBee(ctx: CanvasRenderingContext2D, frame: number) {
  const sweep = [0.5, 0.92, 1.32, 0.92][frame % 4]; // wing angle out from straight back
  const reach = [0.84, 1, 0.9, 0.97][frame % 4]; // foreshortening through the stroke
  ctx.save();
  ctx.translate(10, 0);

  // Legs, under everything, with a full pollen basket on each hind leg.
  for (const s of [1, -1]) {
    line(ctx, [[26, 8 * s], [40, 24 * s], [56, 30 * s]], 3.6);
    line(ctx, [[12, 12 * s], [16, 32 * s], [6, 46 * s]], 3.6);
    line(ctx, [[-2, 12 * s], [-14, 34 * s], [-38, 44 * s]], 4);
    oval(ctx, -22, 38 * s, 7, 4.5, 0.5 * s, '#ff9d17');
  }

  // Abdomen: gold with three dark bands.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.bezierCurveTo(-8, -30, -58, -38, -82, -20);
  ctx.bezierCurveTo(-96, -9, -100, -3, -102, 0);
  ctx.bezierCurveTo(-100, 3, -96, 9, -82, 20);
  ctx.bezierCurveTo(-58, 38, -8, 30, -6, 0);
  ctx.closePath();
  const ab = ctx.createRadialGradient(-38, -12, 4, -46, 0, 52);
  ab.addColorStop(0, '#ffe680');
  ab.addColorStop(0.5, '#f7b21c');
  ab.addColorStop(1, '#9c5c06');
  ctx.fillStyle = ab;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = INK;
  for (const bx of [-24, -48, -72]) {
    ctx.beginPath();
    ctx.moveTo(bx + 4, -44);
    ctx.quadraticCurveTo(bx - 9, 0, bx + 4, 44);
    ctx.lineTo(bx + 15, 44);
    ctx.quadraticCurveTo(bx + 2, 0, bx + 15, -44);
    ctx.closePath();
    ctx.fill();
  }
  oval(ctx, -44, -14, 30, 7, -0.05, 'rgba(255, 255, 255, 0.2)');
  ctx.restore();
  fur(ctx, -50, 0, 46, 30, 70, 6, ['#ffd968', '#e3a12a', '#fff0b8'], 7, 0.9);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(-100, -3.5);
  ctx.lineTo(-113, 0);
  ctx.lineTo(-100, 3.5);
  ctx.fill();

  // Thorax: a ball of golden fuzz.
  const th = ctx.createRadialGradient(10, -8, 2, 14, 0, 28);
  th.addColorStop(0, '#f6c450');
  th.addColorStop(0.6, '#a8701f');
  th.addColorStop(1, '#4a2d10');
  oval(ctx, 14, 0, 25, 25, 0, th);
  fur(ctx, 14, 0, 25, 25, 150, 9, ['#ffd25a', '#e8a93a', '#c98a2a', '#fff1c2'], 11, 0.55);

  // Head, big dark eyes, antennae.
  oval(ctx, 46, 0, 14, 20, 0, '#26170b');
  for (const s of [1, -1]) {
    oval(ctx, 44, 12.5 * s, 10, 7.5, 0.35 * s, '#0f0905');
    oval(ctx, 47, 14.5 * s, 3, 2, 0.35 * s, 'rgba(255, 255, 255, 0.75)');
    ctx.beginPath();
    ctx.moveTo(56, 5 * s);
    ctx.quadraticCurveTo(70, 10 * s, 76, 20 * s);
    ctx.lineTo(88, 18 * s);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  fur(ctx, 52, 0, 8, 10, 24, 5, ['#e8b450', '#fff0c0'], 3, 0.4);

  // Wings on top: the blur of the beat, then the wings themselves.
  for (const s of [1, -1]) {
    ctx.save();
    ctx.translate(20, 9 * s);
    beat(ctx, Math.PI - s * 0.45, Math.PI - s * 1.45, 86, 1);
    ctx.rotate(Math.PI - s * sweep);
    wing(ctx, 82 * reach, 24, 0.95, s);
    ctx.restore();
    ctx.save();
    ctx.translate(8, 8 * s);
    ctx.rotate(Math.PI - s * (sweep + 0.32));
    wing(ctx, 56 * reach, 17, 0.85, s);
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Head-on, centred on the origin, FRONT_SPAN wide with the wings out: the bee that comes for you, abdomen curled
 * forward, stinger first. `phase` drives the wing beat; `seed` keeps its fur from flickering between frames.
 */
export function drawFrontBee(ctx: CanvasRenderingContext2D, phase: number, seed: number) {
  const lift = 0.25 + 0.9 * (0.5 + 0.5 * Math.sin(phase * TAU));

  // Wings, behind the body.
  for (const s of [1, -1]) {
    ctx.save();
    ctx.translate(26 * s, -16);
    if (s === 1) beat(ctx, -1.2, -0.2, 92, 0.9);
    else beat(ctx, Math.PI + 0.2, Math.PI + 1.2, 92, 0.9);
    ctx.rotate(s === 1 ? -lift : Math.PI + lift);
    wing(ctx, 88, 30, 0.9, s);
    ctx.restore();
  }

  // Abdomen, curled under and toward you.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 40, 28, 30, 0, 0, TAU);
  const ab = ctx.createRadialGradient(-6, 30, 3, 0, 40, 32);
  ab.addColorStop(0, '#ffe27a');
  ab.addColorStop(0.6, '#f0a516');
  ab.addColorStop(1, '#8d5205');
  ctx.fillStyle = ab;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = INK;
  for (const by of [30, 46, 62]) {
    ctx.beginPath();
    ctx.moveTo(-40, by - 6);
    ctx.quadraticCurveTo(0, by + 6, 40, by - 6);
    ctx.lineTo(40, by + 3);
    ctx.quadraticCurveTo(0, by + 15, -40, by + 3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(-5, 66);
  ctx.lineTo(0, 86);
  ctx.lineTo(5, 66);
  ctx.fill();

  // Legs, reaching.
  for (const s of [1, -1]) {
    line(ctx, [[16 * s, 14], [36 * s, 34], [46 * s, 58], [40 * s, 72]], 5);
    line(ctx, [[22 * s, 4], [50 * s, 18], [62 * s, 40]], 4.5);
  }

  // Fuzzy thorax around the head: dense, short, soft hairs.
  const th = ctx.createRadialGradient(0, -10, 6, 0, -4, 46);
  th.addColorStop(0, '#f8cc5a');
  th.addColorStop(0.7, '#b77a24');
  th.addColorStop(1, '#5a3612');
  oval(ctx, 0, -6, 44, 36, 0, th);
  fur(
    ctx,
    0,
    -6,
    44,
    36,
    340,
    7,
    ['rgba(255, 217, 104, 0.8)', 'rgba(232, 169, 58, 0.8)', 'rgba(201, 138, 42, 0.75)', 'rgba(255, 241, 194, 0.65)'],
    seed,
    0.8,
  );

  // Head: a rounded triangle, wider at the top.
  ctx.beginPath();
  ctx.moveTo(-32, -24);
  ctx.bezierCurveTo(-33, -44, 33, -44, 32, -24);
  ctx.bezierCurveTo(31, -2, 14, 26, 0, 30);
  ctx.bezierCurveTo(-14, 26, -31, -2, -32, -24);
  ctx.closePath();
  const hd = ctx.createRadialGradient(0, -6, 2, 0, -6, 40);
  hd.addColorStop(0, '#3b2614');
  hd.addColorStop(1, '#170d06');
  ctx.fillStyle = hd;
  ctx.fill();
  // A golden patch of face, with a few short hairs on the lower face.
  oval(ctx, 0, 10, 9, 12, 0, 'rgba(240, 190, 90, 0.32)');
  fur(ctx, 0, 16, 8, 7, 18, 4, ['rgba(255, 232, 168, 0.7)', 'rgba(240, 192, 96, 0.7)'], seed + 1, 0.6);

  // Compound eyes, with the highlights that make it look at you.
  for (const s of [1, -1]) {
    ctx.save();
    ctx.translate(22 * s, -12);
    ctx.rotate(0.2 * s);
    const eg = ctx.createRadialGradient(-3 * s, -6, 1, 0, 0, 22);
    eg.addColorStop(0, '#3d3833');
    eg.addColorStop(0.6, '#15110d');
    eg.addColorStop(1, '#050403');
    oval(ctx, 0, 0, 11, 21, 0, eg);
    oval(ctx, -3 * s, -9, 3.6, 6, 0.2 * s, 'rgba(255, 255, 255, 0.85)');
    oval(ctx, 3 * s, 8, 2, 2, 0, 'rgba(255, 255, 255, 0.4)');
    ctx.restore();
  }
  for (const [x, y] of [[0, -34], [-7, -30], [7, -30]]) oval(ctx, x, y, 2.6, 2.6, 0, '#4a4038');

  // Antennae and mandibles.
  for (const s of [1, -1]) {
    line(ctx, [[6 * s, -26], [12 * s, -58], [34 * s, -74]], 4);
    ctx.fillStyle = '#b77a24';
    ctx.beginPath();
    ctx.moveTo(9 * s, 22);
    ctx.quadraticCurveTo(12 * s, 32, 2 * s, 34);
    ctx.quadraticCurveTo(6 * s, 28, 4 * s, 23);
    ctx.closePath();
    ctx.fill();
  }
}

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE;
  return c;
}

let filterSupport: boolean | null = null;
function canFilter(ctx: CanvasRenderingContext2D): boolean {
  if (filterSupport === null) {
    ctx.filter = 'blur(2px)';
    filterSupport = ctx.filter === 'blur(2px)';
    ctx.filter = 'none';
  }
  return filterSupport;
}

/** A blurred copy for depth of field (an approximation where canvas filters aren't supported). */
function blurred(src: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const c = makeCanvas();
  const ctx = c.getContext('2d')!;
  if (canFilter(ctx)) {
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(src, 0, 0);
    return c;
  }
  ctx.globalAlpha = 0.2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const d = radius * (i % 2 ? 0.5 : 1);
    ctx.drawImage(src, Math.cos(a) * d, Math.sin(a) * d);
  }
  ctx.globalAlpha = 0.35;
  ctx.drawImage(src, 0, 0);
  return c;
}

/** Head-on sprite box (px), and sprite px per unit of `drawFrontBee`: big enough to fill a screen without going blocky. */
export const FRONT_SPRITE = 512;
export const FRONT_SCALE = 2;

/** Head-on sprites: FRAMES wing beats. */
export function makeFrontSprites(seed = 5): HTMLCanvasElement[] {
  return Array.from({ length: FRAMES }, (_, frame) => {
    const c = document.createElement('canvas');
    c.width = c.height = FRONT_SPRITE;
    const ctx = c.getContext('2d')!;
    ctx.translate(FRONT_SPRITE / 2, FRONT_SPRITE / 2 + 8 * FRONT_SCALE); // the bee spans about −102 … +86
    ctx.scale(FRONT_SCALE, FRONT_SCALE);
    drawFrontBee(ctx, frame / FRAMES, seed);
    return c;
  });
}

/** Top-view sprites: FRAMES wing beats, each at every BLURS level. */
export function makeTopSprites(): SpriteSet {
  return Array.from({ length: FRAMES }, (_, frame) => {
    const sharp = makeCanvas();
    const ctx = sharp.getContext('2d')!;
    ctx.translate(SPRITE / 2, SPRITE / 2);
    drawTopBee(ctx, frame);
    return BLURS.map((r) => (r === 0 ? sharp : blurred(sharp, r)));
  });
}
