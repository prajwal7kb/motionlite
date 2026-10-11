import { create } from 'zustand';
import { newProject } from '../core/project';
import { instantiateAsset } from '../core/assets';
import type { Layer, Preset, Project } from '../core/types';
import { pushHistory, redo as hRedo, undo as hUndo, type History } from './history';

export type ToolMode =
  | 'select'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'polygon'
  | 'star'
  | 'line';

interface EditorState {
  project: Project;
  history: History;
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  selectedPropKey: string | null;
  time: number;
  playing: boolean;
  previewScale: number;
  tool: ToolMode;
  filePath: string | null;

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
  clearSelection: () => void;

  setTool: (t: ToolMode) => void;
  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setPreviewScale: (s: number) => void;
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
  time: 0,
  playing: false,
  previewScale: 0.5,
  tool: 'select',
  filePath: null,

  setProject: (p, record = false) =>
    set(s => ({
      project: p,
      history: record ? pushHistory(s.history, s.project) : s.history,
    })),

  commit: () => set(s => ({ history: pushHistory(s.history, s.project) })),

  undo: () => set(s => {
    const r = hUndo(s.history, s.project);
    return r
      ? { project: r.project, history: r.history, selectedLayerId: null, selectedLayerIds: [] }
      : s;
  }),

  redo: () => set(s => {
    const r = hRedo(s.history, s.project);
    return r
      ? { project: r.project, history: r.history, selectedLayerId: null, selectedLayerIds: [] }
      : s;
  }),

  addLayer: (l) => {
    get().commit();
    set(s => ({
      project: { ...s.project, layers: [l, ...s.project.layers] },
      selectedLayerId: l.id,
      selectedLayerIds: [l.id],
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
    }));
  },

  select: (id, propKey = null) =>
    set({ selectedLayerId: id, selectedLayerIds: id ? [id] : [], selectedPropKey: propKey }),

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
      const next = has ? s.selectedLayerIds.filter(x => x !== id) : [...s.selectedLayerIds, id];
      return { selectedLayerIds: next, selectedLayerId: next.length ? id : null };
    }
    return { selectedLayerId: id, selectedLayerIds: [id] };
  }),

  clearSelection: () => set({ selectedLayerId: null, selectedLayerIds: [] }),

  setTool: (t) => set({ tool: t }),
  setTime: (t) => set(s => ({ time: Math.max(0, Math.min(s.project.duration, t)) })),
  setPlaying: (playing) => set({ playing }),
  setPreviewScale: (previewScale) => set({ previewScale }),
  addPreset: (p) => set(s => ({ project: { ...s.project, presets: [p, ...s.project.presets] } })),
  setFilePath: (filePath) => set({ filePath }),

  removeAsset: (id) => {
    set(s => ({
      project: {
        ...s.project,
        assets: s.project.assets.filter(a => a.id !== id),
      },
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
    });
  },
}));