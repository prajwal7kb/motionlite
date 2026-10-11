import { uid } from './types';
import type { Effect, Layer, Preset, TextData } from './types';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export function presetFromLayer(layer: Layer, name: string, category = 'Layers'): Preset {
  return {
    id: uid(), name, category, kind: 'layer',
    payload: {
      type: layer.type,
      props: clone(layer.props),
      shape: clone(layer.shape),
      text: clone(layer.text),
      effects: clone(layer.effects),
    },
  };
}

export function presetFromEffect(effect: Effect, name: string, category = 'Effects'): Preset {
  return { id: uid(), name, category, kind: 'effect', payload: clone(effect) };
}

export function presetFromTextAnim(text: Partial<TextData>, name: string, category = 'Text'): Preset {
  return { id: uid(), name, category, kind: 'text', payload: clone(text) };
}

export function applyLayerPreset(target: Layer, preset: Preset): Layer {
  const p = clone(preset.payload);
  return {
    ...target,
    type: p.type ?? target.type,
    props: { ...target.props, ...(p.props ?? {}) },
    shape: p.shape ?? target.shape,
    text: p.text ?? target.text,
    effects: p.effects ? clone(p.effects) : target.effects,
  };
}

export const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'builtin-typewriter', name: 'Typewriter', category: 'Text', kind: 'text',
    payload: {
      props: {
        reveal: {
          value: 1,
          keyframes: [
            { id: uid(), time: 0,   value: 0, easing: 'linear' },
            { id: uid(), time: 1.2, value: 1, easing: 'linear' },
          ],
        },
      },
    },
  },
  {
    id: 'builtin-fade-up', name: 'Fade Up', category: 'Animations', kind: 'layer',
    payload: {
      props: {
        opacity: { value: 1, keyframes: [
          { id: uid(), time: 0,   value: 0, easing: 'bezier', bezier: [0.16, 1, 0.3, 1] },
          { id: uid(), time: 0.6, value: 1, easing: 'linear' },
        ]},
        position: { value: { x: 0, y: 0 }, keyframes: [
          { id: uid(), time: 0,   value: { x: 0, y: 40 }, easing: 'bezier', bezier: [0.16, 1, 0.3, 1] },
          { id: uid(), time: 0.6, value: { x: 0, y: 0 },  easing: 'linear' },
        ]},
      },
    },
  },
  {
    id: 'builtin-wiggle', name: 'Wiggle Position', category: 'Expressions', kind: 'layer',
    payload: {
      props: {
        position: { value: { x: 0, y: 0 }, keyframes: [], expression: 'wiggle(3, 20)', expressionOn: true },
      },
    },
  },
];