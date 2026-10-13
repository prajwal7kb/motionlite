import { create } from 'zustand';
import { newProject } from '../core/project';
import { instantiateAsset } from '../core/assets';
import { cloneKeyframePayload, getPropByPath } from '../core/prop';
import type {
  KeyframeClipboard,
  KeyframeRef,
  Layer,
  Preset,
  Project,
  PropertyPath,
  TimeDisplayMode,
} from '../core/types';
import { uid } from '../core/types';
import { pushHistory, redo as hRedo, undo as hUndo, type History } from './history';

export type ToolMode =
  | 'select' | 'text' | 'rect' | 'ellipse' | 'polygon' | 'star' | 'line';

const kfRefsEqual = (a: KeyframeRef, b: KeyframeRef) =>
  a.layerId === b.layerId &&
  a.kfId === b.kfId &&
  a.path.kind === b.path.kind &&
  (a.path.kind === 'prop' && b.path.kind === 'prop'
    ? a.path.propKey === b.path.propKey
    : a.path.kind === 'fx' && b.path.kind === 'fx'
      ? a.path.effectId === b.path.effectId && a.path.paramKey === b.path.paramKey
      : false);

interface EditorState {
  project: Project;
  history: History;
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  selectedPropKey: string | null;
  selectedKeyframes: KeyframeRef[];
  time: number;
  playing: boolean;
  previewScale: number;
  tool: ToolMode;
  filePath: string | null;
  timeDisplayMode: TimeDisplayMode;
  keyframeClipboard: KeyframeClipboard | null;

  setProject: (p: Project, record?: boolean) => void;
  commit: () => void;
  undo: () => void;
  redo: () => void;

  addLayer: (l: Layer) => void;
  updateLayer: (id: string, fn: (l: Layer) => void) => void;
  removeLayer: (id: string) => void;
  removeSelectedLayers: () => void;

  select: (id: string | null, propKey?: string | null) => void;
  selectWithModifiers: (id: string, shift: boolean, ctrl: boolean) => void;
  selectLayers: (ids: string[], mode?: 'replace' | 'add') => void;
  clearSelection: () => void;

  selectKeyframe: (ref: KeyframeRef | null) => void;
  setSelectedKeyframes: (refs: KeyframeRef[]) => void;
  addKeyframesToSelection: (refs: KeyframeRef[]) => void;
  removeKeyframeFromSelection: (ref: KeyframeRef) => void;
  clearKeyframeSelection: () => void;
  deleteSelectedKeyframes: () => void;

  copyKeyframe: (ref: KeyframeRef) => void;
  pasteKeyframe: (layerId: string, path: PropertyPath) => void;

  setTool: (t: ToolMode) => void;
  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setPreviewScale: (s: number) => void;
  setTimeDisplayMode: (m: TimeDisplayMode) => void;
  addPreset: (p: Preset) => void;
  setFilePath: (p: string | null) => void;

  removeAsset: (id: string) => void;
  dropAssetAt: (assetId: string, time: number) => Promise<void>;
}

export const useEditor = create<EditorState>((set, get) => ({
  project: newProject(),
  history: { past: [], future: [] },
  selectedLayerId: null,
  selectedLayerIds: [],
  selectedPropKey: null,
  selectedKeyframes: [],
  time: 0,
  playing: false,
  previewScale: 0.5,
  tool: 'select',
  filePath: null,
  timeDisplayMode: 'timecode',
  keyframeClipboard: null,

  setProject: (p, record = false) =>
    set(s => ({
      project: p,
      history: record ? pushHistory(s.history, s.project) : s.history,
    })),

  commit: () => set(s => ({ history: pushHistory(s.history, s.project) })),

  undo: () => set(s => {
    const r = hUndo(s.history, s.project);
    return r
      ? { project: r.project, history: r.history, selectedLayerId: null,
          selectedLayerIds: [], selectedKeyframes: [] }
      : s;
  }),

  redo: () => set(s => {
    const r = hRedo(s.history, s.project);
    return r
      ? { project: r.project, history: r.history, selectedLayerId: null,
          selectedLayerIds: [], selectedKeyframes: [] }
      : s;
  }),

  addLayer: (l) => {
    get().commit();
    set(s => ({
      project: { ...s.project, layers: [l, ...s.project.layers] },
      selectedLayerId: l.id,
      selectedLayerIds: [l.id],
      selectedKeyframes: [],
    }));
  },

  updateLayer: (id, fn) => set(s => {
    const layers = s.project.layers.map(l => {
      if (l.id !== id) return l;
      const copy: Layer = JSON.parse(JSON.stringify(l));
      fn(copy);
      return copy;
    });
    return { project: { ...s.project, layers } };
  }),

  removeLayer: (id) => {
    get().commit();
    set(s => {
      const ids = s.selectedLayerIds.filter(x => x !== id);
      return {
        project: { ...s.project, layers: s.project.layers.filter(l => l.id !== id) },
        selectedLayerIds: ids,
        selectedLayerId: s.selectedLayerId === id ? (ids[0] ?? null) : s.selectedLayerId,
        selectedKeyframes: s.selectedKeyframes.filter(r => r.layerId !== id),
      };
    });
  },

  removeSelectedLayers: () => {
    const { selectedLayerIds } = get();
    if (selectedLayerIds.length === 0) return;
    get().commit();
    set(s => ({
      project: {
        ...s.project,
        layers: s.project.layers.filter(l => !s.selectedLayerIds.includes(l.id)),
      },
      selectedLayerId: null,
      selectedLayerIds: [],
      selectedKeyframes: [],
    }));
  },

  select: (id, propKey = null) =>
    set({
      selectedLayerId: id,
      selectedLayerIds: id ? [id] : [],
      selectedPropKey: propKey,
      selectedKeyframes: [],
    }),

  selectWithModifiers: (id, shift, ctrl) => set(s => {
    if (shift && s.selectedLayerId) {
      const a = s.project.layers.findIndex(l => l.id === s.selectedLayerId);
      const b = s.project.layers.findIndex(l => l.id === id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const ids = s.project.layers.slice(lo, hi + 1).map(l => l.id);
        return { selectedLayerIds: ids, selectedLayerId: id };
      }
    }
    if (ctrl || shift) {
      const has = s.selectedLayerIds.includes(id);
      const next = has
        ? s.selectedLayerIds.filter(x => x !== id)
        : [...s.selectedLayerIds, id];
      return { selectedLayerIds: next, selectedLayerId: next.length ? id : null };
    }
    return { selectedLayerId: id, selectedLayerIds: [id], selectedKeyframes: [] };
  }),

  selectLayers: (ids, mode = 'replace') => set(s => {
    if (mode === 'add') {
      const merged = Array.from(new Set([...s.selectedLayerIds, ...ids]));
      return {
        selectedLayerIds: merged,
        selectedLayerId: merged[merged.length - 1] ?? null,
      };
    }
    return {
      selectedLayerIds: ids,
      selectedLayerId: ids[ids.length - 1] ?? null,
      selectedKeyframes: [],
    };
  }),

  clearSelection: () =>
    set({ selectedLayerId: null, selectedLayerIds: [], selectedKeyframes: [] }),

  selectKeyframe: (ref) => {
    if (ref) {
      set({
        selectedKeyframes: [ref],
        selectedLayerId: ref.layerId,
        selectedLayerIds: [ref.layerId],
      });
    } else {
      set({ selectedKeyframes: [] });
    }
  },

  setSelectedKeyframes: (refs) => set(s => ({
    selectedKeyframes: refs,
    selectedLayerId: refs.length ? refs[refs.length - 1].layerId : s.selectedLayerId,
    selectedLayerIds: refs.length ? [refs[refs.length - 1].layerId] : s.selectedLayerIds,
  })),

  addKeyframesToSelection: (refs) => set(s => {
    const merged = [...s.selectedKeyframes];
    for (const r of refs) {
      if (!merged.some(x => kfRefsEqual(x, r))) merged.push(r);
    }
    return {
      selectedKeyframes: merged,
      selectedLayerId: merged[merged.length - 1]?.layerId ?? s.selectedLayerId,
      selectedLayerIds: merged.length ? [merged[merged.length - 1].layerId] : s.selectedLayerIds,
    };
  }),

  removeKeyframeFromSelection: (ref) => set(s => ({
    selectedKeyframes: s.selectedKeyframes.filter(r => !kfRefsEqual(r, ref)),
  })),

  clearKeyframeSelection: () => set({ selectedKeyframes: [] }),

  deleteSelectedKeyframes: () => {
    const refs = get().selectedKeyframes;
    if (refs.length === 0) return;
    get().commit();
    const update = get().updateLayer;
    const byLayer = new Map<string, KeyframeRef[]>();
    for (const r of refs) {
      if (!byLayer.has(r.layerId)) byLayer.set(r.layerId, []);
      byLayer.get(r.layerId)!.push(r);
    }
    for (const [layerId, list] of byLayer) {
      update(layerId, l => {
        for (const r of list) {
          const prop = getPropByPath(l, r.path);
          if (prop) prop.keyframes = prop.keyframes.filter(k => k.id !== r.kfId);
        }
      });
    }
    set({ selectedKeyframes: [] });
  },

  copyKeyframe: (ref) => {
    const s = get();
    const layer = s.project.layers.find(l => l.id === ref.layerId);
    if (!layer) return;
    const prop = getPropByPath(layer, ref.path);
    if (!prop) return;
    const kf = prop.keyframes.find(k => k.id === ref.kfId);
    if (!kf) return;
    set({ keyframeClipboard: cloneKeyframePayload(kf) });
  },

  pasteKeyframe: (layerId, path) => {
    const s = get();
    const clip = s.keyframeClipboard;
    if (!clip) return;
    s.commit();
    set(state => {
      const layers = state.project.layers.map(l => {
        if (l.id !== layerId) return l;
        const copy: Layer = JSON.parse(JSON.stringify(l));
        const prop = getPropByPath(copy, path);
        if (!prop) return copy;
        const value = JSON.parse(JSON.stringify(clip.value));
        const existing = prop.keyframes.find(k => Math.abs(k.time - state.time) < 1e-4);
        if (existing) {
          existing.value = value;
          existing.easing = clip.easing;
          existing.bezier = clip.bezier ? [...clip.bezier] : undefined;
        } else {
          prop.keyframes.push({
            id: uid(),
            time: state.time,
            value,
            easing: clip.easing,
            bezier: clip.bezier ? [...clip.bezier] : undefined,
          });
          prop.keyframes.sort((a, b) => a.time - b.time);
        }
        return copy;
      });
      return { project: { ...state.project, layers } };
    });
  },

  setTool: (t) => set({ tool: t }),
  setTime: (t) => set(s => ({ time: Math.max(0, Math.min(s.project.duration, t)) })),
  setPlaying: (playing) => set({ playing }),
  setPreviewScale: (previewScale) => set({ previewScale }),
  setTimeDisplayMode: (timeDisplayMode) => set({ timeDisplayMode }),
  addPreset: (p) => set(s => ({ project: { ...s.project, presets: [p, ...s.project.presets] } })),
  setFilePath: (filePath) => set({ filePath }),

  removeAsset: (id) => {
    set(s => ({
      project: { ...s.project, assets: s.project.assets.filter(a => a.id !== id) },
    }));
  },

  dropAssetAt: async (assetId, time) => {
    const s = get();
    const asset = s.project.assets.find(a => a.id === assetId);
    if (!asset) return;
    s.commit();
    const layers = await instantiateAsset(asset, time);
    if (layers.length === 0) return;
    const next = [...s.project.layers];
    for (let i = layers.length - 1; i >= 0; i--) next.unshift(layers[i]);
    set({
      project: { ...s.project, layers: next },
      selectedLayerId: layers[0].id,
      selectedLayerIds: [layers[0].id],
      selectedKeyframes: [],
    });
  },
}));