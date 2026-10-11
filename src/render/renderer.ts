import { evalProp } from '../core/expression';
import { resolveTransform } from '../core/layer';
import type { Layer, Project, ShapeData, TextData } from '../core/types';
import { effectFilter } from './effects';

export interface RenderOptions {
  time: number;
  scale?: number;
  clear?: boolean;
  playing?: boolean;
}

function syncVideo(el: HTMLVideoElement, targetTime: number, playing: boolean) {
  const dur = el.duration || targetTime;
  const t = Math.max(0, Math.min(dur, targetTime));
  if (playing) {
    if (el.paused) el.play().catch(() => {});
  } else {
    if (!el.paused) el.pause();
    if (Math.abs(el.currentTime - t) > 0.05) {
      try { el.currentTime = t; } catch { /* not seekable yet */ }
    }
  }
}

export class Renderer {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas2D unavailable');
    this.ctx = ctx;
    this.canvas = canvas;
  }

  render(project: Project, opts: RenderOptions) {
    const { ctx } = this;
    const { width, height } = project;
    const t = opts.time;
    const scale = opts.scale ?? 1;
    const playing = opts.playing ?? false;

    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (opts.clear !== false) {
      ctx.fillStyle = project.bg;
      ctx.fillRect(0, 0, width, height);
    }

    ctx.translate(width / 2, height / 2);

    const byId = new Map(project.layers.map(l => [l.id, l]));
    const anySolo = project.layers.some(l => l.solo);
    for (let i = project.layers.length - 1; i >= 0; i--) {
      const layer = project.layers[i];
      if (layer.hidden) continue;
      if (anySolo && !layer.solo) continue;
      if (t < layer.inPoint || t > layer.outPoint) continue;
      if (layer.type === 'audio' || layer.type === 'null' || layer.type === 'group') continue;
      this.drawLayer(layer, byId, project, t, playing);
    }

    ctx.restore();
  }

  private drawLayer(
    layer: Layer,
    byId: Map<string, Layer>,
    project: Project,
    time: number,
    playing: boolean
  ) {
    const { ctx } = this;
    const evalCtx = { time, layer, comp: project };
    const ev = (p: any) => evalProp(p, evalCtx);

    const { pos, rot, scl } = resolveTransform(layer, byId, ev);
    const anchor = ev(layer.props.anchor) as { x: number; y: number };
    const opacity = ev(layer.props.opacity) as number;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
    ctx.globalCompositeOperation = layer.blendMode ?? 'source-over';

    const filter = effectFilter(layer.effects, evalCtx);
    ctx.filter = filter || 'none';

    ctx.translate(pos.x, pos.y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(scl.x, scl.y);
    ctx.translate(-anchor.x, -anchor.y);

    switch (layer.type) {
      case 'shape':
      case 'solid':
        if (layer.shape) this.drawShape(layer.shape);
        break;
      case 'text': {
        const revealProp = layer.props.reveal ?? { value: 1, keyframes: [] };
        const reveal = Math.max(0, Math.min(1, ev(revealProp) as number));
        if (layer.text) this.drawText(layer.text, reveal);
        break;
      }
      case 'image':
      case 'video': {
        const media = (globalThis as any).__ml_media?.[layer.assetId ?? ''];
        if (media) {
          if (layer.type === 'video') {
            syncVideo(media as HTMLVideoElement, time - layer.inPoint, playing);
          }
          const w = (media.videoWidth || media.naturalWidth || 0);
          const h = (media.videoHeight || media.naturalHeight || 0);
          if (w > 0 && h > 0) {
            try {
              ctx.drawImage(media, -w / 2, -h / 2, w, h);
            } catch { /* video frame not ready */ }
          }
        }
        break;
      }
    }

    ctx.restore();
  }

  private traceShapePath(s: ShapeData) {
    const { ctx } = this;
    ctx.beginPath();
    switch (s.kind) {
      case 'line': {
        const half = Math.max(0.5, s.w / 2);
        ctx.moveTo(-half, 0);
        ctx.lineTo( half, 0);
        break;
      }
      case 'ellipse':
        ctx.ellipse(0, 0, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
        break;
      case 'polygon': {
        // A polygon with `sides` values renders exactly `sides` vertices.
        const n = Math.max(3, s.sides | 0);
        const R = Math.min(s.w, s.h) / 2;
        for (let i = 0; i < n; i++) {
          const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
          const x = Math.cos(ang) * R;
          const y = Math.sin(ang) * R;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        break;
      }
      case 'star': {
        // A star alternates outer/inner radii → 2 × sides vertices.
        const n = Math.max(3, s.sides | 0);
        const R = Math.min(s.w, s.h) / 2;
        const r = R * Math.max(0.05, Math.min(0.95, s.radius / 100));
        for (let i = 0; i < n * 2; i++) {
          const ang = (Math.PI * i) / n - Math.PI / 2;
          const rad = i % 2 === 0 ? R : r;
          const x = Math.cos(ang) * rad;
          const y = Math.sin(ang) * rad;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        break;
      }
      default: {
        const w = s.w, h = s.h, r = Math.min(s.radius, w / 2, h / 2);
        const x = -w / 2, y = -h / 2;
        if (r <= 0.5) { ctx.rect(x, y, w, h); break; }
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      }
    }
  }

  private drawShape(s: ShapeData) {
    const { ctx } = this;
    const isLine = s.kind === 'line';
    if (s.fillOn && !isLine) {
      this.traceShapePath(s);
      ctx.fillStyle = s.fill;
      ctx.fill();
    }
    const wantStroke = isLine
      ? (s.strokeOn || s.strokeWidth > 0)
      : (s.strokeOn && s.strokeWidth > 0);
    if (wantStroke) {
      this.traceShapePath(s);
      ctx.lineWidth = Math.max(1, s.strokeWidth || 3);
      ctx.strokeStyle = s.stroke;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  private drawText(t: TextData, reveal: number) {
    const { ctx } = this;
    ctx.font = t.weight + ' ' + t.fontSize + 'px ' + t.fontFamily;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = t.fill;

    const lines = t.content.split('\n');
    const lineH = t.fontSize * t.leading;
    const totalH = lineH * lines.length;
    const startY = -totalH / 2 + lineH / 2;

    const totalChars = lines.reduce((a, l) => a + l.length, 0);
    const visible = Math.floor(totalChars * reveal);

    let drawn = 0;
    for (let li = 0; li < lines.length; li++) {
      if (drawn >= visible) return;
      const line = lines[li];
      const y = startY + li * lineH;

      let lineW = 0;
      for (const ch of line) lineW += ctx.measureText(ch).width;
      lineW += t.tracking * Math.max(0, line.length - 1);

      let cx = t.align === 'center' ? -lineW / 2
             : t.align === 'right'  ? -lineW
             : 0;

      for (const ch of line) {
        if (drawn >= visible) return;
        ctx.fillText(ch, cx, y);
        cx += ctx.measureText(ch).width + t.tracking;
        drawn++;
      }
    }
  }
}