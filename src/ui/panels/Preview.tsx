import React, { useEffect, useRef, useState } from 'react';
import { useEditor } from '../../state/store';
import { Renderer } from '../../render/renderer';
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
  const rendererRef = useRef<Renderer | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<DrawState | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const { project, time, previewScale, playing, tool, setPlaying, setPreviewScale } = useEditor();

  useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      rendererRef.current = new Renderer(canvasRef.current);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const r = rendererRef.current;
    if (!canvas || !r) return;
    const w = Math.round(project.width * previewScale);
    const h = Math.round(project.height * previewScale);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    r.render(project, { time, scale: previewScale, playing });
    audioManager.sync(project, time, playing);
  }, [project, time, previewScale, playing]);

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
    const availW = el.clientWidth - pad;
    const availH = el.clientHeight - pad;
    const s = Math.min(availW / project.width, availH / project.height);
    useEditor.getState().setPreviewScale(Math.max(0.05, Math.round(s * 100) / 100));
  };

  /**
   * Convert a screen (client) point to comp-space coordinates.
   *
   * Three coordinate spaces are involved:
   *   1. Client pixels (what mousemove gives us)
   *   2. Canvas buffer pixels (canvas.width/height)
   *   3. Composition pixels (project.width/height)
   *
   * CSS may scale the canvas down to fit the panel, so client→buffer is not
   * 1:1. We compute the true ratio from the DOM rect.
   */
  const clientToComp = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const bufPerCssX = canvas.width / rect.width;
    const bufPerCssY = canvas.height / rect.height;
    const bufX = (clientX - rect.left) * bufPerCssX;
    const bufY = (clientY - rect.top) * bufPerCssY;
    // Buffer pixels → comp pixels (buffer is already at previewScale)
    const compX = bufX / previewScale;
    const compY = bufY / previewScale;
    return { x: compX - project.width / 2, y: compY - project.height / 2 };
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
      // Tool stays active for multiple placements
      return;
    }

    // Shape tools: create a tiny layer at the click point, drag to size.
    const layer = makeShapeLayer(tool as ShapeKind);
    layer.props.position.value = { x, y };
    layer.outPoint = Math.min(project.duration, 5);
    if (layer.shape) {
      layer.shape.w = 2;
      layer.shape.h = tool === 'line' ? 0 : 2;
    }
    useEditor.getState().addLayer(layer);
    drawRef.current = { startX: x, startY: y, layerId: layer.id };
    setIsDrawing(true);

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
          l.props.position.value = {
            x: d.startX + dx / 2,
            y: d.startY + dy / 2,
          };
          if (l.props.rotation.keyframes.length === 0) {
            l.props.rotation.value = angle;
          }
        } else {
          // Shapes are anchored at the drag midpoint (renderer draws centered)
          const w = Math.max(4, Math.abs(dx));
          const h = Math.max(4, Math.abs(dy));
          l.shape.w = w;
          l.shape.h = l.shape.kind === 'ellipse' ? h
                    : l.shape.kind === 'polygon' || l.shape.kind === 'star' ? Math.min(w, h)
                    : h;
          l.props.position.value = {
            x: d.startX + dx / 2,
            y: d.startY + dy / 2,
          };
        }
      });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const d = drawRef.current;
      drawRef.current = null;
      setIsDrawing(false);
      if (!d) return;

      // If the user barely dragged, fall back to the kind's default size.
      const cur = useEditor.getState().project.layers.find(l => l.id === d.layerId);
      if (cur && cur.shape && cur.shape.w < 8) {
        const defW = 240;
        const defH = 180;
        useEditor.getState().updateLayer(d.layerId, l => {
          if (!l.shape) return;
          if (l.shape.kind === 'line') {
            l.shape.w = 300;
          } else if (l.shape.kind === 'ellipse' || l.shape.kind === 'rect') {
            l.shape.w = defW;
            l.shape.h = defH;
          } else {
            l.shape.w = defW;
            l.shape.h = defW;
          }
        });
      }
      // No auto-deselect — the tool stays armed for successive shapes.
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
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
          }}
        />
      </div>
    </section>
  );
}