import { P } from './prop';
import { uid } from './types';
import type { Layer, LayerType, ShapeData, TextData, ShapeKind } from './types';

/** Per-kind shape defaults. Stroke/fill flags are per-kind, not just geometry. */
export const SHAPE_DEFAULTS: Record<ShapeKind, Partial<ShapeData>> = {
  rect:    { w: 300, h: 200, radius: 16, sides: 4, fillOn: true,  strokeOn: false },
  ellipse: { w: 300, h: 200, radius: 0,  sides: 4, fillOn: true,  strokeOn: false },
  polygon: { w: 260, h: 260, radius: 0,  sides: 6, fillOn: true,  strokeOn: false },
  star:    { w: 260, h: 260, radius: 45, sides: 5, fillOn: true,  strokeOn: false },
  // Lines have no fill and must have a stroke, or nothing is visible.
  line:    { w: 300, h: 0,   radius: 0,  sides: 2, fillOn: false, strokeOn: true, strokeWidth: 4 },
};

export const DEFAULT_SHAPE: ShapeData = {
  kind: 'rect', w: 300, h: 200, radius: 16, sides: 4,
  fill: '#7c5cff', fillOn: true,
  stroke: '#ffffff', strokeOn: false, strokeWidth: 4,
};

export const DEFAULT_TEXT: TextData = {
  content: 'Hello, motion.',
  fontFamily: 'Inter, Segoe UI, sans-serif',
  fontSize: 96, weight: 700, align: 'center',
  tracking: 0, leading: 1.15, fill: '#ffffff',
};

export function makeLayer(type: LayerType, name?: string): Layer {
  const base: Layer = {
    id: uid(),
    name: name ?? type[0].toUpperCase() + type.slice(1),
    type,
    locked: false, hidden: false, solo: false,
    blendMode: 'source-over',
    inPoint: 0, outPoint: 5,
    props: {
      position: P.vec({ x: 0, y: 0 }),
      scale:    P.vec({ x: 1, y: 1 }),
      rotation: P.num(0),
      anchor:   P.vec({ x: 0, y: 0 }),
      opacity:  P.num(1),
    },
    effects: [],
  };
  if (type === 'shape') base.shape = { ...DEFAULT_SHAPE };
  if (type === 'text') {
    base.text = { ...DEFAULT_TEXT };
    base.props.reveal = P.num(1);
  }
  return base;
}

export function makeShapeLayer(kind: ShapeKind): Layer {
  const l = makeLayer('shape', kind[0].toUpperCase() + kind.slice(1));
  l.shape = { ...DEFAULT_SHAPE, ...SHAPE_DEFAULTS[kind], kind };
  return l;
}

export function makeSolidLayer(width: number, height: number, color = '#7c5cff'): Layer {
  const l = makeLayer('solid', 'Solid');
  l.shape = {
    kind: 'rect',
    w: width, h: height, radius: 0, sides: 4,
    fill: color, fillOn: true,
    stroke: '#ffffff', strokeOn: false, strokeWidth: 0,
  };
  return l;
}

export function resolveTransform(
  layer: Layer,
  byId: Map<string, Layer>,
  evalFn: (p: any) => any
) {
  let pos = evalFn(layer.props.position) as { x: number; y: number };
  let rot = evalFn(layer.props.rotation) as number;
  let scl = evalFn(layer.props.scale) as { x: number; y: number };

  let parent = layer.parentId ? byId.get(layer.parentId) : undefined;
  const guard = new Set<string>();
  while (parent && !guard.has(parent.id)) {
    guard.add(parent.id);
    const pp = evalFn(parent.props.position) as { x: number; y: number };
    const pr = evalFn(parent.props.rotation) as number;
    const ps = evalFn(parent.props.scale) as { x: number; y: number };

    const rad = (pr * Math.PI) / 180;
    pos = {
      x: pp.x + (pos.x * Math.cos(rad) - pos.y * Math.sin(rad)) * ps.x,
      y: pp.y + (pos.x * Math.sin(rad) + pos.y * Math.cos(rad)) * ps.y,
    };
    rot += pr;
    scl = { x: scl.x * ps.x, y: scl.y * ps.y };
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  return { pos, rot, scl };
}