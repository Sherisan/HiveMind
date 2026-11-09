/*
 * The effects layer: one full-screen canvas over the whole game. Purely cosmetic: it animates outcomes, never decides
 * them.
 *
 * Bees fly in a simple 3D space. The camera is the viewer's eye at the centre of the screen, the hive hangs at depth F
 * (where one world unit is one screen pixel), and anything nearer than F is drawn F / z times larger. A bee that flies
 * from its cell toward z ≈ 0 grows from cell size to bigger than the screen and leaves past its edge: that's how the
 * swarm comes out of the screen at you.
 */
import {
  BEE_LENGTH,
  FRAMES,
  FRONT_SCALE,
  FRONT_SPAN,
  FRONT_SPRITE,
  SPRITE,
  makeFrontSprites,
  makeTopSprites,
  type SpriteSet,
} from './beeArt.ts';

const TAU = Math.PI * 2;
/** Depth of the hive: the plane where world units are screen pixels. */
const F = 1000;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const smooth = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

export interface Point {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** A bee cell that opens `delay` seconds after the sting. */
export interface Den extends Point {
  delay: number;
}

/** Where a bee is on screen: position, perspective scale, opacity, roll (head-on bees), and a new size if it changed. */
interface Pose {
  x: number;
  y: number;
  s: number;
  a: number;
  roll: number;
  size?: number;
}

interface Bee {
  /** Effect time it appears and is gone. */
  born: number;
  end: number;
  /** Length on screen at the hive's depth, px. */
  size: number;
  /** Drawn head-on instead of from above. */
  front: boolean;
  wing: number;
  /** It never comes back, so it can go as soon as it's off screen. */
  leaves: boolean;
  path: (t: number) => Pose;
  /** Runs once, the first frame `when` holds. */
  cue?: { when: (p: Pose, t: number) => boolean; run: (p: Pose) => void; done: boolean };
  /** Effect time calm() started fading it out. */
  fade: number;
  // Last frame's pose and screen motion.
  seen: boolean;
  x: number;
  y: number;
  s: number;
  a: number;
  roll: number;
  vx: number;
  vy: number;
  ds: number;
  heading: number;
}

type Kind = 'drop' | 'spark' | 'flake' | 'glow' | 'hex' | 'flash';

/** A particle in world space: x, y from the screen centre, z its depth. */
interface Bit {
  kind: Kind;
  born: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  g: number;
  drag: number;
  size: number;
  rot: number;
  spin: number;
  color: string;
  phase: number;
}

const HONEY = ['#ffcc33', '#ffb21e', '#ff9a00', '#ffe08a'];
const CONFETTI = ['#ffcc33', '#ff9a00', '#fff3c4', '#9be15d', '#ffe08a'];

function hexPath(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    if (i) ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
    else ctx.moveTo(r * Math.cos(a), r * Math.sin(a));
  }
  ctx.closePath();
}

export class Effects {
  /** A head-on bee reached the camera (strength 0–1): shake the screen, flash it, thump. */
  onImpact: (strength: number) => void = () => {};
  /** A bee whizzed past the camera (pan −1 left … 1 right). */
  onFlyBy: (pan: number) => void = () => {};

  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private bees: Bee[] = [];
  private bits: Bit[] = [];
  private timers: { at: number; run: () => void }[] = [];
  private sprites: SpriteSet;
  private front: HTMLCanvasElement[];
  /** The swarm's shadow: a dark vignette, drawn once small and stretched over the screen. */
  private vignette = document.createElement('canvas');
  private hive: Rect | null = null;
  private ambient = false;
  private nextFlyBy = 0;
  private gloom = 0;
  private whooshes = { last: -1, count: 0 };
  private raf = 0;
  private last = 0;
  private time = 0;
  private readonly reduced: boolean;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.sprites = makeTopSprites();
    this.front = makeFrontSprites();
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    // The vignette at a fraction of the size, same aspect: it's all soft gradient.
    const v = this.vignette;
    v.width = 160;
    v.height = Math.max(1, Math.round((160 * h) / Math.max(1, w)));
    const vc = v.getContext('2d')!;
    const g = vc.createRadialGradient(v.width / 2, v.height / 2, Math.min(v.width, v.height) * 0.15, v.width / 2, v.height / 2, Math.hypot(v.width, v.height) * 0.62);
    g.addColorStop(0, 'rgba(24, 10, 0, 0.3)');
    g.addColorStop(1, 'rgba(16, 6, 0, 1)');
    vc.fillStyle = g;
    vc.fillRect(0, 0, v.width, v.height);
    this.wake();
  }

  /** Where the comb is on screen (the angry cloud and the idle bees circle it). */
  setHive(rect: Rect | null) {
    this.hive = rect;
  }

  /** Between rounds: a few bees idling around the hive, and now and then one zipping past the camera. */
  setAmbient(on: boolean) {
    if (on === this.ambient) return;
    this.ambient = on;
    if (on) {
      const n = this.w < 700 ? 2 : 3;
      for (let i = 0; i < n; i++) this.patrol(i);
      this.nextFlyBy = this.time + rand(4, 8);
    } else {
      for (const b of this.bees) if (b.end === Infinity) b.fade = Math.min(b.fade, this.time);
    }
    this.wake();
  }

  /** Honey bursting out of a cell (`small` for the cells a flood opened). */
  honey(at: Point, cell: number, { delay = 0, small = false }: { delay?: number; small?: boolean } = {}) {
    if (delay > 0) {
      this.later(delay, () => this.honey(at, cell, { small }));
      return;
    }
    const x = at.x - this.w / 2;
    const y = at.y - this.h / 2;
    const n = this.reduced ? 4 : small ? 7 : 18;
    this.addBit({ kind: 'glow', x, y, z: F, size: cell * (small ? 0.8 : 1.4), life: small ? 0.4 : 0.55 });
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rand(-1.25, 1.25);
      const v = cell * rand(1.6, small ? 3 : 4.8);
      this.addBit({
        kind: 'drop',
        x,
        y,
        z: F,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vz: -F * rand(0, small ? 0.15 : 0.5),
        g: cell * 13,
        drag: 0.6,
        size: cell * rand(0.04, 0.085),
        life: rand(0.7, 1.1),
        color: HONEY[i % HONEY.length],
      });
    }
    for (let i = 0; i < n * 0.6; i++) {
      const a = rand(0, TAU);
      const v = cell * rand(0.4, 1.4);
      this.addBit({
        kind: 'spark',
        x: x + Math.cos(a) * cell * 0.2,
        y: y + Math.sin(a) * cell * 0.2,
        z: F,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - cell * 0.6,
        drag: 1.5,
        size: cell * rand(0.05, 0.11),
        life: rand(0.45, 0.8),
      });
    }
    if (small || this.reduced) return;
    // Bits of the wax cap.
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + rand(-1.4, 1.4);
      const v = cell * rand(1.4, 3.2);
      this.addBit({
        kind: 'flake',
        x,
        y,
        z: F,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vz: -F * rand(0, 0.35),
        g: cell * 11,
        drag: 0.8,
        size: cell * rand(0.06, 0.11),
        life: rand(0.7, 1),
        spin: rand(-12, 12),
      });
    }
  }

  /**
   * The sting: the hive empties at the viewer. Bees pour out of the stung cell, then out of every other bee cell as it
   * opens (`dens`); most dive past the camera, some circle the hive, and two come straight at you head-on.
   */
  swarm(at: Point, dens: Den[], cell: number) {
    const size = cell * 0.5;
    this.whooshes = { last: -1, count: 0 };
    if (this.reduced) {
      for (let i = 0; i < 10; i++) this.orbit(at, i * 0.06, size);
      return;
    }
    const area = (this.w * this.h) / (1280 * 800);
    const cores = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency || 8) <= 4 ? 0.6 : 1;
    const total = Math.round(clamp(60 + 50 * area, 45, 130) * cores);

    this.hero(at, 0.1, size * 1.2, 1);
    this.hero(at, 0.5, size * 1.05, 0.55);

    const first = Math.round(total * (dens.length ? 0.45 : 1));
    for (let i = 0; i < first; i++) {
      const delay = 0.03 + Math.pow(i / first, 1.5) * 0.6;
      if (Math.random() < 0.68) this.charge(at, delay, size * rand(0.85, 1.15));
      else this.orbit(at, delay, size * rand(0.85, 1.1));
    }
    const each = dens.length ? Math.round((total - first) / dens.length) : 0;
    for (const d of dens) {
      for (let i = 0; i < each; i++) {
        const delay = d.delay + 0.05 + Math.pow(Math.random(), 1.3) * 0.45;
        if (Math.random() < 0.55) this.charge(d, delay, size * rand(0.85, 1.1));
        else this.orbit(d, delay, size * rand(0.85, 1.05));
      }
    }
  }

  /** Hexagon confetti thrown up from the hive, some of it right at the camera. */
  confetti(count = 90) {
    const { w, h } = this;
    const hive = this.hive;
    const ox = hive ? hive.x + hive.w / 2 - w / 2 : 0;
    const oy = hive ? hive.y + hive.h * 0.55 - h / 2 : h * 0.1;
    const n = this.reduced ? Math.round(count / 3) : count;
    const reach = Math.min(w, h);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + rand(-1.2, 1.2);
      const v = reach * rand(0.5, 1.25);
      this.addBit({
        kind: 'hex',
        x: ox + rand(-20, 20),
        y: oy + rand(-20, 20),
        z: F * rand(0.95, 1.05),
        vx: Math.cos(a) * v * 0.9,
        vy: Math.sin(a) * v,
        vz: -F * rand(0, 0.55),
        g: reach * 1.15,
        drag: 0.7,
        size: rand(4, 9),
        life: rand(2, 3),
        color: CONFETTI[i % CONFETTI.length],
        spin: rand(-10, 10),
      });
    }
  }

  /** A new round: clear the air (the idle bees have their own switch). */
  calm() {
    for (const b of this.bees) if (b.end !== Infinity) b.fade = Math.min(b.fade, this.time);
    this.timers = [];
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  // ── Flight paths ─────────────────────────────────────────────────────

  private proj(x: number, y: number, z: number): Pose {
    const s = F / Math.max(z, 1);
    return { x: this.w / 2 + x * s, y: this.h / 2 + y * s, s, a: 1, roll: 0 };
  }

  /** A random little jump up and out of a cell. */
  private hop(size: number): Point {
    const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
    const d = size * rand(0.3, 0.9);
    return { x: Math.cos(a) * d, y: Math.sin(a) * d };
  }

  /** Squeezing out of a cell: grows from a speck, with a hop. */
  private pop(src: Point, hop: Point, t: number, dur: number): Pose {
    const k = clamp01(t / dur);
    const e = easeOut(k);
    return { x: src.x + hop.x * e, y: src.y + hop.y * e, s: 0.25 + 0.75 * easeOutBack(k), a: Math.min(1, k * 4), roll: 0 };
  }

  /** Out of the cell, a swing away from the hive, then straight for the camera, passing just beside it. */
  private charge(src: Point, delay: number, size: number) {
    const { w, h } = this;
    const emerge = rand(0.12, 0.2);
    const hop = this.hop(size);
    const sx = src.x + hop.x - w / 2;
    const sy = src.y + hop.y - h / 2;
    const sa = rand(0, TAU);
    const sd = Math.min(w, h) * rand(0.12, 0.4);
    const c = [sx + Math.cos(sa) * sd, sy + Math.sin(sa) * sd, F * rand(0.45, 0.7)];
    // It ends level with the camera, off screen: far enough out that the projected point is past every edge.
    const near = F * 0.035;
    const ea = rand(0, TAU);
    const ed = Math.hypot(w, h) * rand(0.55, 0.9) * (near / F);
    const p1 = [Math.cos(ea) * ed, Math.sin(ea) * ed, near];
    const fly = rand(0.75, 1.15);
    // Slow out of the swing, then faster and faster: perspective does the rest, so the last stretch is a whoosh.
    const ease = rand(1.25, 1.6);
    const wob = size * rand(0.12, 0.3);
    const wf = rand(9, 15);
    const wp = rand(0, TAU);
    const wd = rand(0, TAU);
    this.addBee({
      born: this.time + delay,
      end: this.time + delay + emerge + fly,
      size,
      leaves: true,
      heading: Math.atan2(hop.y, hop.x),
      path: (t) => {
        if (t < emerge) return this.pop(src, hop, t, emerge);
        const u = Math.pow(clamp01((t - emerge) / fly), ease);
        const v = 1 - u;
        const p = this.proj(
          v * v * sx + 2 * v * u * c[0] + u * u * p1[0],
          v * v * sy + 2 * v * u * c[1] + u * u * p1[1],
          v * v * F + 2 * v * u * c[2] + u * u * p1[2],
        );
        const k = wob * Math.sqrt(p.s) * Math.sin(wf * t + wp);
        p.x += Math.cos(wd) * k;
        p.y += Math.sin(wd) * k;
        p.a = clamp01(v * 25);
        return p;
      },
      cue: { when: (p) => p.s > 4.5, run: (p) => this.whoosh(p.x), done: false },
    });
  }

  /** Out of the cell and straight at the viewer, head-on, until it reaches the camera and the screen takes the hit. */
  private hero(src: Point, delay: number, size: number, strength: number) {
    const { w, h } = this;
    const emerge = 0.22;
    const hop = { x: rand(-0.3, 0.3) * size, y: -size * 0.55 };
    const sx = src.x + hop.x - w / 2;
    const sy = src.y + hop.y - h / 2;
    const hit = Math.min(18, (0.92 * Math.min(w, h)) / size); // its scale when it reaches you
    const tx = rand(-0.1, 0.1) * w; // where on screen, from the centre
    const ty = rand(-0.12, 0.04) * h;
    const fly = rand(0.8, 0.95);
    const pass = 0.1;
    const seed = rand(0, TAU);
    this.addBee({
      born: this.time + delay,
      end: this.time + delay + emerge + fly + pass,
      size,
      front: true,
      path: (t) => {
        if (t < emerge) return this.pop(src, hop, t, emerge);
        const k = (t - emerge) / fly;
        if (k <= 1) {
          const p = this.proj(lerp(sx, tx / hit, k), lerp(sy, ty / hit, k), lerp(F, F / hit, k));
          const sway = Math.sqrt(p.s) * (1 - k * k * k);
          p.x += Math.sin(t * 7 + seed) * size * 0.3 * sway;
          p.y += Math.sin(t * 11 + seed * 2) * size * 0.18 * sway;
          p.roll = Math.sin(t * 5 + seed) * 0.2 * (1 - k);
          return p;
        }
        // The hit: a lurch closer and it's gone, under the flash.
        const q = clamp01((t - emerge - fly) / pass);
        return { x: w / 2 + tx, y: h / 2 + ty, s: hit * (1 + 0.5 * q), a: (1 - q) ** 2, roll: 0 };
      },
      cue: { when: (_p, t) => t >= emerge + fly, run: () => this.impact(w / 2 + tx, h / 2 + ty, strength), done: false },
    });
  }

  /** Out of the cell into an angry cloud around the hive, then away. */
  private orbit(src: Point, delay: number, size: number) {
    const { w, h } = this;
    const hive = this.hive ?? { x: src.x - 120, y: src.y - 120, w: 240, h: 240 };
    const cx = hive.x + hive.w / 2 - w / 2;
    const cy = hive.y + hive.h / 2 - h / 2;
    const rx = hive.w * rand(0.42, 0.75);
    const ry = hive.h * rand(0.3, 0.6);
    const rz = F * rand(0.04, 0.16);
    const om = rand(2.2, 3.6) * (Math.random() < 0.5 ? -1 : 1);
    const a0 = Math.atan2(src.y - h / 2 - cy, src.x - w / 2 - cx);
    const depth = F * rand(0.82, 0.97);
    const emerge = rand(0.12, 0.2);
    const life = rand(1.4, 3);
    const hop = this.hop(size);
    const from = { x: src.x + hop.x, y: src.y + hop.y };
    this.addBee({
      born: this.time + delay,
      end: this.time + delay + emerge + life,
      size,
      heading: Math.atan2(hop.y, hop.x),
      path: (t) => {
        if (t < emerge) return this.pop(src, hop, t, emerge);
        const k = t - emerge;
        const ang = a0 + om * k;
        const out = 1 + 0.9 * Math.max(0, k - life + 0.8); // spirals out as it leaves
        const p = this.proj(cx + Math.cos(ang) * rx * out, cy + Math.sin(ang * 1.37 + 0.6) * ry * out, depth - Math.sin(ang) * rz);
        const b = smooth(clamp01(k / 0.45));
        return { x: lerp(from.x, p.x, b), y: lerp(from.y, p.y, b), s: lerp(1, p.s, b), a: clamp01((life - k) / 0.5), roll: 0 };
      },
    });
  }

  /** An idle bee looping lazily around the hive; it follows the hive if the layout moves. */
  private patrol(i: number) {
    const om = rand(0.5, 0.9) * (i % 2 ? -1 : 1);
    const a0 = rand(0, TAU);
    const fx = rand(0.58, 0.82);
    const fy = rand(0.4, 0.6);
    const lift = rand(1.3, 1.7);
    const depth = rand(0.86, 0.98);
    const away = { x: -999, y: -999, s: 1, a: 0, roll: 0 };
    this.addBee({
      born: this.time + i * 0.8,
      end: Infinity,
      size: 24,
      path: (t) => {
        const hive = this.hive;
        if (!hive) return away;
        const ang = a0 + om * t;
        const p = this.proj(
          hive.x + hive.w / 2 - this.w / 2 + Math.cos(ang) * hive.w * fx,
          hive.y + hive.h * 0.45 - this.h / 2 + Math.sin(ang * lift) * hive.h * fy + Math.sin(t * 9) * 3,
          F * depth - Math.sin(ang) * F * 0.08,
        );
        p.a = clamp01(t / 1.2) * 0.95;
        p.size = clamp(hive.w / 12, 16, 34);
        return p;
      },
    });
  }

  /** Now and then between rounds: one bee zips across, close to the camera. */
  private flyBy() {
    const { w, h } = this;
    const size = clamp(Math.min(w, h) / 22, 18, 36);
    const s = rand(3.4, 5.2);
    const left = Math.random() < 0.5;
    const m = size * s;
    const x0 = left ? -m : w + m;
    const x1 = left ? w + m : -m;
    const y0 = h * rand(0.15, 0.6);
    const y1 = y0 + h * rand(-0.2, 0.25);
    const dur = rand(0.75, 1.05);
    this.addBee({
      born: this.time,
      end: this.time + dur,
      size,
      heading: left ? 0 : Math.PI,
      path: (t) => {
        const u = t / dur;
        return {
          x: lerp(x0, x1, u),
          y: lerp(y0, y1, u) - Math.sin(u * Math.PI) * h * 0.08 + Math.sin(t * 13) * 5,
          s: s * (0.8 + 0.35 * Math.sin(u * Math.PI)),
          a: 1,
          roll: 0,
        };
      },
    });
  }

  private impact(x: number, y: number, strength: number) {
    this.addBit({ kind: 'flash', x: x - this.w / 2, y: y - this.h / 2, z: F, size: Math.hypot(this.w, this.h) * 0.55 * (0.6 + 0.4 * strength), life: 0.45 });
    this.onImpact(strength);
  }

  private whoosh(x: number) {
    if (this.time - this.whooshes.last < 0.08 || this.whooshes.count >= 12) return;
    this.whooshes.last = this.time;
    this.whooshes.count++;
    this.onFlyBy(clamp((x - this.w / 2) / (this.w / 2), -1, 1));
  }

  // ── Bookkeeping ──────────────────────────────────────────────────────

  private addBee(b: Partial<Bee> & Pick<Bee, 'born' | 'end' | 'size' | 'path'>) {
    this.bees.push({
      front: false,
      wing: rand(0, FRAMES),
      leaves: false,
      fade: Infinity,
      seen: false,
      x: 0,
      y: 0,
      s: 1,
      a: 1,
      roll: 0,
      vx: 0,
      vy: 0,
      ds: 0,
      heading: rand(0, TAU),
      ...b,
    });
    this.wake();
  }

  private addBit(b: Partial<Bit> & Pick<Bit, 'kind' | 'x' | 'y' | 'z' | 'size' | 'life'>) {
    this.bits.push({
      born: this.time,
      vx: 0,
      vy: 0,
      vz: 0,
      g: 0,
      drag: 0,
      rot: rand(0, TAU),
      spin: 0,
      color: '',
      phase: rand(0, TAU),
      ...b,
    });
    this.wake();
  }

  private later(delay: number, run: () => void) {
    this.timers.push({ at: this.time + delay, run });
    this.wake();
  }

  private offscreen(b: Bee) {
    const r = b.size * b.s * 0.7;
    return b.x < -r || b.y < -r || b.x > this.w + r || b.y > this.h + r;
  }

  private wake() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    this.step(dt);
    this.draw();
    this.raf = this.bees.length || this.bits.length || this.timers.length ? requestAnimationFrame(this.frame) : 0;
  };

  private step(dt: number) {
    const now = this.time;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= now);
      this.timers = this.timers.filter((t) => t.at > now);
      for (const t of due) t.run();
    }
    if (this.ambient && !this.reduced && this.hive && now >= this.nextFlyBy) {
      this.flyBy();
      this.nextFlyBy = now + rand(11, 20);
    }

    const turn = 1 - Math.exp(-dt * 14);
    let cover = 0;
    for (const b of this.bees) {
      const t = now - b.born;
      if (t < 0) continue;
      const p = b.path(t);
      if (b.seen && dt > 0) {
        b.vx = (p.x - b.x) / dt;
        b.vy = (p.y - b.y) / dt;
        b.ds = (p.s - b.s) / dt;
        if (b.vx * b.vx + b.vy * b.vy > 900) {
          let d = Math.atan2(b.vy, b.vx) - b.heading;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          b.heading += d * turn;
        }
      }
      b.seen = true;
      b.x = p.x;
      b.y = p.y;
      b.s = p.s;
      b.roll = p.roll;
      if (p.size) b.size = p.size;
      b.a = p.a * (1 - clamp01((now - b.fade) / 0.35));
      if (b.cue && !b.cue.done && b.cue.when(p, t)) {
        b.cue.done = true;
        b.cue.run(p);
      }
      if (b.s > 1.4) cover += (b.size * b.s) ** 2 * b.a;
    }
    this.bees = this.bees.filter(
      (b) => now < b.end && now - b.fade < 0.35 && !(b.leaves && b.seen && b.s > 1.5 && this.offscreen(b)),
    );
    // A swarm this close blocks the light.
    const target = Math.min(0.4, (cover / Math.max(1, this.w * this.h)) * 0.7);
    this.gloom = lerp(this.gloom, target, 1 - Math.exp(-dt * 5));

    for (const p of this.bits) {
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.vz *= d;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += p.spin * dt;
    }
    this.bits = this.bits.filter((p) => now - p.born < p.life && p.z > F * 0.06);
  }

  // ── Drawing ──────────────────────────────────────────────────────────

  /** Transform for drawing at (x, y) screen px, scaled by k and turned by `angle`. */
  private place(x: number, y: number, k: number, angle: number) {
    const d = this.dpr;
    const c = Math.cos(angle) * k * d;
    const s = Math.sin(angle) * k * d;
    this.ctx.setTransform(c, s, -s, c, x * d, y * d);
  }

  private draw() {
    const { ctx, w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    if (this.gloom > 0.01) {
      ctx.globalAlpha = this.gloom;
      ctx.drawImage(this.vignette, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    for (const p of this.bits) if (p.kind !== 'hex' && p.kind !== 'flash') this.drawBit(p);
    const order = this.bees.filter((b) => b.seen && b.a > 0.01).sort((a, b) => a.s - b.s);
    for (const b of order) this.drawBee(b);
    for (const p of this.bits) if (p.kind === 'hex' || p.kind === 'flash') this.drawBit(p);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawBee(b: Bee) {
    const { ctx } = this;
    if (b.front) {
      const img = this.front[Math.floor(this.time * 30 + b.wing) % FRAMES];
      const k = (b.size * b.s) / FRONT_SPAN / FRONT_SCALE;
      // Zoom blur while it rushes at you: fainter copies just behind it (until it's big enough to fill the screen).
      if (b.s < 8 && b.ds / Math.max(b.s, 0.01) > 1.2) {
        for (const [f, al] of [[0.86, 0.12], [0.93, 0.2]] as const) {
          this.place(b.x, b.y, k * f, b.roll);
          ctx.globalAlpha = b.a * al;
          ctx.drawImage(img, -FRONT_SPRITE / 2, -FRONT_SPRITE / 2);
        }
      }
      this.place(b.x, b.y, k, b.roll);
      ctx.globalAlpha = b.a;
      ctx.drawImage(img, -FRONT_SPRITE / 2, -FRONT_SPRITE / 2);
      return;
    }
    // Depth of field: the nearer it gets, the softer; right at the camera it's past you and gone.
    const blur = b.s < 2.4 ? 0 : b.s < 4.5 ? 1 : b.s < 9 ? 2 : 3;
    const a = b.a * (b.s > 14 ? clamp01(1 - (b.s - 14) / 10) : 1);
    if (a <= 0.01) return;
    const img = this.sprites[Math.floor(this.time * 40 + b.wing) % FRAMES][blur];
    const k = (b.size * b.s) / BEE_LENGTH;
    // Motion blur: fading copies along its track (only while it's small; a near bee is soft already).
    if (b.s < 5 && b.vx * b.vx + b.vy * b.vy > 640000) {
      for (const [lag, al] of [[0.024, 0.16], [0.012, 0.28]] as const) {
        this.place(b.x - b.vx * lag, b.y - b.vy * lag, k, b.heading);
        ctx.globalAlpha = a * al;
        ctx.drawImage(img, -SPRITE / 2, -SPRITE / 2);
      }
    }
    this.place(b.x, b.y, k, b.heading);
    ctx.globalAlpha = a;
    ctx.drawImage(img, -SPRITE / 2, -SPRITE / 2);
  }

  private drawBit(p: Bit) {
    const { ctx } = this;
    const k = (this.time - p.born) / p.life;
    const s = F / p.z;
    const x = this.w / 2 + p.x * s;
    const y = this.h / 2 + p.y * s;
    const fade = clamp01((1 - k) / 0.3);
    switch (p.kind) {
      case 'glow':
      case 'flash': {
        const flash = p.kind === 'flash';
        const r = p.size * (flash ? 0.7 + 0.5 * easeOut(k) : 0.5 + 1.3 * easeOut(k));
        const a = flash ? (1 - k) ** 2 : 1 - k;
        this.place(x, y, 1, 0);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        if (flash) {
          g.addColorStop(0, `rgba(255, 246, 220, ${0.9 * a})`);
          g.addColorStop(0.35, `rgba(255, 170, 70, ${0.5 * a})`);
          g.addColorStop(1, 'rgba(255, 80, 20, 0)');
        } else {
          g.addColorStop(0, `rgba(255, 226, 120, ${0.75 * a})`);
          g.addColorStop(0.45, `rgba(255, 170, 30, ${0.35 * a})`);
          g.addColorStop(1, 'rgba(255, 150, 0, 0)');
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'drop': {
        const r = p.size * s;
        const vx = p.vx * s;
        const vy = p.vy * s;
        const stretch = 1 + Math.min(1.4, Math.hypot(vx, vy) / 700);
        this.place(x, y, 1, Math.atan2(vy, vx));
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * stretch, r, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.ellipse(r * 0.2 * stretch, -r * 0.35, r * 0.35 * stretch, r * 0.22, 0, 0, TAU);
        ctx.fill();
        break;
      }
      case 'spark': {
        const r = p.size * s * (1 - k * 0.6) * (0.6 + 0.4 * Math.sin(this.time * 30 + p.phase));
        this.place(x, y, 1, p.rot);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#fff3c0';
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.quadraticCurveTo(0, 0, 0, r);
        ctx.quadraticCurveTo(0, 0, -r, 0);
        ctx.quadraticCurveTo(0, 0, 0, -r);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'flake': {
        const r = p.size * s;
        this.place(x, y, 1, p.rot);
        ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(this.time * 9 + p.phase)));
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#ffe7a3';
        ctx.strokeStyle = '#c9861a';
        ctx.lineWidth = Math.max(0.8, r * 0.12);
        ctx.beginPath();
        ctx.moveTo(-r, -r * 0.5);
        ctx.lineTo(r * 0.8, -r * 0.8);
        ctx.lineTo(r, r * 0.4);
        ctx.lineTo(-r * 0.4, r * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'hex': {
        this.place(x, y, 1, p.rot);
        ctx.scale(1, 0.55 + 0.45 * Math.cos(this.time * 7 + p.phase));
        // Pieces flying right past the camera are out of focus: softer.
        ctx.globalAlpha = fade * (s > 3 ? Math.max(0.35, 1 - (s - 3) * 0.12) : 1);
        hexPath(ctx, p.size * s);
        ctx.fillStyle = p.color;
        ctx.fill();
        break;
      }
    }
  }
}
