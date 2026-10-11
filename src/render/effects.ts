import { evalProp } from '../core/expression';
import type { Effect, Layer, Project } from '../core/types';

export function effectFilter(
  effects: Effect[],
  ctx: { time: number; layer: Layer; comp: Project }
): string {
  const parts: string[] = [];
  for (const e of effects) {
    if (!e.enabled) continue;
    const v = (k: string, d: number) => {
      const p = e.params[k];
      return p ? (evalProp(p, ctx) as number) : d;
    };
    switch (e.type) {
      case 'blur':
        parts.push(`blur(${v('amount', 0)}px)`);
        break;
      case 'dropShadow': {
        const c = e.params.color ? (evalProp(e.params.color, ctx) as string) : '#000';
        parts.push(`drop-shadow(${v('x', 4)}px ${v('y', 4)}px ${v('blur', 8)}px ${c})`);
        break;
      }
      case 'glow': {
        const amt = v('amount', 8);
        parts.push(`drop-shadow(0 0 ${amt}px #fff) drop-shadow(0 0 ${amt * 1.6}px #fff)`);
        break;
      }
      case 'colorCorrect': {
        parts.push(`brightness(${v('brightness', 1)}) contrast(${v('contrast', 1)}) saturate(${v('saturation', 1)})`);
        break;
      }
    }
  }
  return parts.join(' ');
}