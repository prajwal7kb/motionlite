import { makeLayer } from './layer';
import { parseSRT, cuesToLayers } from './srt';
import type { Asset, Layer } from './types';

const DEFAULT_DURATION = 5;

/** Load an image/video element and register it in the global media cache. */
async function loadMedia(url: string, isVideo: boolean): Promise<HTMLVideoElement | HTMLImageElement> {
  const el: any = isVideo ? document.createElement('video') : new Image();
  el.src = url;
  if (isVideo) {
    el.muted = true;
    el.playsInline = true;
    el.preload = 'auto';
  }
  await new Promise<void>((resolve, reject) => {
    const ok = () => resolve();
    const fail = () => reject(new Error('Failed to load media'));
    if (isVideo) {
      el.onloadedmetadata = ok;
      el.onerror = fail;
    } else {
      el.onload = ok;
      el.onerror = fail;
    }
  });
  return el;
}

/**
 * Given an asset, produce one or more layers ready to insert into the project.
 * `atTime` is the playhead / drop time; ignored for SRT (uses embedded timestamps).
 */
export async function instantiateAsset(asset: Asset, atTime: number): Promise<Layer[]> {
  if (asset.kind === 'srt') {
    if (!asset.url) return [];
    const res = await fetch(asset.url);
    const text = await res.text();
    const cues = parseSRT(text);
    return cuesToLayers(cues, 380);
  }

  if (asset.kind === 'image' || asset.kind === 'video') {
    if (!asset.url) return [];
    const isVideo = asset.kind === 'video';
    const media = await loadMedia(asset.url, isVideo);

    (globalThis as any).__ml_media = (globalThis as any).__ml_media || {};
    (globalThis as any).__ml_media[asset.id] = media;

    const layer = makeLayer(asset.kind, asset.name);
    layer.assetId = asset.id;
    layer.inPoint = atTime;
    const dur = isVideo
      ? Math.min((media as HTMLVideoElement).duration || DEFAULT_DURATION, 300)
      : DEFAULT_DURATION;
    layer.outPoint = atTime + dur;
    return [layer];
  }

  if (asset.kind === 'audio') {
    if (!asset.url) return [];
    const el = new Audio();
    el.src = asset.url;
    el.preload = 'auto';
    await new Promise<void>(resolve => {
      el.onloadedmetadata = () => resolve();
      el.onerror = () => resolve();
      setTimeout(resolve, 1500);
    });

    (globalThis as any).__ml_audio = (globalThis as any).__ml_audio || {};
    (globalThis as any).__ml_audio[asset.id] = el;

    const layer = makeLayer('audio', asset.name);
    layer.assetId = asset.id;
    layer.inPoint = atTime;
    layer.outPoint = atTime + Math.min(el.duration || DEFAULT_DURATION, 300);
    return [layer];
  }

  return [];
}