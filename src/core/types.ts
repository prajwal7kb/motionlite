export type Vec2 = { x: number; y: number };
export type Hex = string;

export type EasingKind = 'linear' | 'hold' | 'bezier';

export type TimeDisplayMode = 'timecode' | 'frames' | 'seconds';

export interface Keyframe<T = any> {
  id: string;
  time: number;
  value: T;
  easing: EasingKind;
  bezier?: [number, number, number, number];
}

export interface AnimatableProp<T = any> {
  value: T;
  keyframes: Keyframe<T>[];
  expression?: string;
  expressionOn?: boolean;
}

export type LayerType =
  | 'shape' | 'text' | 'image' | 'video' | 'audio'
  | 'solid' | 'group' | 'null' | 'adjustment';

export type ShapeKind = 'rect' | 'ellipse' | 'polygon' | 'star' | 'line';

export interface ShapeData {
  kind: ShapeKind;
  w: number; h: number;
  radius: number;
  sides: number;
  fill: Hex;
  fillOn: boolean;
  stroke: Hex;
  strokeOn: boolean;
  strokeWidth: number;
}

export interface TextData {
  content: string;
  fontFamily: string;
  fontSize: number;
  weight: number;
  align: 'left' | 'center' | 'right';
  tracking: number;
  leading: number;
  fill: Hex;
}

export interface Effect {
  id: string;
  type: 'blur' | 'glow' | 'dropShadow' | 'colorCorrect';
  enabled: boolean;
  params: Record<string, AnimatableProp>;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  parentId?: string;
  assetId?: string;
  locked: boolean;
  hidden: boolean;
  solo: boolean;
  blendMode: GlobalCompositeOperation;
  inPoint: number;
  outPoint: number;
  props: Record<string, AnimatableProp>;
  shape?: ShapeData;
  text?: TextData;
  effects: Effect[];
}

export interface Asset {
  id: string;
  name: string;
  kind: 'image' | 'video' | 'audio' | 'srt';
  path: string;
  url?: string;
  duration?: number;
  width?: number; height?: number;
}

export interface Preset {
  id: string;
  name: string;
  category: string;
  kind: 'layer' | 'effect' | 'text';
  payload: any;
}

export interface Project {
  id: string;
  name: string;
  version: 1;
  fps: number;
  width: number;
  height: number;
  duration: number;
  bg: Hex;
  assets: Asset[];
  layers: Layer[];
  presets: Preset[];
}

/** Locates a property inside a layer — used for keyframe references. */
export type PropertyPath =
  | { kind: 'prop'; propKey: string }
  | { kind: 'fx'; effectId: string; paramKey: string };

/** Reference to a single keyframe in the project. */
export interface KeyframeRef {
  layerId: string;
  path: PropertyPath;
  kfId: string;
}

/** Copied keyframe payload (time excluded — paste always lands at playhead). */
export interface KeyframeClipboard {
  value: any;
  easing: EasingKind;
  bezier?: [number, number, number, number];
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export const PROP_DEFAULTS: Record<string, any> = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
  opacity: 1,
  reveal: 1,
};