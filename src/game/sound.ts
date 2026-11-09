/** Tiny Web Audio synth, so the game has sound without audio assets. */

const MUTE_KEY = 'hivemind.muted';
let ctx: AudioContext | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
  } catch {
    return null;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  slideTo?: number;
  /** Vibrato: rate (Hz) and depth (Hz). */
  wobble?: [number, number];
}

function tone(freq: number, dur: number, { type = 'sine', gain = 0.15, delay = 0, slideTo, wobble }: ToneOpts = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  if (wobble) {
    const lfo = a.createOscillator();
    const depth = a.createGain();
    lfo.frequency.value = wobble[0];
    depth.gain.value = wobble[1];
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.02);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, { gain = 0.3, filter = 'highpass' as BiquadFilterType, freq = 2000, sweepTo = 0, q = 1, delay = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sound = {
  start: () => {
    tone(392, 0.1, { type: 'triangle', gain: 0.1 });
    tone(587, 0.14, { type: 'triangle', gain: 0.1, delay: 0.09 });
  },
  /** The wax cap gives: the result isn't known yet. */
  crack: () => {
    noise(0.06, { gain: 0.28, filter: 'bandpass', freq: 2400, q: 3 });
    noise(0.05, { gain: 0.18, filter: 'bandpass', freq: 1500, q: 4, delay: 0.07 });
  },
  /** Honey; `step` raises the pitch as the round goes on. */
  honey: (step: number) => {
    const base = 440 * 2 ** (Math.min(step, 12) / 12);
    tone(base, 0.16, { gain: 0.14, slideTo: base * 1.5 });
    tone(base * 2, 0.22, { type: 'triangle', gain: 0.06, delay: 0.06 });
  },
  /** A clue of 0 opens the cells around it: a soft ripple. */
  flood: (cells: number) => {
    for (let i = 0; i < Math.min(cells, 8); i++) tone(880 + i * 90, 0.07, { type: 'triangle', gain: 0.035, delay: 0.05 + i * 0.045 });
  },
  sting: () => {
    tone(190, 0.9, { type: 'sawtooth', gain: 0.09, wobble: [34, 22] });
    tone(285, 0.7, { type: 'sawtooth', gain: 0.05, wobble: [41, 30], delay: 0.05 });
    noise(0.12, { gain: 0.45, filter: 'highpass', freq: 3500 });
    tone(1400, 0.18, { type: 'square', gain: 0.05, slideTo: 300 });
  },
  /** The hive empties: a buzzing drone that swells as the swarm comes at you, then fades. */
  swarm: () => {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    const end = t + 2.9;
    const out = a.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.085, t + 0.9);
    out.gain.setValueAtTime(0.085, t + 1.4);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.linearRampToValueAtTime(2400, t + 1.1);
    lp.frequency.linearRampToValueAtTime(800, t + 2.8);
    // Wing beats: a fast tremolo over the whole cloud.
    const trem = a.createGain();
    trem.gain.value = 0.65;
    const lfo = a.createOscillator();
    lfo.frequency.value = 27;
    const depth = a.createGain();
    depth.gain.value = 0.35;
    lfo.connect(depth).connect(trem.gain);
    for (const f of [168, 171.5, 226, 229.5, 338]) {
      const o = a.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.85, t);
      o.frequency.linearRampToValueAtTime(f * 1.1, t + 1.1);
      o.frequency.linearRampToValueAtTime(f * 0.95, t + 2.8);
      o.connect(trem);
      o.start(t);
      o.stop(end);
    }
    trem.connect(lp).connect(out).connect(a.destination);
    lfo.start(t);
    lfo.stop(end);
  },
  /** One bee whizzing past your head: Doppler drop, panned from −1 (left) to 1 (right). */
  flyBy: (pan: number) => {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    const dur = 0.38;
    const f0 = 230 + Math.random() * 90;
    const o = a.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 1.4, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.72, t + dur);
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 0.7;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp).connect(g);
    if (typeof a.createStereoPanner === 'function') {
      const p = a.createStereoPanner();
      p.pan.setValueAtTime(pan * 0.3, t);
      p.pan.linearRampToValueAtTime(pan, t + dur);
      g.connect(p).connect(a.destination);
    } else {
      g.connect(a.destination);
    }
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  /** The bee that reaches you. */
  impact: () => {
    tone(150, 0.34, { gain: 0.24, slideTo: 42 });
    noise(0.25, { gain: 0.4, filter: 'lowpass', freq: 1600, sweepTo: 180 });
    tone(1800, 0.1, { type: 'square', gain: 0.045, slideTo: 500 });
  },
  cash: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.12, delay: i * 0.07 })),
  jackpot: () => {
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.26, { type: 'triangle', gain: 0.12, delay: i * 0.08 }));
    tone(1568, 0.7, { gain: 0.07, delay: 0.5 });
  },
  isMuted: () => muted,
  setMuted(next: boolean) {
    muted = next;
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  },
};
