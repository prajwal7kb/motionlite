import React from 'react';
import type { ExportSettings, ExportProgress } from '../export/exporter';

interface Props {
  projectName: string;
  projectWidth: number;
  projectHeight: number;
  projectFps: number;
  settings: ExportSettings;
  onSettingsChange: (s: ExportSettings) => void;
  onExport: () => void;
  onCancel: () => void;
  progress: ExportProgress | null;
  error: string | null;
}

export default function ExportDialog({
  projectName, projectWidth, projectHeight, projectFps,
  settings, onSettingsChange, onExport, onCancel, progress, error,
}: Props) {
  const busy = !!progress;
  const pct = progress && progress.totalFrames > 0
    ? Math.round((progress.frame / progress.totalFrames) * 100)
    : 0;

  const resolutions = [
    { value: 0.25, label: '25%' },
    { value: 0.5,  label: '50%' },
    { value: 0.75, label: '75%' },
    { value: 1,    label: '100%' },
  ];

  const bitrates = [
    { value: 6,  label: 'Standard (6 Mbps)' },
    { value: 10, label: 'High (10 Mbps)' },
    { value: 16, label: 'Very High (16 Mbps)' },
    { value: 30, label: 'Maximum (30 Mbps)' },
  ];

  const outW = Math.round(projectWidth * settings.scale);
  const outH = Math.round(projectHeight * settings.scale);

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span>Export MP4</span>
          <div className="spacer" />
          <button className="btn sm" onClick={onCancel} disabled={busy}>×</button>
        </div>

        <div className="modal-body">
          <div className="row">
            <label>Filename</label>
            <input
              value={settings.filename}
              onChange={e => onSettingsChange({ ...settings, filename: e.target.value })}
              disabled={busy}
            />
          </div>

          <div className="row">
            <label>Resolution</label>
            <select
              value={settings.scale}
              onChange={e => onSettingsChange({ ...settings, scale: parseFloat(e.target.value) })}
              disabled={busy}
            >
              {resolutions.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <span className="dim">{outW}×{outH}</span>
          </div>

          <div className="row">
            <label>Frame Rate</label>
            <select
              value={settings.fps}
              onChange={e => onSettingsChange({ ...settings, fps: parseInt(e.target.value) })}
              disabled={busy}
            >
              <option value={24}>24 fps</option>
              <option value={30}>30 fps</option>
              <option value={60}>60 fps</option>
            </select>
            <span className="dim">project: {projectFps}</span>
          </div>

          <div className="row">
            <label>Quality</label>
            <select
              value={settings.bitrateMbps}
              onChange={e => onSettingsChange({ ...settings, bitrateMbps: parseInt(e.target.value) })}
              disabled={busy}
            >
              {bitrates.map(b => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </div>

          {busy && (
            <div className="progress-block">
              <div className="progress-label">
                <span>{progress!.stage === 'rendering' ? 'Rendering frames' : 'Finalizing…'}</span>
                <span>{progress!.frame} / {progress!.totalFrames}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: pct + '%' }} />
              </div>
              <div className="progress-pct">{pct}%</div>
            </div>
          )}

          {error && (
            <div className="err" style={{ marginTop: 10 }}>
              {error}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <div className="spacer" />
          <button className="btn export-btn" onClick={onExport} disabled={busy}>
            {busy ? 'Exporting…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}