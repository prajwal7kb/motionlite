import type { Vec2 } from '../core/types';

export type HandleId =
  | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
  | 'rotate';

export interface Bounds {
  x: number;   // local-space left (relative to origin)
  y: number;   // local-space top
  w: number;
  h: number;
}

export interface SnapLine {
  axis: 'x' | 'y';
  value: number;      // comp-space
  kind: 'center' | 'edge' | 'grid' | 'guide' | 'layer';
  label?: string;
}

export interface SnapContext {
  project: import('../core/types').Project;
  time: number;
  excludeLayerIds: string[];
  threshold: number;   // comp-space pixels
  gridEnabled: boolean;
  gridSize: number;
}

export type SnapProvider = (ctx: SnapContext) => SnapLine[];

export const HANDLE_SIZE = 9;       // screen px
export const HANDLE_HIT_PAD = 4;    // extra screen px for hit testing
export const ROTATE_OFFSET = 26;    // screen px above top edge
export const SNAP_THRESHOLD = 6;    // comp-space pixels