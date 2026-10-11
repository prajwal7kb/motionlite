import { uid } from './types';
import type { Project } from './types';
import { BUILTIN_PRESETS } from './presets';

export function newProject(name = 'Untitled'): Project {
  return {
    id: uid(), name, version: 1,
    fps: 30, width: 1920, height: 1080, duration: 60,
    bg: '#0e0e12',
    assets: [],
    layers: [],
    presets: [...BUILTIN_PRESETS],
  };
}

export function serialize(p: Project): string {
  return JSON.stringify(p, null, 2);
}

export function deserialize(json: string): Project {
  const p = JSON.parse(json) as Project;
  if (!p.presets) p.presets = [...BUILTIN_PRESETS];
  return p;
}