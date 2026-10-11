import { DEFAULT_TEXT, makeLayer } from './layer';
import type { Layer } from './types';

const timeToSec = (s: string) => {
  const m = s.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
};

export interface Cue { start: number; end: number; text: string; }

export function parseSRT(src: string): Cue[] {
  const blocks = src.replace(/\r/g, '').split(/\n\n+/);
  const cues: Cue[] = [];
  for (const b of blocks) {
    const lines = b.split('\n').filter(Boolean);
    if (lines.length < 2) continue;
    const tl = lines.find(l => l.includes('-->'));
    if (!tl) continue;
    const [a, bb] = tl.split('-->');
    const text = lines.slice(lines.indexOf(tl) + 1).join('\n').trim();
    if (text) cues.push({ start: timeToSec(a), end: timeToSec(bb), text });
  }
  return cues;
}

/**
 * Extend each cue's end to just before the next cue's start, as long as the
 * gap is under `maxGap` seconds. Gaps beyond that are treated as intentional
 * scene breaks and preserved.
 *
 * Default maxGap is deliberately generous (5s) because subtitle cue timing
 * usually has artificial pauses that look worse than continuous display.
 */
export function closeGaps(cues: Cue[], maxGap = 5.0, pad = 0.05): Cue[] {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].start - sorted[i].end;
    if (gap > pad && gap < maxGap) {
      sorted[i].end = sorted[i + 1].start - pad;
    }
  }
  return sorted;
}

export function cuesToLayers(cues: Cue[], yOffset = 0): Layer[] {
  const merged = closeGaps(cues);
  return merged.map((c, i) => {
    const l = makeLayer('text', 'Caption ' + (i + 1));
    l.text = { ...DEFAULT_TEXT, content: c.text, fontSize: 48 };
    l.inPoint = c.start;
    l.outPoint = c.end;
    l.props.position = { value: { x: 0, y: yOffset }, keyframes: [] };
    return l;
  });
}