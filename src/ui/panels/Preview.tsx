import React, { useEffect, useRef, useState } from 'react';
import { useEditor } from '../../state/store';
import { Renderer } from '../../render/renderer';
import { GizmoOverlay } from '../../gizmo/overlay';
import { makeLayer, makeShapeLayer } from '../../core/layer';
import { audioManager } from '../../core/audio';
import type { ShapeKind } from '../../core/types';

interface DrawState {
  startX: number;
  startY: number;
  layerId: string;
}

export default function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const gizmoRef = useRef<GizmoOverlay | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<DrawState | null>(null);
  const [, forceTick] = useState(0);
  const { project, time, previewScale, playing, tool, selectedLayerId, setPlaying, setPreviewScale } = useEditor();

  // Init renderer + gizmo
  useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      rendererRef.current = new Renderer(canvasRef.current);
    }
    if (overlayRef.current && !gizmoRef.current) {
      gizmoRef.current = new GizmoOverlay(overlayRef.current);
    }
    return () => {
      gizmoRef.current?.dispose();
      gizmoRef.current = null;
    };
  }, []);

  // Sync canvas buffer sizes and render
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const r = rendererRef.current;
    if (!canvas || !overlay || !r) return;

    const w = Math.round(project.width * previewScale);
    const h = Math.round(project.height * previewScale);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (overlay.width !== w || overlay.height !== h) {
      overlay.width = w;
      overlay.height = h;
    }

    r.render(project, { time, scale: previewScale, playing });
    gizmoRef.current?.update(project, time, previewScale);
    audioManager.sync(project, time, playing);
  }, [project, time, previewScale, playing, selectedLayerId]);

  // Interaction mode on overlay
  const overlayInteractive = tool === 'select';
  useEffect(() => {
    const o = overlayRef.current;
    if (o) o.style.pointerEvents = overlayInteractive ? 'auto' : 'none';
  }, [overlayInteractive]);

  // Playback loop
  useEffect(() => {
    if (!playing) {
      audioManager.sync(useEditor.getState().project, useEditor.getState().time, false);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const s = useEditor.getState();
      let next = s.time + dt;
      if (next >= s.project.duration) next = 0;
      s.setTime(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Ctrl+wheel zoom
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.002);
      const cur = useEditor.getState().previewScale;
      const next = Math.max(0.1, Math.min(4, cur * factor));
      useEditor.getState().setPreviewScale(Math.round(next * 100) / 100);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const fitToView = () => {
    const el = wrapRef.current;
    if (!el) return;
    const pad = 24;
    const s = Math.min(
      (el.clientWidth - pad) / project.width,
      (el.clientHeight - pad) / project.height
    );
    useEditor.getState().setPreviewScale(Math.max(0.05, Math.round(s * 100) / 100));
  };

  // Shape/text placement (only when a tool is active; the overlay is
  // pointer-events:none in that case so events land on the preview canvas).
  const clientToComp = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const bufPerCssX = canvas.width / rect.width;
    const bufPerCssY = canvas.height / rect.height;
    const bufX = (clientX - rect.left) * bufPerCssX;
    const bufY = (clientY - rect.top) * bufPerCssY;
    const compX = bufX / previewScale - project.width / 2;
    const compY = bufY / previewScale - project.height / 2;
    return { x: compX, y: compY };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (tool === 'select') return;
    e.preventDefault();
    const { x, y } = clientToComp(e.clientX, e.clientY);

    if (tool === 'text') {
      const layer = makeLayer('text');
      layer.props.position.value = { x, y };
      layer.outPoint = Math.min(project.duration, 5);
      useEditor.getState().addLayer(layer);
      return;
    }

    const layer = makeShapeLayer(tool as ShapeKind);
    layer.props.position.value = { x, y };
    layer.outPoint = Math.min(project.duration, 5);
    if (layer.shape) {
      layer.shape.w = 2;
      layer.shape.h = tool === 'line' ? 0 : 2;
    }
    useEditor.getState().addLayer(layer);
    drawRef.current = { startX: x, startY: y, layerId: layer.id };

    const onMove = (ev: MouseEvent) => {
      const d = drawRef.current;
      if (!d) return;
      const cur = clientToComp(ev.clientX, ev.clientY);
      const dx = cur.x - d.startX;
      const dy = cur.y - d.startY;
      useEditor.getState().updateLayer(d.layerId, l => {
        if (!l.shape) return;
        if (l.shape.kind === 'line') {
          const dist = Math.hypot(dx, dy);
          const angle = Math.atan2(dy, dx) * 180 / Math.PI;
          l.shape.w = Math.max(4, dist);
          l.props.position.value = { x: d.startX + dx / 2, y: d.startY + dy / 2 };
          if (l.props.rotation.keyframes.length === 0) l.props.rotation.value = angle;
        } else {
          const w = Math.max(4, Math.abs(dx));
          const h = Math.max(4, Math.abs(dy));
          l.shape.w = w;
          l.shape.h = l.shape.kind === 'ellipse' ? h
                    : l.shape.kind === 'polygon' || l.shape.kind === 'star' ? Math.min(w, h)
                    : h;
          l.props.position.value = { x: d.startX + dx / 2, y: d.startY + dy / 2 };
        }
      });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const d = drawRef.current;
      drawRef.current = null;
      if (!d) return;
      const cur = useEditor.getState().project.layers.find(l => l.id === d.layerId);
      if (cur && cur.shape && cur.shape.w < 8) {
        useEditor.getState().updateLayer(d.layerId, l => {
          if (!l.shape) return;
          if (l.shape.kind === 'line') l.shape.w = 300;
          else if (l.shape.kind === 'ellipse' || l.shape.kind === 'rect') {
            l.shape.w = 240; l.shape.h = 180;
          } else {
            l.shape.w = 240; l.shape.h = 240;
          }
        });
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const cursorClass = tool === 'select' ? 'cur-select' : 'cur-place';

  return (
    <section className="panel preview-panel">
      <div className="panel-head">
        <span>Preview</span>
        {tool !== 'select' && (
          <span className="tool-hint">
            {tool === 'text' ? 'click to place text' : 'click or drag to draw'}
          </span>
        )}
        <div className="spacer" />
        <span className="timecode">{time.toFixed(2)}s</span>
        <button className="btn sm" onClick={() => setPlaying(!playing)}>{playing ? '❚❚' : '▶'}</button>
        <button className="btn sm" onClick={fitToView} title="Fit to viewport">Fit</button>
        <button className="btn sm" onClick={() => setPreviewScale(1)} title="100%">1:1</button>
        <span className="zoom-pct">{Math.round(previewScale * 100)}%</span>
        <select
          className="btn sm"
          value={previewScale}
          onChange={e => setPreviewScale(parseFloat(e.target.value))}
        >
          <option value={0.25}>25%</option>
          <option value={0.5}>50%</option>
          <option value={0.75}>75%</option>
          <option value={1}>100%</option>
          <option value={2}>200%</option>
        </select>
      </div>
      <div className={'canvas-wrap ' + cursorClass} ref={wrapRef}>
        <div
          className="canvas-stack"
          style={{ aspectRatio: project.width + '/' + project.height }}
        >
          <canvas
            ref={canvasRef}
            className="preview-canvas"
            onMouseDown={handleMouseDown}
          />
          <canvas ref={overlayRef} className="overlay-canvas" />
        </div>
      </div>
    </section>
  );
}