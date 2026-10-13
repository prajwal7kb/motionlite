import React, { useEffect, useState } from 'react';
import AssetsPanel from './panels/AssetsPanel';
import Preview from './panels/Preview';
import Timeline from './panels/Timeline';
import Inspector from './panels/Inspector';
import PresetsPanel from './panels/PresetsPanel';
import ExportDialog from './ExportDialog';
import NumberField from './widgets/NumberField';
import { useEditor } from '../state/store';
import { newProject, serialize, deserialize } from '../core/project';
import {
  exportMp4, downloadBlob,
  DEFAULT_SETTINGS,
  type ExportProgress, type ExportSettings,
} from '../export/exporter';
import type { ToolMode } from '../state/store';
import type { Layer, ShapeData, TimeDisplayMode } from '../core/types';

const TOOLS: { mode: ToolMode; label: string; title: string }[] = [
  { mode: 'select',  label: '↖', title: 'Select (V)' },
  { mode: 'text',    label: 'T', title: 'Text (T)' },
  { mode: 'rect',    label: '▭', title: 'Rectangle (R)' },
  { mode: 'ellipse', label: '◯', title: 'Ellipse (E)' },
  { mode: 'polygon', label: '⬡', title: 'Polygon' },
  { mode: 'star',    label: '★', title: 'Star' },
  { mode: 'line',    label: '╱', title: 'Line' },
];

const TIME_MODES: Array<{ value: TimeDisplayMode; label: string }> = [
  { value: 'timecode', label: 'Timecode' },
  { value: 'frames',   label: 'Frames' },
  { value: 'seconds',  label: 'Seconds' },
];

function ShapeContextBar({ layer }: { layer: Layer }) {
  const shape = layer.shape;
  if (!shape) return null;
  const upd = (fn: (s: ShapeData) => void) => {
    useEditor.getState().updateLayer(layer.id, l => { if (l.shape) fn(l.shape); });
  };
  const isLine = shape.kind === 'line';

  return (
    <div className="context-bar">
      <span className="ctx-label">Shape</span>
      {!isLine && (
        <div className="ctx-item">
          <label>Fill</label>
          <input type="checkbox" checked={shape.fillOn}
            onChange={e => upd(s => { s.fillOn = e.target.checked; })} />
          <input type="color" value={shape.fill}
            onChange={e => upd(s => { s.fill = e.target.value; })} />
        </div>
      )}
      <div className="ctx-item">
        <label>Stroke</label>
        <input type="checkbox" checked={shape.strokeOn}
          onChange={e => upd(s => { s.strokeOn = e.target.checked; })} />
        <input type="color" value={shape.stroke}
          onChange={e => upd(s => { s.stroke = e.target.value; })} />
        <NumberField value={shape.strokeWidth} min={0} scrubPerPixel={0.03}
          onChange={v => upd(s => { s.strokeWidth = v; })} style={{ width: 52 }} />
      </div>
      <div className="ctx-divider" />
      <div className="ctx-item">
        <label>W</label>
        <NumberField value={shape.w} scrubPerPixel={0.15}
          onChange={v => upd(s => { s.w = v; })} style={{ width: 62 }} />
      </div>
      {!isLine && (
        <div className="ctx-item">
          <label>H</label>
          <NumberField value={shape.h} scrubPerPixel={0.15}
            onChange={v => upd(s => { s.h = v; })} style={{ width: 62 }} />
        </div>
      )}
      {(shape.kind === 'polygon' || shape.kind === 'star') && (
        <div className="ctx-item">
          <label>Sides</label>
          <NumberField value={shape.sides} min={3} max={24} scrubPerPixel={0.02}
            onChange={v => upd(s => { s.sides = Math.round(v); })} style={{ width: 44 }} />
        </div>
      )}
      {shape.kind === 'rect' && (
        <div className="ctx-item">
          <label>Radius</label>
          <NumberField value={shape.radius} scrubPerPixel={0.1}
            onChange={v => upd(s => { s.radius = v; })} style={{ width: 62 }} />
        </div>
      )}
      {shape.kind === 'star' && (
        <div className="ctx-item">
          <label>Inner %</label>
          <NumberField value={shape.radius} min={5} max={95} scrubPerPixel={0.06}
            onChange={v => upd(s => { s.radius = v; })} style={{ width: 52 }} />
        </div>
      )}
    </div>
  );
}

export default function App() {
  const {
    undo, redo, setProject, project, tool, selectedLayerId,
    timeDisplayMode,
  } = useEditor();
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_SETTINGS);

  const selectedLayer = project.layers.find(l => l.id === selectedLayerId);
  const showShapeBar = !!(
    selectedLayer &&
    (selectedLayer.type === 'shape' || selectedLayer.type === 'solid') &&
    selectedLayer.shape
  );

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('input, textarea, select')) {
        const ae = document.activeElement as HTMLElement | null;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) {
          ae.blur();
        }
      }
    };
    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      const typing = !!ae && (
        ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable
      );
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && key === 'y') { e.preventDefault(); redo(); return; }

      if (mod && key === 's') {
        e.preventDefault();
        const blob = new Blob([serialize(project)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = project.name + '.mlite';
        a.click();
        return;
      }

      if (mod && !e.shiftKey && key === 'a' && !typing) {
        e.preventDefault();
        const s = useEditor.getState();
        const all = s.project.layers.map(l => l.id);
        useEditor.setState({
          selectedLayerIds: all,
          selectedLayerId: all[0] ?? null,
          selectedKeyframes: [],
        });
        return;
      }

      if (mod && e.shiftKey && key === 'a' && !typing) {
        e.preventDefault();
        useEditor.getState().clearSelection();
        return;
      }

      if (e.key === ' ' && !typing) {
        e.preventDefault();
        useEditor.getState().setPlaying(!useEditor.getState().playing);
        return;
      }

      // Delete key: keyframes take priority, then layers
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) {
        e.preventDefault();
        const s = useEditor.getState();
        if (s.selectedKeyframes.length > 0) {
          s.deleteSelectedKeyframes();
        } else {
          s.removeSelectedLayers();
        }
        return;
      }

      if (e.key === 'Escape') {
        useEditor.getState().setTool('select');
        useEditor.getState().clearSelection();
        return;
      }

      if (!typing && !mod) {
        if (key === 'v') useEditor.getState().setTool('select');
        if (key === 't') useEditor.getState().setTool('text');
        if (key === 'r') useEditor.getState().setTool('rect');
        if (key === 'e') useEditor.getState().setTool('ellipse');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [project, undo, redo]);

  const loadFile = async (f: File) => {
    const text = await f.text();
    setProject(deserialize(text), false);
  };

  const openExport = () => {
    setExportError(null);
    setSettings(s => ({
      ...s,
      filename: (project.name || 'Untitled') + '.mp4',
      fps: project.fps,
    }));
    setExportOpen(true);
  };

  const runExport = async () => {
    useEditor.getState().setPlaying(false);
    setExportError(null);
    setExporting({ frame: 0, totalFrames: 0, stage: 'rendering' });
    try {
      const result = await exportMp4(project, settings, p => setExporting(p));
      downloadBlob(result.blob, result.filename);
      setTimeout(() => { setExporting(null); setExportOpen(false); }, 700);
    } catch (err: any) {
      setExportError(String(err?.message ?? err));
      setExporting(null);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">MotionLite</span>
        <div className="tb-group">
          <label className="btn sm">
            Open
            <input type="file" accept=".mlite,application/json" hidden
              onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])} />
          </label>
          <button className="btn sm" onClick={() => setProject(newProject('Untitled'), false)}>New</button>
          <button className="btn sm" onClick={undo} title="Ctrl+Z">Undo</button>
          <button className="btn sm" onClick={redo} title="Ctrl+Y">Redo</button>
        </div>

        <div className="tb-divider" />

        <div className="tb-group tb-tools">
          {TOOLS.map(t => (
            <button key={t.mode}
              className={'tool-btn ' + (tool === t.mode ? 'active' : '')}
              title={t.title}
              onClick={() => useEditor.getState().setTool(t.mode)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="tb-divider" />

        <select className="btn sm" value={timeDisplayMode}
          onChange={e => useEditor.getState().setTimeDisplayMode(e.target.value as TimeDisplayMode)}
          title="Time display mode">
          {TIME_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        <div className="tb-divider" />

        <span className="proj-name">{project.name}</span>
        <span className="proj-dim">{project.width}×{project.height} · {project.fps}fps</span>

        <div className="spacer" />

        <button className="btn sm export-btn" onClick={openExport}>Export MP4</button>
      </header>

      {showShapeBar && selectedLayer && <ShapeContextBar layer={selectedLayer} />}

      <main className="grid">
        <AssetsPanel />
        <Preview />
        <Inspector />
        <PresetsPanel />
        <Timeline />
      </main>

      {exportOpen && (
        <ExportDialog
          projectName={project.name}
          projectWidth={project.width}
          projectHeight={project.height}
          projectFps={project.fps}
          settings={settings}
          onSettingsChange={setSettings}
          onExport={runExport}
          onCancel={() => !exporting && setExportOpen(false)}
          progress={exporting}
          error={exportError}
        />
      )}
    </div>
  );
}