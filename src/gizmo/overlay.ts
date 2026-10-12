import { useEditor } from '../state/store';
import { setKeyframe } from '../core/prop';
import type { AnimatableProp, Layer, Project, Vec2 } from '../core/types';
import {
  getBoundsCorners,
  getLayerBounds,
  getLayerWorldTransform,
  compToScreen,
  screenToComp,
  worldToLocal,
  localToWorld,
} from './bounds';
import {
  getSnapCandidates,
  resolveSnapOffsets,
  type SnapResult,
} from './snapping';
import {
  HANDLE_SIZE,
  HANDLE_HIT_PAD,
  ROTATE_OFFSET,
  SNAP_THRESHOLD,
  type HandleId,
  type SnapLine,
} from './types';

type DragState =
  | {
      kind: 'move';
      layerId: string;
      startComp: Vec2;
      startPos: Vec2;
      lastSnap: SnapResult | null;
    }
  | {
      kind: 'scale';
      layerId: string;
      handle: HandleId;
      startLocalMouse: Vec2;
      startScl: Vec2;
      startBounds: { x: number; y: number; w: number; h: number };
      startPos: Vec2;
      startRot: number;
      startAnchor: Vec2;
      lastSnap: SnapResult | null;
    }
  | {
      kind: 'rotate';
      layerId: string;
      center: Vec2;
      startAngleRad: number;
      startRot: number;
      lastSnap: SnapResult | null;
    };

function oppositeHandle(h: HandleId): HandleId {
  switch (h) {
    case 'nw': return 'se';
    case 'n':  return 's';
    case 'ne': return 'sw';
    case 'e':  return 'w';
    case 'se': return 'nw';
    case 's':  return 'n';
    case 'sw': return 'ne';
    case 'w':  return 'e';
    default:   return 'se';
  }
}

function handleLocalPos(
  handle: HandleId,
  bounds: { x: number; y: number; w: number; h: number }
): Vec2 {
  const bx = bounds.x;
  const by = bounds.y;
  const bw = bounds.w;
  const bh = bounds.h;
  switch (handle) {
    case 'nw': return { x: bx,          y: by          };
    case 'n':  return { x: bx + bw / 2, y: by          };
    case 'ne': return { x: bx + bw,     y: by          };
    case 'e':  return { x: bx + bw,     y: by + bh / 2 };
    case 'se': return { x: bx + bw,     y: by + bh     };
    case 's':  return { x: bx + bw / 2, y: by + bh     };
    case 'sw': return { x: bx,          y: by + bh     };
    case 'w':  return { x: bx,          y: by + bh / 2 };
    default:   return { x: bx + bw / 2, y: by + bh / 2 };
  }
}

type HitResult =
  | { kind: 'handle'; layerId: string; id: HandleId }
  | { kind: 'body'; layerId: string };

export class GizmoOverlay {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  private project: Project | null = null;
  private time = 0;
  private previewScale = 1;

  private drag: DragState | null = null;
  private hoverHandle: HandleId | 'body' | null = null;
  private guides: SnapLine[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Overlay canvas 2D context unavailable');
    this.ctx = ctx;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
  }

  update(project: Project, time: number, previewScale: number) {
    this.project = project;
    this.time = time;
    this.previewScale = previewScale;
    this.render();
  }

  // ── Rendering ─────────────────────────────────────────

  private render() {
    const { ctx, canvas, project } = this;
    if (!project) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const s = useEditor.getState();
    if (s.tool !== 'select') return;

    if (s.selectedLayerId) {
      const layer = project.layers.find(l => l.id === s.selectedLayerId);
      if (layer) {
        const corners = getBoundsCorners(layer, project, this.time);
        if (corners) {
          this.drawGizmo(corners);
        }
      }
    }

    for (const line of this.guides) {
      this.drawGuideLine(line);
    }
  }

  private drawGizmo(corners: {
    nw: Vec2; ne: Vec2; se: Vec2; sw: Vec2; center: Vec2;
  }) {
    const { ctx, project } = this;
    if (!project) return;
    const toScreen = (p: Vec2) => compToScreen(p.x, p.y, project, this.previewScale);
    const nw = toScreen(corners.nw);
    const ne = toScreen(corners.ne);
    const se = toScreen(corners.se);
    const sw = toScreen(corners.sw);

    ctx.save();
    ctx.strokeStyle = 'rgba(124, 92, 255, 0.9)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(nw.x, nw.y);
    ctx.lineTo(ne.x, ne.y);
    ctx.lineTo(se.x, se.y);
    ctx.lineTo(sw.x, sw.y);
    ctx.closePath();
    ctx.stroke();

    const mid = (a: Vec2, b: Vec2) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const nMid = mid(nw, ne);
    const rotatePos = this.computeRotateHandlePos(corners, nMid);
    ctx.strokeStyle = 'rgba(124, 92, 255, 0.6)';
    ctx.beginPath();
    ctx.moveTo(nMid.x, nMid.y);
    ctx.lineTo(rotatePos.x, rotatePos.y);
    ctx.stroke();
    ctx.restore();

    const eMid = mid(ne, se);
    const sMid = mid(se, sw);
    const wMid = mid(sw, nw);

    const handles: Array<{ id: HandleId; p: Vec2 }> = [
      { id: 'nw', p: nw }, { id: 'n', p: nMid }, { id: 'ne', p: ne },
      { id: 'e', p: eMid }, { id: 'se', p: se }, { id: 's', p: sMid },
      { id: 'sw', p: sw }, { id: 'w', p: wMid },
    ];

    for (const h of handles) {
      this.drawHandle(h.p.x, h.p.y, this.hoverHandle === h.id);
    }
    this.drawRotateHandle(rotatePos.x, rotatePos.y, this.hoverHandle === 'rotate');
  }

  private drawHandle(x: number, y: number, hovered: boolean) {
    const { ctx } = this;
    const s = HANDLE_SIZE;
    ctx.fillStyle = hovered ? '#7c5cff' : '#ffffff';
    ctx.strokeStyle = '#0b0b0f';
    ctx.lineWidth = 1;
    ctx.fillRect(x - s / 2, y - s / 2, s, s);
    ctx.strokeRect(x - s / 2 + 0.5, y - s / 2 + 0.5, s - 1, s - 1);
  }

  private drawRotateHandle(x: number, y: number, hovered: boolean) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_SIZE / 2 + 1, 0, Math.PI * 2);
    ctx.fillStyle = hovered ? '#7c5cff' : '#ffffff';
    ctx.strokeStyle = '#0b0b0f';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  }

  private drawGuideLine(line: SnapLine) {
    const { ctx, canvas, project } = this;
    if (!project) return;
    const color =
      line.kind === 'center' ? 'rgba(124, 92, 255, 0.9)' :
      line.kind === 'edge'   ? 'rgba(92, 141, 255, 0.9)' :
      line.kind === 'grid'   ? 'rgba(154, 154, 171, 0.5)' :
      line.kind === 'layer'  ? 'rgba(74, 222, 128, 0.85)' :
                               'rgba(255, 255, 255, 0.7)';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash(line.kind === 'grid' ? [4, 4] : []);
    ctx.beginPath();
    if (line.axis === 'x') {
      const sx = compToScreen(line.value, 0, project, this.previewScale).x;
      ctx.moveTo(sx + 0.5, 0);
      ctx.lineTo(sx + 0.5, canvas.height);
    } else {
      const sy = compToScreen(0, line.value, project, this.previewScale).y;
      ctx.moveTo(0, sy + 0.5);
      ctx.lineTo(canvas.width, sy + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  private computeRotateHandlePos(
    corners: { nw: Vec2; ne: Vec2; center: Vec2 },
    topMidScreen: Vec2
  ): Vec2 {
    const { project } = this;
    if (!project) return topMidScreen;
    const nw = compToScreen(corners.nw.x, corners.nw.y, project, this.previewScale);
    const ne = compToScreen(corners.ne.x, corners.ne.y, project, this.previewScale);
    const cS = compToScreen(corners.center.x, corners.center.y, project, this.previewScale);

    const dx = ne.x - nw.x;
    const dy = ne.y - nw.y;
    const len = Math.hypot(dx, dy) || 1;

    const px1 = -dy / len;
    const py1 = dx / len;

    const outX = topMidScreen.x - cS.x;
    const outY = topMidScreen.y - cS.y;

    const dot = px1 * outX + py1 * outY;
    const sgn = dot >= 0 ? 1 : -1;

    return {
      x: topMidScreen.x + sgn * px1 * ROTATE_OFFSET,
      y: topMidScreen.y + sgn * py1 * ROTATE_OFFSET,
    };
  }

  // ── Hit testing ───────────────────────────────────────

  private hitTestAll(screenX: number, screenY: number): HitResult | null {
    const { project } = this;
    if (!project) return null;
    const s = useEditor.getState();

    if (s.selectedLayerId) {
      const selected = project.layers.find(l => l.id === s.selectedLayerId);
      if (selected) {
        const handle = this.hitTestHandles(screenX, screenY, selected);
        if (handle) return { kind: 'handle', layerId: selected.id, id: handle };
      }
    }

    for (const layer of project.layers) {
      if (layer.hidden) continue;
      if (this.time < layer.inPoint || this.time > layer.outPoint) continue;
      if (layer.type === 'audio' || layer.type === 'null' || layer.type === 'group') continue;
      if (this.pointInLayerBody(screenX, screenY, layer)) {
        return { kind: 'body', layerId: layer.id };
      }
    }

    return null;
  }

  private hitTestHandles(sx: number, sy: number, layer: Layer): HandleId | null {
    const { project } = this;
    if (!project) return null;
    const corners = getBoundsCorners(layer, project, this.time);
    if (!corners) return null;

    const toScreen = (p: Vec2) => compToScreen(p.x, p.y, project, this.previewScale);
    const nw = toScreen(corners.nw);
    const ne = toScreen(corners.ne);
    const se = toScreen(corners.se);
    const sw = toScreen(corners.sw);
    const mid = (a: Vec2, b: Vec2) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const nMid = mid(nw, ne);

    const handles: Array<{ id: HandleId; p: Vec2 }> = [
      { id: 'nw', p: nw }, { id: 'n', p: nMid }, { id: 'ne', p: ne },
      { id: 'e', p: mid(ne, se) }, { id: 'se', p: se }, { id: 's', p: mid(se, sw) },
      { id: 'sw', p: sw }, { id: 'w', p: mid(sw, nw) },
    ];

    const hit = HANDLE_SIZE / 2 + HANDLE_HIT_PAD;
    for (const h of handles) {
      if (Math.abs(sx - h.p.x) <= hit && Math.abs(sy - h.p.y) <= hit) {
        return h.id;
      }
    }

    const rotatePos = this.computeRotateHandlePos(corners, nMid);
    if (Math.hypot(sx - rotatePos.x, sy - rotatePos.y) <= hit) {
      return 'rotate';
    }

    return null;
  }

  private pointInLayerBody(sx: number, sy: number, layer: Layer): boolean {
    const { project } = this;
    if (!project) return false;
    const corners = getBoundsCorners(layer, project, this.time);
    if (!corners) return false;

    const toScreen = (p: Vec2) => compToScreen(p.x, p.y, project, this.previewScale);
    const nw = toScreen(corners.nw);
    const ne = toScreen(corners.ne);
    const se = toScreen(corners.se);
    const sw = toScreen(corners.sw);
    return this.pointInQuad(sx, sy, nw, ne, se, sw);
  }

  private pointInQuad(
    px: number, py: number,
    a: Vec2, b: Vec2, c: Vec2, d: Vec2
  ): boolean {
    const cross = (p1: Vec2, p2: Vec2) =>
      (p2.x - p1.x) * (py - p1.y) - (p2.y - p1.y) * (px - p1.x);
    const c1 = cross(a, b);
    const c2 = cross(b, c);
    const c3 = cross(c, d);
    const c4 = cross(d, a);
    return (c1 < 0 && c2 < 0 && c3 < 0 && c4 < 0) ||
           (c1 > 0 && c2 > 0 && c3 > 0 && c4 > 0);
  }

  // ── Event handlers ────────────────────────────────────

  private toBufferXY(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  private onPointerMove = (e: PointerEvent) => {
    const { project } = this;
    if (!project) return;
    const { x: bx, y: by } = this.toBufferXY(e);

    if (this.drag) {
      this.handleDragMove(bx, by, e);
      return;
    }

    const hit = this.hitTestAll(bx, by);
    let next: HandleId | 'body' | null = null;
    if (hit) {
      next = hit.kind === 'handle' ? hit.id : 'body';
    }

    if (next !== this.hoverHandle) {
      this.hoverHandle = next;
      this.updateCursor();
      this.render();
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    const { project, canvas } = this;
    if (!project) return;
    const { x: bx, y: by } = this.toBufferXY(e);
    const hit = this.hitTestAll(bx, by);

    if (!hit) {
      useEditor.getState().select(null);
      return;
    }

    const s = useEditor.getState();

    if (hit.kind === 'body') {
      if (hit.layerId !== s.selectedLayerId) {
        s.select(hit.layerId);
      }
      const layer = project.layers.find(l => l.id === hit.layerId);
      if (!layer) return;
      s.commit();

      const world = getLayerWorldTransform(layer, project, this.time);
      const compMouse = screenToComp(bx, by, project, this.previewScale);

      this.drag = {
        kind: 'move',
        layerId: layer.id,
        startComp: compMouse,
        startPos: { ...world.pos },
        lastSnap: null,
      };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      return;
    }

    const layer = project.layers.find(l => l.id === s.selectedLayerId);
    if (!layer) return;
    s.commit();

    const world = getLayerWorldTransform(layer, project, this.time);
    const compMouse = screenToComp(bx, by, project, this.previewScale);

    if (hit.id === 'rotate') {
      const center = world.pos;
      const startAngle = Math.atan2(compMouse.y - center.y, compMouse.x - center.x);
      this.drag = {
        kind: 'rotate',
        layerId: layer.id,
        center,
        startAngleRad: startAngle,
        startRot: world.rot,
        lastSnap: null,
      };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      return;
    }

    const layerBounds = getLayerBounds(layer, project, this.time)
      ?? { x: -50, y: -50, w: 100, h: 100 };

    const localMouse = worldToLocal(
      compMouse.x, compMouse.y,
      world.pos, world.rot, world.scl, world.anchor
    );

    this.drag = {
      kind: 'scale',
      layerId: layer.id,
      handle: hit.id,
      startLocalMouse: localMouse,
      startScl: { ...world.scl },
      startBounds: layerBounds,
      startPos: { ...world.pos },
      startRot: world.rot,
      startAnchor: { ...world.anchor },
      lastSnap: null,
    };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.drag) {
      this.drag = null;
      this.guides = [];
      try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      this.updateCursor();
      this.render();
    }
  };

  private onPointerLeave = () => {
    if (!this.drag) {
      this.hoverHandle = null;
      this.updateCursor();
      this.render();
    }
  };

  // ── Drag logic ────────────────────────────────────────

  private handleDragMove(bx: number, by: number, e: PointerEvent) {
    const { project, drag } = this;
    if (!project || !drag) return;

    const compMouse = screenToComp(bx, by, project, this.previewScale);

    if (drag.kind === 'move') {
      let dx = compMouse.x - drag.startComp.x;
      let dy = compMouse.y - drag.startComp.y;
      let snapX: SnapLine | null = null;
      let snapY: SnapLine | null = null;

      if (!e.altKey) {
        const layer = project.layers.find(l => l.id === drag.layerId);
        if (layer) {
          const corners = getBoundsCorners(layer, project, this.time);
          if (corners) {
            const xs = [corners.nw.x, corners.ne.x, corners.sw.x, corners.se.x, corners.center.x]
              .map(v => v + dx);
            const ys = [corners.nw.y, corners.ne.y, corners.sw.y, corners.se.y, corners.center.y]
              .map(v => v + dy);

            const threshold = SNAP_THRESHOLD / this.previewScale;

            const cands = getSnapCandidates({
              project,
              time: this.time,
              excludeLayerIds: [drag.layerId],
              threshold,
              gridEnabled: e.shiftKey,
              gridSize: 100,
            });
            const snap = resolveSnapOffsets(xs, ys, cands, threshold);
            dx += snap.dx;
            dy += snap.dy;
            snapX = snap.xLine;
            snapY = snap.yLine;
          }
        }
      }

      this.guides = [snapX, snapY].filter((x): x is SnapLine => !!x);

      const newPos = { x: drag.startPos.x + dx, y: drag.startPos.y + dy };
      this.setVecProp(drag.layerId, 'position', newPos);
      this.render();
      return;
    }

    if (drag.kind === 'rotate') {
      const angle = Math.atan2(compMouse.y - drag.center.y, compMouse.x - drag.center.x);
      const deltaDeg = ((angle - drag.startAngleRad) * 180) / Math.PI;
      let newRot = drag.startRot + deltaDeg;

      if (!e.altKey) {
        const snapped = Math.round(newRot / 15) * 15;
        if (Math.abs(snapped - newRot) < 3) {
          newRot = snapped;
        }
      }

      this.setNumProp(drag.layerId, 'rotation', newRot);
      this.render();
      return;
    }

    if (drag.kind === 'scale') {
      const layer = project.layers.find(l => l.id === drag.layerId);
      if (!layer) return;

      const isLine = layer.shape?.kind === 'line';

      const localMouse = worldToLocal(
        compMouse.x, compMouse.y,
        drag.startPos, drag.startRot, drag.startScl, drag.startAnchor
      );

      const h = drag.handle;
      const isCorner = h === 'nw' || h === 'ne' || h === 'se' || h === 'sw';
      const affectsX = h !== 'n' && h !== 's';
      // Lines have no vertical extent — never scale them vertically.
      const affectsY = !isLine && h !== 'e' && h !== 'w';

      const refLocal = handleLocalPos(h, drag.startBounds);

      let multX = 1;
      let multY = 1;

      if (affectsX) {
        const denom = refLocal.x - drag.startAnchor.x;
        if (Math.abs(denom) > 0.01) {
          multX = (localMouse.x - drag.startAnchor.x) / denom;
        }
      }
      if (affectsY) {
        const denom = refLocal.y - drag.startAnchor.y;
        if (Math.abs(denom) > 0.01) {
          multY = (localMouse.y - drag.startAnchor.y) / denom;
        }
      }

      // Corner + Shift = uniform scaling. Not applicable to lines.
      if (isCorner && e.shiftKey && !isLine) {
        const avg = (multX + multY) / 2;
        multX = avg;
        multY = avg;
      }

      let newSclX = drag.startScl.x * multX;
      let newSclY = drag.startScl.y * multY;

      newSclX = Math.max(0.001, newSclX);
      newSclY = Math.max(0.001, newSclY);

      // Scale around the OPPOSITE handle (pivot), not the anchor.
      const pivotLocal = handleLocalPos(oppositeHandle(h), drag.startBounds);
      const oldPivotWorld = localToWorld(
        pivotLocal.x, pivotLocal.y,
        drag.startPos, drag.startRot, drag.startScl, drag.startAnchor
      );
      const newPivotWorld = localToWorld(
        pivotLocal.x, pivotLocal.y,
        drag.startPos, drag.startRot,
        { x: newSclX, y: newSclY }, drag.startAnchor
      );
      const shiftX = oldPivotWorld.x - newPivotWorld.x;
      const shiftY = oldPivotWorld.y - newPivotWorld.y;
      const newPos = { x: drag.startPos.x + shiftX, y: drag.startPos.y + shiftY };

      this.setVecProp(drag.layerId, 'scale', { x: newSclX, y: newSclY });
      this.setVecProp(drag.layerId, 'position', newPos);
      this.render();
      return;
    }
  }

  // ── Property writers ──────────────────────────────────

  private setVecProp(layerId: string, key: string, value: Vec2) {
    useEditor.getState().updateLayer(layerId, l => {
      const prop = l.props[key] as AnimatableProp<Vec2> | undefined;
      if (!prop) return;
      if (prop.keyframes.length > 0) {
        setKeyframe(prop, this.time, value, 'linear');
      } else {
        prop.value = value;
      }
    });
  }

  private setNumProp(layerId: string, key: string, value: number) {
    useEditor.getState().updateLayer(layerId, l => {
      const prop = l.props[key] as AnimatableProp<number> | undefined;
      if (!prop) return;
      if (prop.keyframes.length > 0) {
        setKeyframe(prop, this.time, value, 'linear');
      } else {
        prop.value = value;
      }
    });
  }

  // ── Cursor ────────────────────────────────────────────

  private updateCursor() {
    this.canvas.style.cursor = this.cursorFor(this.hoverHandle);
  }

  private cursorFor(h: HandleId | 'body' | null): string {
    if (h === 'body') return 'move';
    if (h === 'rotate') return 'grab';
    switch (h) {
      case 'nw': case 'se': return 'nwse-resize';
      case 'ne': case 'sw': return 'nesw-resize';
      case 'n': case 's': return 'ns-resize';
      case 'e': case 'w': return 'ew-resize';
      default: return 'default';
    }
  }
}