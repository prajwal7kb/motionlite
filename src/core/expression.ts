import { keyframeValue } from './prop';
import type { AnimatableProp, Layer, Project } from './types';

const cache = new Map<string, Function>();

function compile(src: string): Function {
  let fn = cache.get(src);
  if (fn) return fn;
  fn = new Function('$', 'with($){ return (' + src + '); }');
  cache.set(src, fn);
  return fn;
}

// Deterministic hash → [0, 1)
function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

// Quintic-smooth 1D value noise → [0, 1). C2-continuous (smooth velocity).
function smoothNoise(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  // quintic: 6f^5 - 15f^4 + 10f^3
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return hash1(i) * (1 - u) + hash1(i + 1) * u;
}

function makeWiggle(base: any) {
  return (freq = 1, amp = 10) => {
    const t = (globalThis as any).__ml_time ?? 0;
    // Use three independent channels so X, Y and scalar wiggle don't correlate
    const nx = (smoothNoise(t * freq + 0.11) - 0.5) * 2;
    const ny = (smoothNoise(t * freq + 100.37) - 0.5) * 2;
    const nz = (smoothNoise(t * freq + 200.71) - 0.5) * 2;

    if (base && typeof base === 'object' && 'x' in base) {
      return { x: base.x + nx * amp, y: base.y + ny * amp };
    }
    return base + nz * amp;
  };
}

let seed = 1337;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

export interface EvalCtx {
  time: number;
  layer: Layer;
  comp: Project;
}

export function evalProp<T>(prop: AnimatableProp<T>, ctx: EvalCtx): T {
  const base = keyframeValue(prop, ctx.time);
  if (!prop.expression || !prop.expressionOn) return base;

  (globalThis as any).__ml_time = ctx.time;

  const ease = (a: number, b: number, t: number) => {
    const u = Math.max(0, Math.min(1, (t - a) / (b - a || 1)));
    return u * u * (3 - 2 * u);
  };

  const scope: any = {
    time: ctx.time,
    value: base,
    layer: ctx.layer,
    comp: ctx.comp,
    wiggle: makeWiggle(base),
    ease,
    linear: (t: number, t0: number, t1: number, v0: number, v1: number) => {
      const u = (t - t0) / (t1 - t0 || 1);
      return v0 + (v1 - v0) * Math.max(0, Math.min(1, u));
    },
    loopOut: () => base,
    random: (a = 1, b?: number) => (b === undefined ? rand() * a : a + rand() * (b - a)),
    noise: (x: number) => smoothNoise(x) * 2 - 1,
    Math, sin: Math.sin, cos: Math.cos, tan: Math.tan,
    abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    min: Math.min, max: Math.max, pow: Math.pow, sqrt: Math.sqrt, PI: Math.PI,
  };

  try {
    return compile(prop.expression)(scope) as T;
  } catch (err) {
    (prop as any).__error = String(err);
    return base;
  }
}