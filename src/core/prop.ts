import type { AnimatableProp, Keyframe, Vec2 } from './types';
import { uid } from './types';
import { cubicBezier, lerp, lerpColor, lerpVec } from './interpolate';

export const P = {
  num:   (v = 0): AnimatableProp<number> => ({ value: v, keyframes: [] }),
  vec:   (v: Vec2 = { x: 0, y: 0 }): AnimatableProp<Vec2> => ({ value: v, keyframes: [] }),
  color: (v = '#ffffff'): AnimatableProp<string> => ({ value: v, keyframes: [] }),
  bool:  (v = false): AnimatableProp<boolean> => ({ value: v, keyframes: [] }),
};

export function kf<T>(time: number, value: T): Keyframe<T> {
  return { id: uid(), time, value, easing: 'linear' };
}

function blend<T>(a: T, b: T, t: number): T {
  if (typeof a === 'number' && typeof b === 'number') return lerp(a, b, t) as any;
  if (a && b && typeof a === 'object' && 'x' in (a as any))
    return lerpVec(a as unknown as Vec2, b as unknown as Vec2, t) as any;
  if (typeof a === 'string' && a.startsWith('#') && typeof b === 'string')
    return lerpColor(a, b, t) as any;
  return t < 1 ? a : b;
}

export function keyframeValue<T>(prop: AnimatableProp<T>, time: number): T {
  const ks = prop.keyframes;
  if (!ks || ks.length === 0) return prop.value;
  if (ks.length === 1) return ks[0].value;
  if (time <= ks[0].time) return ks[0].value;
  if (time >= ks[ks.length - 1].time) return ks[ks.length - 1].value;

  let lo = 0, hi = ks.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ks[mid].time <= time) lo = mid; else hi = mid;
  }
  const a = ks[lo], b = ks[hi];
  if (a.easing === 'hold') return a.value;

  const span = b.time - a.time;
  const raw = span <= 0 ? 1 : (time - a.time) / span;
  let t = raw;
  if (a.easing === 'bezier') {
    const [x1, y1, x2, y2] = a.bezier ?? [0.25, 0.1, 0.25, 1];
    t = cubicBezier(x1, y1, x2, y2)(raw);
  }
  return blend(a.value, b.value, t);
}

export function setKeyframe<T>(prop: AnimatableProp<T>, time: number, value: T, easing: Keyframe['easing'] = 'linear') {
  const existing = prop.keyframes.find(k => Math.abs(k.time - time) < 1e-4);
  if (existing) { existing.value = value; existing.easing = easing; return; }
  prop.keyframes.push({ id: uid(), time, value, easing });
  prop.keyframes.sort((a, b) => a.time - b.time);
}

export function removeKeyframe(prop: AnimatableProp, id: string) {
  prop.keyframes = prop.keyframes.filter(k => k.id !== id);
}