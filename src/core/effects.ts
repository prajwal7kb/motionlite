import { P } from './prop';
import { uid } from './types';
import type { Effect } from './types';

export type EffectKind = Effect['type'];

export interface EffectDef {
  type: EffectKind;
  label: string;
  defaults: Record<
    string,
    {
      kind: 'number' | 'color';
      value: number | string;
      step?: number;
      min?: number;
      max?: number;
    }
  >;
}

export const EFFECT_DEFS: Record<EffectKind, EffectDef> = {
  blur: {
    type: 'blur',
    label: 'Blur',
    defaults: {
      amount: { kind: 'number', value: 8, step: 0.5, min: 0 },
    },
  },
  glow: {
    type: 'glow',
    label: 'Glow',
    defaults: {
      amount: { kind: 'number', value: 12, step: 0.5, min: 0 },
    },
  },
  dropShadow: {
    type: 'dropShadow',
    label: 'Drop Shadow',
    defaults: {
      x:     { kind: 'number', value: 6,  step: 1 },
      y:     { kind: 'number', value: 6,  step: 1 },
      blur:  { kind: 'number', value: 12, step: 0.5, min: 0 },
      color: { kind: 'color',  value: '#000000' },
    },
  },
  colorCorrect: {
    type: 'colorCorrect',
    label: 'Color Correct',
    defaults: {
      brightness: { kind: 'number', value: 1, step: 0.02, min: 0, max: 3 },
      contrast:   { kind: 'number', value: 1, step: 0.02, min: 0, max: 3 },
      saturation: { kind: 'number', value: 1, step: 0.02, min: 0, max: 3 },
    },
  },
};

export function makeEffect(kind: EffectKind): Effect {
  const def = EFFECT_DEFS[kind];
  const params: Effect['params'] = {};
  for (const [key, spec] of Object.entries(def.defaults)) {
    params[key] = spec.kind === 'color'
      ? P.color(spec.value as string)
      : P.num(spec.value as number);
  }
  return { id: uid(), type: kind, enabled: true, params };
}