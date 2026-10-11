import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { Renderer } from '../render/renderer';
import type { Project } from '../core/types';

export interface ExportSettings {
  scale: number;       // 1 = full project resolution
  fps: number;
  bitrateMbps: number;
  filename: string;
}

export const DEFAULT_SETTINGS: ExportSettings = {
  scale: 1,
  fps: 30,
  bitrateMbps: 16,
  filename: 'Untitled.mp4',
};

export interface ExportProgress {
  frame: number;
  totalFrames: number;
  stage: 'rendering' | 'encoding' | 'finalizing' | 'done';
}

async function prepareVideos(project: Project, time: number) {
  const mediaMap = (globalThis as any).__ml_media ?? {};
  const seeks: Promise<void>[] = [];

  for (const layer of project.layers) {
    if (layer.type !== 'video' || !layer.assetId) continue;
    const el = mediaMap[layer.assetId] as HTMLVideoElement | undefined;
    if (!el) continue;

    const localTime = Math.max(0, Math.min(el.duration || time, time - layer.inPoint));
    if (el.paused === false) el.pause();
    if (Math.abs(el.currentTime - localTime) < 0.001) continue;

    seeks.push(new Promise<void>(resolve => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(); } };
      el.addEventListener('seeked', done, { once: true });
      setTimeout(done, 400);
      try { el.currentTime = localTime; } catch { done(); }
    }));
  }

  await Promise.all(seeks);
}

function pickCodec(width: number, height: number): string {
  if (width <= 1920 && height <= 1080) return 'avc1.640028';
  if (width <= 2560 && height <= 1440) return 'avc1.640032';
  return 'avc1.640034';
}

export async function exportMp4(
  project: Project,
  settings: ExportSettings,
  onProgress: (p: ExportProgress) => void
): Promise<{ blob: Blob; filename: string }> {
  const width  = Math.round(project.width  * settings.scale);
  const height = Math.round(project.height * settings.scale);
  const fps = settings.fps;
  const duration = project.duration;
  const totalFrames = Math.max(1, Math.round(duration * fps));
  const bitrate = Math.round(settings.bitrateMbps * 1_000_000);
  const codec = pickCodec(width, height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const renderer = new Renderer(canvas);

  const support = await VideoEncoder.isConfigSupported({
    codec, width, height, bitrate, framerate: fps,
  });
  if (!support.supported) {
    throw new Error(`H.264 encoder unavailable at ${width}×${height}. Try a lower resolution.`);
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    fastStart: 'in-memory',
  });

  let encoderError: any = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { encoderError = e; },
  });

  encoder.configure({ codec, width, height, bitrate, framerate: fps, latencyMode: 'quality' });

  const dt = 1 / fps;

  for (let i = 0; i < totalFrames; i++) {
    if (encoderError) throw encoderError;
    const t = i * dt;

    await prepareVideos(project, t);
    renderer.render(project, { time: t, scale: settings.scale, clear: true, playing: false });

    const timestamp = Math.round(t * 1_000_000);
    let frame: VideoFrame;
    try {
      frame = new VideoFrame(canvas, { timestamp });
    } catch {
      await new Promise(r => setTimeout(r, 8));
      frame = new VideoFrame(canvas, { timestamp });
    }

    const keyFrame = i % (fps * 2) === 0;
    encoder.encode(frame, { keyFrame });
    frame.close();

    if (i % 4 === 0) await new Promise(r => setTimeout(r, 0));

    while (encoder.encodeQueueSize > 8) {
      await new Promise(r => setTimeout(r, 6));
      if (encoderError) throw encoderError;
    }

    onProgress({ frame: i + 1, totalFrames, stage: 'rendering' });
  }

  onProgress({ frame: totalFrames, totalFrames, stage: 'finalizing' });
  await encoder.flush();
  encoder.close();
  muxer.finalize();

  const buffer = (muxer.target as ArrayBufferTarget).buffer;
  const blob = new Blob([buffer], { type: 'video/mp4' });
  onProgress({ frame: totalFrames, totalFrames, stage: 'done' });

  return { blob, filename: settings.filename };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}