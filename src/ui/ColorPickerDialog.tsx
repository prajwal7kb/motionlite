import React, { useState } from 'react';

interface Props {
  initial?: string;
  title?: string;
  onConfirm: (color: string) => void;
  onCancel: () => void;
}

const SWATCHES = [
  '#ffffff', '#e8e8ef', '#9a9aab', '#4a4a55',
  '#0b0b0f', '#7c5cff', '#5c8dff', '#4ade80',
  '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
];

export default function ColorPickerDialog({ initial = '#3a3a55', title = 'Choose color', onConfirm, onCancel }: Props) {
  const [color, setColor] = useState(initial);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal color-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span>{title}</span>
          <div className="spacer" />
          <button className="btn sm" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <div className="swatch-grid">
            {SWATCHES.map(s => (
              <div
                key={s}
                className={'swatch' + (s.toLowerCase() === color.toLowerCase() ? ' swatch-sel' : '')}
                style={{ background: s }}
                onClick={() => setColor(s)}
                title={s}
              />
            ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <label>Custom</label>
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
            />
            <input
              type="text"
              value={color}
              onChange={e => setColor(e.target.value)}
              style={{ flex: 1 }}
            />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label>Preview</label>
            <div className="color-preview" style={{ background: color }} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <div className="spacer" />
          <button className="btn export-btn" onClick={() => onConfirm(color)}>Create</button>
        </div>
      </div>
    </div>
  );
}