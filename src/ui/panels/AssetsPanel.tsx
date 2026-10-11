import React, { useRef, useState } from 'react';
import { useEditor } from '../../state/store';
import { uid } from '../../core/types';
import { makeSolidLayer } from '../../core/layer';
import ColorPickerDialog from '../ColorPickerDialog';
import type { Asset } from '../../core/types';

export default function AssetsPanel() {
  const { project } = useEditor();
  const [q, setQ] = useState('');
  const [solidPickerOpen, setSolidPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const importFiles = () => {
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const onFiles = async (files: FileList) => {
    const s = useEditor.getState();
    s.commit();
    const newAssets: Asset[] = [];
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file);
      const kind: Asset['kind'] =
        file.type.startsWith('image') ? 'image'
        : file.type.startsWith('video') ? 'video'
        : file.type.startsWith('audio') ? 'audio'
        : file.name.toLowerCase().endsWith('.srt') ? 'srt'
        : 'image';
      newAssets.push({
        id: uid(),
        name: file.name,
        kind,
        path: (file as any).path ?? file.name,
        url,
      });
    }
    s.setProject({ ...s.project, assets: [...s.project.assets, ...newAssets] });
  };

  const placeAsset = async (assetId: string, atTime: number) => {
    await useEditor.getState().dropAssetAt(assetId, atTime);
  };

  const onAssetMouseDown = (e: React.MouseEvent, assetId: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let ghost: HTMLDivElement | null = null;
    let dragging = false;

    const onMove = (ev: MouseEvent) => {
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (!dragging && dist > 5) {
        dragging = true;
        ghost = document.createElement('div');
        ghost.className = 'asset-drag-ghost';
        ghost.textContent = '●';
        document.body.appendChild(ghost);
      }
      if (ghost) {
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = ev.clientY + 'px';
      }
      window.dispatchEvent(new CustomEvent('ml-hover-asset', {
        detail: { clientX: ev.clientX, clientY: ev.clientY },
      }));
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (ghost) ghost.remove();
      if (!dragging) return;
      window.dispatchEvent(new CustomEvent('ml-drop-asset', {
        detail: { assetId, clientX: ev.clientX, clientY: ev.clientY },
      }));
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const deleteAsset = (id: string) => {
    useEditor.getState().removeAsset(id);
  };

  const filtered = project.assets.filter(a =>
    a.name.toLowerCase().includes(q.toLowerCase())
  );

  const createSolid = (color: string) => {
    const layer = makeSolidLayer(project.width, project.height, color);
    useEditor.getState().addLayer(layer);
    setSolidPickerOpen(false);
  };

  return (
    <section
      className="panel assets-panel"
      onDragOver={e => e.preventDefault()}
      onDrop={e => {
        e.preventDefault();
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
    >
      <div className="panel-head">
        <span>Assets</span>
        <div className="spacer" />
        <button
          className="btn sm"
          onClick={importFiles}
          title="Import image, video, audio or subtitles"
        >
          Import
        </button>
        <button
          className="btn sm"
          onClick={() => setSolidPickerOpen(true)}
          title="Create a full-size solid color layer"
        >
          + Solid
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          accept="image/*,video/*,audio/*,.srt"
          onChange={e => e.target.files && onFiles(e.target.files)}
        />
      </div>

      <input
        className="search"
        placeholder="Search…"
        value={q}
        onChange={e => setQ(e.target.value)}
      />

      <div className="asset-grid">
        {filtered.map(a => (
          <div
            key={a.id}
            className="asset"
            onMouseDown={e => onAssetMouseDown(e, a.id)}
            onDoubleClick={() => placeAsset(a.id, useEditor.getState().time)}
            title="Drag to timeline, or double-click to place at playhead"
          >
            <div className="thumb">
              {a.kind === 'image' && a.url ? (
                <img src={a.url} alt="" draggable={false} />
              ) : a.kind === 'video' && a.url ? (
                <video src={a.url} muted preload="metadata" />
              ) : a.kind === 'audio' ? (
                <span className="audio-icon">♪</span>
              ) : (
                <span>{a.kind}</span>
              )}
            </div>
            <div className="aname" title={a.name}>{a.name}</div>
            <button
              className="asset-del"
              title="Delete asset"
              onClick={e => { e.stopPropagation(); deleteAsset(a.id); }}
            >×</button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="empty">
            Drop media here, or click <strong>Import</strong>.
          </div>
        )}
      </div>

      {solidPickerOpen && (
        <ColorPickerDialog
          title="New Solid Layer"
          initial="#3a3a55"
          onConfirm={createSolid}
          onCancel={() => setSolidPickerOpen(false)}
        />
      )}
    </section>
  );
}