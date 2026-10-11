import type { Project } from './types';

/**
 * Playback manager for audio layers. Syncs every audio element's currentTime
 * and play/pause state to the composition state. Called once per frame from
 * the preview render loop.
 */
class AudioManager {
  private els: Map<string, HTMLAudioElement> = new Map();

  private resolve(assetId: string): HTMLAudioElement | null {
    let el = this.els.get(assetId) ?? null;
    if (el) return el;
    const media = (globalThis as any).__ml_audio?.[assetId];
    if (media instanceof HTMLAudioElement) {
      this.els.set(assetId, media);
      return media;
    }
    return null;
  }

  sync(project: Project, time: number, playing: boolean) {
    const seen = new Set<string>();
    for (const layer of project.layers) {
      if (layer.type !== 'audio' || !layer.assetId) continue;
      seen.add(layer.assetId);

      const el = this.resolve(layer.assetId);
      if (!el) continue;

      const active = time >= layer.inPoint && time <= layer.outPoint;
      const localTime = time - layer.inPoint;

      if (!active) {
        if (!el.paused) el.pause();
        continue;
      }

      const target = Math.max(0, Math.min(el.duration || localTime, localTime));

      if (playing) {
        // If we've drifted more than 150ms, hard-seek
        if (Math.abs(el.currentTime - target) > 0.15) {
          try { el.currentTime = target; } catch { /* not ready */ }
        }
        if (el.paused) {
          const p = el.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        }
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - target) > 0.03) {
          try { el.currentTime = target; } catch { /* not ready */ }
        }
      }
    }

    // Pause any audio not referenced by an active layer
    for (const [assetId, el] of this.els) {
      if (!seen.has(assetId) && !el.paused) el.pause();
    }
  }

  stopAll() {
    for (const el of this.els.values()) {
      if (!el.paused) el.pause();
    }
  }
}

export const audioManager = new AudioManager();