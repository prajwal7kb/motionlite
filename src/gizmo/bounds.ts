import type { Layer, Project } from '../core/types';
import { evalProp } from '../core/expression';
import { resolveTransform } from '../core/layer';
import type { Bounds } from './types';

/**
 * Get the layer's bounding box in LOCAL space (anchor at origin, before
 * the layer's own transform is applied). Returns null for layers that
 * don't have a meaningful spatial extent (audio, null, group).
 *
 * The renderer draws every shape/text/media centered on local (0, 0),
 * so bounds are always centered around the local origin.
 */
export function getLayerBounds(layer: Layer, project: Project, time: number): Bounds | null {
  switch (layer.type) {
    case 'shape':
    case 'solid': {
      const s = layer.shape;
      if (!s) return null;
      if (s.kind === 'line') {
        return { x: -s.w / 2, y: -Math.max(1, s.strokeWidth) / 2, w: s.w, h: Math.max(1, s.strokeWidth) };
      }
      return { x: -s.w / 2, y: -s.h / 2, w: s.w, h: s.h };
    }

    case 'text': {
      const t = layer.text;
      if (!t) return null;
      // Measure using an offscreen canvas
      const measure = getMeasureCanvas();
      const mctx = measure.getContext('2d')!;
      mctx.font = `${t.weight} ${t.fontSize}px ${t.fontFamily}`;
      const lines = t.content.split('\n');
      let maxW = 0;
      for (const line of lines) {
        let w = 0;
        for (const ch of line) w += mctx.measureText(ch).width;
        w += t.tracking * Math.max(0, line.length - 1);
        maxW = Math.max(maxW, w);
      }
      const h = t.fontSize * t.leading * lines.length;
      return { x: -maxW / 2, y: -h / 2, w: maxW, h };
    }

    case 'image':
    case 'video': {
      const media = (globalThis as any).__ml_media?.[layer.assetId ?? ''];
      if (!media) return null;
      const w = (media.videoWidth || media.naturalWidth || 0);
      const h = (media.videoHeight || media.naturalHeight || 0);
      if (w <= 0 || h <= 0) return null;
      return { x: -w / 2, y: -h / 2, w, h };
    }

    default:
      return null;
  }
}

let _measureCanvas: HTMLCanvasElement | null = null;
function getMeasureCanvas(): HTMLCanvasElement {
  if (!_measureCanvas) {
    _measureCanvas = document.createElement('canvas');
    _measureCanvas.width = 1;
    _measureCanvas.height = 1;
  }
  return _measureCanvas;
}

/**
 * Take a local-space point and apply the layer's own transform
 * (already world-resolved by resolveTransform), producing a comp-space point.
 */
export function localToWorld(
  x: number,
  y: number,
  pos: { x: number; y: number },
  rot: number,
  scl: { x: number; y: number },
  anchor: { x: number; y: number }
): { x: number; y: number } {
  const rad = (rot * Math.PI) / 180;
  const sx = (x - anchor.x) * scl.x;
  const sy = (y - anchor.y) * scl.y;
  return {
    x: pos.x + sx * Math.cos(rad) - sy * Math.sin(rad),
    y: pos.y + sx * Math.sin(rad) + sy * Math.cos(rad),
  };
}

/**
 * Inverse of localToWorld: comp-space → layer local space.
 */
export function worldToLocal(
  x: number,
  y: number,
  pos: { x: number; y: number },
  rot: number,
  scl: { x: number; y: number },
  anchor: { x: number; y: number }
): { x: number; y: number } {
  const dx = x - pos.x;
  const dy = y - pos.y;
  const rad = (-rot * Math.PI) / 180;
  const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
  return {
    x: rx / (scl.x || 1) + anchor.x,
    y: ry / (scl.y || 1) + anchor.y,
  };
}

/**
 * Comp-space → screen-space pixels on the preview canvas.
 * Assumes the overlay canvas has the same pixel dimensions as the preview.
 */
export function compToScreen(
  cx: number,
  cy: number,
  project: Project,
  previewScale: number
): { x: number; y: number } {
  return {
    x: (cx + project.width / 2) * previewScale,
    y: (cy + project.height / 2) * previewScale,
  };
}

export function screenToComp(
  sx: number,
  sy: number,
  project: Project,
  previewScale: number
): { x: number; y: number } {
  return {
    x: sx / previewScale - project.width / 2,
    y: sy / previewScale - project.height / 2,
  };
}

/**
 * Compute the four corners of the layer's bounding box in comp space.
 */
export function getBoundsCorners(
  layer: Layer,
  project: Project,
  time: number
): { nw: { x: number; y: number }; ne: { x: number; y: number }; se: { x: number; y: number }; sw: { x: number; y: number }; center: { x: number; y: number } } | null {
  const bounds = getLayerBounds(layer, project, time);
  if (!bounds) return null;

  const byId = new Map(project.layers.map(l => [l.id, l]));
  const evalCtx = { time, layer, comp: project };
  const ev = (p: any) => evalProp(p, evalCtx);

  const { pos, rot, scl } = resolveTransform(layer, byId, ev);
  const anchor = ev(layer.props.anchor) as { x: number; y: number };

  const nw = localToWorld(bounds.x, bounds.y, pos, rot, scl, anchor);
  const ne = localToWorld(bounds.x + bounds.w, bounds.y, pos, rot, scl, anchor);
  const se = localToWorld(bounds.x + bounds.w, bounds.y + bounds.h, pos, rot, scl, anchor);
  const sw = localToWorld(bounds.x, bounds.y + bounds.h, pos, rot, scl, anchor);
  const center = localToWorld(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, pos, rot, scl, anchor);

  return { nw, ne, se, sw, center };
}

/**
 * Returns the resolved transform of a layer at a given time, useful
 * for gizmo math (avoids recomputing in multiple places).
 */
export function getLayerWorldTransform(layer: Layer, project: Project, time: number) {
  const byId = new Map(project.layers.map(l => [l.id, l]));
  const evalCtx = { time, layer, comp: project };
  const ev = (p: any) => evalProp(p, evalCtx);
  const { pos, rot, scl } = resolveTransform(layer, byId, ev);
  const anchor = ev(layer.props.anchor) as { x: number; y: number };
  return { pos, rot, scl, anchor };
}