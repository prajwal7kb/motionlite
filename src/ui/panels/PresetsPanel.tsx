import React, { useState } from 'react';
import { useEditor } from '../../state/store';
import { applyLayerPreset } from '../../core/presets';

export default function PresetsPanel() {
  const { project, selectedLayerId } = useEditor();
  const [q, setQ] = useState('');
  const cats = Array.from(new Set(project.presets.map(p => p.category)));
  const filtered = project.presets.filter(p =>
    p.name.toLowerCase().includes(q.toLowerCase())
  );

  const apply = (presetId: string) => {
    const preset = project.presets.find(p => p.id === presetId);
    if (!preset || !selectedLayerId) return;
    useEditor.getState().commit();
    useEditor.getState().updateLayer(selectedLayerId, l => {
      const next = applyLayerPreset(l, preset);
      Object.assign(l, next);
    });
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(project.presets, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'motionlite-presets.json';
    a.click();
  };

  const importJSON = async (f: File) => {
    const arr = JSON.parse(await f.text());
    useEditor.getState().setProject({
      ...project,
      presets: [...arr, ...project.presets],
    });
  };

  return (
    <section className="panel presets-panel">
      <div className="panel-head">
        <span>Presets</span>
        <div className="spacer" />
        <button className="btn sm" onClick={exportJSON}>Export</button>
        <label className="btn sm">
          Import
          <input
            type="file"
            accept="application/json"
            hidden
            onChange={e => e.target.files?.[0] && importJSON(e.target.files[0])}
          />
        </label>
      </div>
      <input
        className="search"
        placeholder="Search presets…"
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      <div className="preset-list">
        {cats.map(cat => {
          const items = filtered.filter(p => p.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat}>
              <div className="cat-title">{cat}</div>
              {items.map(p => (
                <div
                  key={p.id}
                  className="preset"
                  onDoubleClick={() => apply(p.id)}
                  title="Double-click to apply to selected layer"
                >
                  <span className="dot" data-k={p.kind} />
                  {p.name}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}