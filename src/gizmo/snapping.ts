import { evalProp } from '../core/expression';
import { getBoundsCorners } from './bounds';
import type { SnapContext, SnapLine, SnapProvider } from './types';

// ── Built-in providers ───────────────────────────────────

const compCenterProvider: SnapProvider = () => [
  { axis: 'x', value: 0, kind: 'center' },
  { axis: 'y', value: 0, kind: 'center' },
];

const compEdgeProvider: SnapProvider = (ctx) => [
  { axis: 'x', value: -ctx.project.width / 2, kind: 'edge' },
  { axis: 'x', value:  ctx.project.width / 2, kind: 'edge' },
  { axis: 'y', value: -ctx.project.height / 2, kind: 'edge' },
  { axis: 'y', value:  ctx.project.height / 2, kind: 'edge' },
];

const gridProvider: SnapProvider = (ctx) => {
  if (!ctx.gridEnabled) return [];
  const step = ctx.gridSize;
  const out: SnapLine[] = [];
  const hw = ctx.project.width / 2;
  const hh = ctx.project.height / 2;
  const xs = Math.floor(hw / step);
  const ys = Math.floor(hh / step);
  for (let i = -xs; i <= xs; i++) out.push({ axis: 'x', value: i * step, kind: 'grid' });
  for (let i = -ys; i <= ys; i++) out.push({ axis: 'y', value: i * step, kind: 'grid' });
  return out;
};

/**
 * Snap candidates from every other visible layer:
 * - Its position (center)
 * - Its bbox corners and edge midpoints in comp space
 */
const otherLayersProvider: SnapProvider = (ctx) => {
  const out: SnapLine[] = [];
  for (const layer of ctx.project.layers) {
    if (ctx.excludeLayerIds.includes(layer.id)) continue;
    if (layer.hidden) continue;
    if (ctx.time < layer.inPoint || ctx.time > layer.outPoint) continue;
    if (layer.type === 'audio' || layer.type === 'null' || layer.type === 'group') continue;

    try {
      const posProp = layer.props.position;
      if (posProp) {
        const pos = evalProp(posProp, { time: ctx.time, layer, comp: ctx.project }) as { x: number; y: number };
        out.push({ axis: 'x', value: pos.x, kind: 'layer', label: layer.name });
        out.push({ axis: 'y', value: pos.y, kind: 'layer', label: layer.name });
      }

      const corners = getBoundsCorners(layer, ctx.project, ctx.time);
      if (corners) {
        const xs = [corners.nw.x, corners.ne.x, corners.sw.x, corners.se.x, corners.center.x];
        const ys = [corners.nw.y, corners.ne.y, corners.sw.y, corners.se.y, corners.center.y];
        for (const v of xs) out.push({ axis: 'x', value: v, kind: 'layer', label: layer.name });
        for (const v of ys) out.push({ axis: 'y', value: v, kind: 'layer', label: layer.name });
      }
    } catch { /* skip */ }
  }
  return out;
};

// ── Registry (extensible for plugins) ────────────────────

const PROVIDERS: SnapProvider[] = [
  compCenterProvider,
  compEdgeProvider,
  otherLayersProvider,
  gridProvider,
];

export function registerSnapProvider(provider: SnapProvider) {
  PROVIDERS.push(provider);
}

export function getSnapCandidates(ctx: SnapContext): SnapLine[] {
  return PROVIDERS.flatMap(p => p(ctx));
}

// ── Resolution ────────────────────────────────────────────

export interface SnapResult {
  dx: number;
  dy: number;
  xLine: SnapLine | null;
  yLine: SnapLine | null;
}

export function resolveSnapOffsets(
  xEdges: number[],
  yEdges: number[],
  candidates: SnapLine[],
  threshold: number
): SnapResult {
  let bestDX = 0;
  let bestXAbs = threshold + 1;
  let bestXLine: SnapLine | null = null;

  for (const c of candidates) {
    if (c.axis !== 'x') continue;
    for (const edge of xEdges) {
      const d = c.value - edge;
      const abs = Math.abs(d);
      if (abs < bestXAbs) {
        bestXAbs = abs;
        bestDX = d;
        bestXLine = c;
      }
    }
  }

  let bestDY = 0;
  let bestYAbs = threshold + 1;
  let bestYLine: SnapLine | null = null;

  for (const c of candidates) {
    if (c.axis !== 'y') continue;
    for (const edge of yEdges) {
      const d = c.value - edge;
      const abs = Math.abs(d);
      if (abs < bestYAbs) {
        bestYAbs = abs;
        bestDY = d;
        bestYLine = c;
      }
    }
  }

  return {
    dx: bestXLine ? bestDX : 0,
    dy: bestYLine ? bestDY : 0,
    xLine: bestXLine,
    yLine: bestYLine,
  };
}