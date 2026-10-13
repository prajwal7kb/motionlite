import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor } from '../../state/store';
import { setKeyframeEasing, getPropByPath, pathLabel } from '../../core/prop';
import type {
  AnimatableProp,
  EasingKind,
  Keyframe,
  KeyframeRef,
  PropertyPath,
  TimeDisplayMode,
} from '../../core/types';

const LAYER_COL_W = 220;
const ROW_H = 26;
const PROP_ROW_H = 22;

type Drag =
  | { kind: 'playhead' }
  | { kind: 'clip'; layerId: string; startClientX: number; startIn: number; startOut: number }
  | { kind: 'trim-start'; layerId: string; startClientX: number; startIn: number }
  | { kind: 'trim-end'; layerId: string; startClientX: number; startOut: number }
  | { kind: 'keyframe'; layerId: string; path: PropertyPath; kfId: string; startClientX: number; startTime: number }
  | { kind: 'keyframe-group'; startClientX: number; refs: { layerId: string; path: PropertyPath; kfId: string; startTime: number }[] };

interface ContextMenuState {
  x: number;
  y: number;
  layerId: string;
  path: PropertyPath;
  kfId: string;
}

interface MarqueeRect { left: number; top: number; width: number; height: number; }

const kfRefsEqual = (a: KeyframeRef, b: KeyframeRef) =>
  a.layerId === b.layerId &&
  a.kfId === b.kfId &&
  a.path.kind === b.path.kind &&
  (a.path.kind === 'prop' && b.path.kind === 'prop'
    ? a.path.propKey === b.path.propKey
    : a.path.kind === 'fx' && b.path.kind === 'fx'
      ? a.path.effectId === b.path.effectId && a.path.paramKey === b.path.paramKey
      : false);

function IconPrevKeyframe() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M7.4 2.2 L3 6 L7.4 9.8 Z" fill="currentColor" />
      <rect x="2" y="2.2" width="0.9" height="7.6" fill="currentColor" opacity="0.55" />
    </svg>
  );
}
function IconNextKeyframe() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4.6 2.2 L9 6 L4.6 9.8 Z" fill="currentColor" />
      <rect x="9.1" y="2.2" width="0.9" height="7.6" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

function KeyframeContextMenu({
  x, y, count,
  currentEasing,
  onSetEasing, onDelete, onCopy, onPaste, onClose,
}: {
  x: number; y: number; count: number;
  currentEasing: EasingKind;
  onSetEasing: (easing: EasingKind) => void;
  onDelete: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onDown = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const MENU_W = 220, MENU_H = 240;
  const left = Math.min(x, window.innerWidth - MENU_W - 8);
  const top = Math.min(y, window.innerHeight - MENU_H - 8);

  const check = (active: boolean) => (
    <span className="kf-menu-check">{active ? '✓' : ''}</span>
  );

  return (
    <div className="kf-menu" style={{ left, top }}
      onMouseDown={e => e.stopPropagation()}
      onContextMenu={e => e.preventDefault()}>
      <div className="kf-menu-section">
        Keyframe Type {count > 1 ? `(${count} selected)` : ''}
      </div>
      <div className="kf-menu-item" onClick={() => onSetEasing('linear')}>
        {check(currentEasing === 'linear')} Linear ◆
      </div>
      <div className="kf-menu-item" onClick={() => onSetEasing('bezier')}>
        {check(currentEasing === 'bezier')} Bezier ●
      </div>
      <div className="kf-menu-item" onClick={() => onSetEasing('hold')}>
        {check(currentEasing === 'hold')} Hold ■
      </div>

      <div className="kf-menu-divider" />
      <div className="kf-menu-item" onClick={onCopy}>Copy Keyframe</div>
      <div className={'kf-menu-item disabled'}>
        Paste Keyframe here
      </div>

      <div className="kf-menu-divider" />
      <div className="kf-menu-item" onClick={onDelete} style={{ color: 'var(--bad)' }}>
        Delete {count > 1 ? `${count} Keyframes` : 'Keyframe'}
      </div>
    </div>
  );
}

function fmtTime(s: number, mode: TimeDisplayMode, fps: number): string {
  if (mode === 'frames') return String(Math.round(s * fps)).padStart(4, '0');
  if (mode === 'seconds') return s.toFixed(2) + 's';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const f = Math.floor((s % 1) * fps);
  return `${m}:${sec.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
}

export default function Timeline() {
  const {
    project, time, setTime, selectedLayerId, selectedLayerIds,
    selectedKeyframes,
    selectWithModifiers, updateLayer, setProject, removeLayer,
    deleteSelectedKeyframes,
  } = useEditor();
  const [pxPerSec, setPxPerSec] = useState(80);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dropIndicator, setDropIndicator] = useState<number | null>(null);
  const [draggingKfIds, setDraggingKfIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const pxRef = useRef(pxPerSec);
  pxRef.current = pxPerSec;

  const totalW = project.duration * pxPerSec;
  const mode = useEditor(s => s.timeDisplayMode);
  const selectedKfIds = new Set(selectedKeyframes.map(r => r.kfId));

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Bulk easing (right-click menu + keyboard shortcuts) ──
  const applyEasingToSelection = useCallback((easing: EasingKind) => {
    const refs = useEditor.getState().selectedKeyframes;
    if (refs.length === 0) return;
    useEditor.getState().commit();
    const byLayer = new Map<string, KeyframeRef[]>();
    for (const r of refs) {
      if (!byLayer.has(r.layerId)) byLayer.set(r.layerId, []);
      byLayer.get(r.layerId)!.push(r);
    }
    const update = useEditor.getState().updateLayer;
    for (const [layerId, rlist] of byLayer) {
      update(layerId, l => {
        for (const r of rlist) {
          const prop = getPropByPath(l, r.path);
          if (prop) setKeyframeEasing(prop, r.kfId, easing);
        }
      });
    }
  }, []);

  // ── Global mouse handlers ────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;

      if (d.kind === 'playhead') {
        const el = scrollRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left - LAYER_COL_W + el.scrollLeft;
        setTime(x / pxRef.current);
        return;
      }

      const delta = (e.clientX - d.startClientX) / pxRef.current;

      if (d.kind === 'clip') {
        updateLayer(d.layerId, l => {
          l.inPoint = Math.max(0, d.startIn + delta);
          l.outPoint = d.startOut + delta;
        });
      } else if (d.kind === 'trim-start') {
        updateLayer(d.layerId, l => {
          const maxIn = l.outPoint - 0.05;
          l.inPoint = Math.max(0, Math.min(maxIn, d.startIn + delta));
        });
      } else if (d.kind === 'trim-end') {
        updateLayer(d.layerId, l => {
          const minOut = l.inPoint + 0.05;
          l.outPoint = Math.max(minOut, d.startOut + delta);
        });
      } else if (d.kind === 'keyframe') {
        const newTime = Math.max(0, d.startTime + delta);
        updateLayer(d.layerId, l => {
          const prop = getPropByPath(l, d.path);
          if (!prop) return;
          const kf = prop.keyframes.find(k => k.id === d.kfId);
          if (kf) kf.time = newTime;
          prop.keyframes.sort((a, b) => a.time - b.time);
        });
      } else if (d.kind === 'keyframe-group') {
        for (const r of d.refs) {
          const newTime = Math.max(0, r.startTime + delta);
          updateLayer(r.layerId, l => {
            const prop = getPropByPath(l, r.path);
            if (!prop) return;
            const kf = prop.keyframes.find(k => k.id === r.kfId);
            if (kf) kf.time = newTime;
          });
        }
        const sortedLayers = new Set(d.refs.map(r => r.layerId));
        for (const id of sortedLayers) {
          updateLayer(id, l => {
            for (const r of d.refs) {
              if (r.layerId !== id) continue;
              const prop = getPropByPath(l, r.path);
              if (prop) prop.keyframes.sort((a, b) => a.time - b.time);
            }
          });
        }
      }
    };

    const onUp = () => {
      const d = dragRef.current;
      if (d && (d.kind === 'keyframe' || d.kind === 'keyframe-group')) {
        setDraggingKfIds(new Set());
      }
      dragRef.current = null;
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setTime, updateLayer]);

  // ── Asset drop ──────────────────────────────────────
  useEffect(() => {
    const onDrop = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { assetId: string; clientX: number; clientY: number };
      if (!detail) return;
      const target = document.elementFromPoint(detail.clientX, detail.clientY);
      if (!target || !target.closest('.timeline-body')) { setDropIndicator(null); return; }
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = detail.clientX - rect.left - LAYER_COL_W + el.scrollLeft;
      const dropTime = Math.max(0, x / pxRef.current);
      setDropIndicator(null);
      await useEditor.getState().dropAssetAt(detail.assetId, dropTime);
    };
    window.addEventListener('ml-drop-asset', onDrop);
    return () => window.removeEventListener('ml-drop-asset', onDrop);
  }, []);

  useEffect(() => {
    const onHover = (e: Event) => {
      const detail = (e as CustomEvent).detail as { clientX: number; clientY: number } | undefined;
      if (!detail) return;
      const target = document.elementFromPoint(detail.clientX, detail.clientY);
      if (!target || !target.closest('.timeline-body')) { setDropIndicator(null); return; }
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = detail.clientX - rect.left - LAYER_COL_W + el.scrollLeft;
      setDropIndicator(Math.max(0, x / pxRef.current));
    };
    window.addEventListener('ml-hover-asset', onHover);
    return () => window.removeEventListener('ml-hover-asset', onHover);
  }, []);

  // ── Keyboard: copy/paste + Linear/Hold shortcuts ────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      const typing = !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
      if (typing) return;

      const refs = useEditor.getState().selectedKeyframes;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'c' && refs.length > 0) {
        e.preventDefault();
        useEditor.getState().copyKeyframe(refs[refs.length - 1]);
        return;
      }
      if (mod && key === 'v' && refs.length > 0) {
        e.preventDefault();
        const ref = refs[refs.length - 1];
        useEditor.getState().pasteKeyframe(ref.layerId, ref.path);
        return;
      }
      if (refs.length === 0) return;
      if (mod && key === 'h') { e.preventDefault(); applyEasingToSelection('hold'); return; }
      if (mod && key === 'l') { e.preventDefault(); applyEasingToSelection('linear'); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyEasingToSelection]);

  // ── Timeline marquee on empty area ──────────────────
  const onScrollMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(
      '.tl-layer-cell, .tl-corner, .tl-ruler, .tl-playhead-handle, .clip, .kf-marker'
    )) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const shift = e.shiftKey || e.ctrlKey || e.metaKey;
    let moved = false;

    const onMove = (ev: MouseEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 4) moved = true;
      if (!moved) return;
      setMarqueeRect({
        left: Math.min(startX, ev.clientX),
        top: Math.min(startY, ev.clientY),
        width: Math.abs(ev.clientX - startX),
        height: Math.abs(ev.clientY - startY),
      });
    };

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setMarqueeRect(null);

      if (!moved) {
        if (!shift) useEditor.getState().clearSelection();
        return;
      }

      const rect = {
        left: Math.min(startX, ev.clientX),
        top: Math.min(startY, ev.clientY),
        right: Math.max(startX, ev.clientX),
        bottom: Math.max(startY, ev.clientY),
      };

      const markers = document.querySelectorAll<HTMLElement>('.kf-marker');
      const picked: KeyframeRef[] = [];
      markers.forEach(m => {
        const r = m.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cx < rect.left || cx > rect.right || cy < rect.top || cy > rect.bottom) return;
        const layerId = m.getAttribute('data-layer-id');
        const pathKind = m.getAttribute('data-path-kind');
        const kfId = m.getAttribute('data-kf-id');
        if (!layerId || !pathKind || !kfId) return;
        let path: PropertyPath;
        if (pathKind === 'prop') {
          const propKey = m.getAttribute('data-path-key');
          if (!propKey) return;
          path = { kind: 'prop', propKey };
        } else {
          const effectId = m.getAttribute('data-path-effect');
          const paramKey = m.getAttribute('data-path-param');
          if (!effectId || !paramKey) return;
          path = { kind: 'fx', effectId, paramKey };
        }
        picked.push({ layerId, path, kfId });
      });

      if (shift) useEditor.getState().addKeyframesToSelection(picked);
      else useEditor.getState().setSelectedKeyframes(picked);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startPlayhead = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { kind: 'playhead' };
    const el = scrollRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - LAYER_COL_W + el.scrollLeft;
      setTime(x / pxPerSec);
    }
  };

  const startClipDrag = (e: React.MouseEvent, layerId: string) => {
    e.stopPropagation();
    e.preventDefault();
    selectWithModifiers(layerId, e.shiftKey, e.ctrlKey || e.metaKey);
    const layer = project.layers.find(l => l.id === layerId);
    if (!layer) return;
    dragRef.current = {
      kind: 'clip', layerId,
      startClientX: e.clientX,
      startIn: layer.inPoint, startOut: layer.outPoint,
    };
  };

  const startTrim = (e: React.MouseEvent, layerId: string, side: 'start' | 'end') => {
    e.stopPropagation();
    e.preventDefault();
    useEditor.getState().select(layerId);
    const layer = project.layers.find(l => l.id === layerId);
    if (!layer) return;
    if (side === 'start') {
      dragRef.current = { kind: 'trim-start', layerId, startClientX: e.clientX, startIn: layer.inPoint };
    } else {
      dragRef.current = { kind: 'trim-end', layerId, startClientX: e.clientX, startOut: layer.outPoint };
    }
  };

  const startKeyframeDrag = (
    e: React.MouseEvent, layerId: string, path: PropertyPath, kfId: string, kfTime: number
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const ref: KeyframeRef = { layerId, path, kfId };
    const alreadySelected = selectedKeyframes.some(r => kfRefsEqual(r, ref));
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;

    if (additive) {
      if (alreadySelected) {
        useEditor.getState().removeKeyframeFromSelection(ref);
        return;
      } else {
        useEditor.getState().addKeyframesToSelection([ref]);
      }
    } else if (!alreadySelected) {
      useEditor.getState().selectKeyframe(ref);
    }

    setTime(kfTime);

    const refsToMove = useEditor.getState().selectedKeyframes;
    const group: { layerId: string; path: PropertyPath; kfId: string; startTime: number }[] = [];
    for (const r of refsToMove) {
      const ly = project.layers.find(l => l.id === r.layerId);
      if (!ly) continue;
      const pr = getPropByPath(ly, r.path);
      if (!pr) continue;
      const k = pr.keyframes.find(x => x.id === r.kfId);
      if (!k) continue;
      group.push({ layerId: r.layerId, path: r.path, kfId: r.kfId, startTime: k.time });
    }

    if (group.length === 0) group.push({ layerId, path, kfId, startTime: kfTime });
    setDraggingKfIds(new Set(group.map(g => g.kfId)));

    if (group.length === 1) {
      dragRef.current = {
        kind: 'keyframe', layerId, path, kfId,
        startClientX: e.clientX, startTime: kfTime,
      };
    } else {
      dragRef.current = {
        kind: 'keyframe-group',
        startClientX: e.clientX,
        refs: group,
      };
    }
  };

  const openKfContextMenu = (
    e: React.MouseEvent, layerId: string, path: PropertyPath, kfId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const ref: KeyframeRef = { layerId, path, kfId };
    const alreadySelected = selectedKeyframes.some(r => kfRefsEqual(r, ref));
    if (!alreadySelected) useEditor.getState().selectKeyframe(ref);
    setContextMenu({ x: e.clientX, y: e.clientY, layerId, path, kfId });
  };

  const updateDuration = (v: number) => {
    setProject({ ...project, duration: Math.max(1, v) });
  };

  const onLayerRowClick = (e: React.MouseEvent, id: string) => {
    selectWithModifiers(id, e.shiftKey, e.ctrlKey || e.metaKey);
  };

  const navKeyframe = (layerId: string, path: PropertyPath, direction: -1 | 1) => {
    const layer = project.layers.find(l => l.id === layerId);
    if (!layer) return;
    const prop = getPropByPath(layer, path);
    if (!prop || prop.keyframes.length === 0) return;
    const times = prop.keyframes.map(k => k.time).sort((a, b) => a - b);
    const cur = time;
    if (direction === 1) {
      const next = times.find(t => t > cur + 0.001);
      if (next !== undefined) setTime(next);
    } else {
      const prev = [...times].reverse().find(t => t < cur - 0.001);
      if (prev !== undefined) setTime(prev);
    }
  };

  const ctxKf = (() => {
    if (!contextMenu) return null;
    const layer = project.layers.find(l => l.id === contextMenu.layerId);
    if (!layer) return null;
    const prop = getPropByPath(layer, contextMenu.path);
    return prop?.keyframes.find(k => k.id === contextMenu.kfId) ?? null;
  })();

  const handleSetEasing = (easing: EasingKind) => {
    applyEasingToSelection(easing);
    setContextMenu(null);
  };

  const handleDeleteFromMenu = () => {
    deleteSelectedKeyframes();
    setContextMenu(null);
  };

  const handleCopyFromMenu = () => {
    if (!contextMenu) return;
    useEditor.getState().copyKeyframe({
      layerId: contextMenu.layerId,
      path: contextMenu.path,
      kfId: contextMenu.kfId,
    });
    setContextMenu(null);
  };

  const handlePasteFromMenu = () => {
    if (!contextMenu) return;
    useEditor.getState().pasteKeyframe(contextMenu.layerId, contextMenu.path);
    setContextMenu(null);
  };

  const kfClass = (kf: Keyframe) =>
    'kf-marker kf-' + kf.easing +
    (draggingKfIds.has(kf.id) ? ' kf-dragging' : '') +
    (selectedKfIds.has(kf.id) ? ' kf-selected' : '');

  return (
    <section className="panel timeline-panel">
      <div className="panel-head">
        <span>Timeline</span>
        <div className="spacer" />
        <label style={{ color: 'var(--fg-1)', fontSize: 10 }}>Duration</label>
        <input
          type="number" min={1} step={1}
          value={project.duration}
          onChange={e => updateDuration(parseFloat(e.target.value) || 1)}
          style={{ width: 60 }}
        />
        <span className="timecode">
          {fmtTime(time, mode, project.fps)} / {fmtTime(project.duration, mode, project.fps)}
        </span>
        <button className="btn sm" onClick={() => setPxPerSec(p => Math.max(20, p / 1.5))}>−</button>
        <button className="btn sm" onClick={() => setPxPerSec(p => Math.min(600, p * 1.5))}>+</button>
      </div>

      <div className="timeline-body">
        <div className="tl-scroll" ref={scrollRef} onMouseDown={onScrollMouseDown}>
          <div className="tl-content" style={{ width: LAYER_COL_W + totalW }}>

            <div className="tl-row tl-ruler-row">
              <div className="tl-corner" style={{ width: LAYER_COL_W }} />
              <div className="tl-ruler" style={{ width: totalW }} onMouseDown={startPlayhead}>
                {ticks(project.duration, pxPerSec).map(t => (
                  <div key={t} className="tick" style={{ left: t * pxPerSec }}>
                    <span>{fmtTime(t, mode, project.fps)}</span>
                  </div>
                ))}
              </div>
            </div>

            {project.layers.map(layer => {
              const isExpanded = expanded.has(layer.id);
              const isSel = selectedLayerIds.includes(layer.id);
              const isPrimary = layer.id === selectedLayerId;

              const channels: Array<{ path: PropertyPath; prop: AnimatableProp }> = [];
              for (const [key, p] of Object.entries(layer.props)) {
                if ((p.keyframes || []).length > 0) {
                  channels.push({ path: { kind: 'prop', propKey: key }, prop: p });
                }
              }
              for (const fx of layer.effects) {
                for (const [key, p] of Object.entries(fx.params)) {
                  if ((p.keyframes || []).length > 0) {
                    channels.push({ path: { kind: 'fx', effectId: fx.id, paramKey: key }, prop: p });
                  }
                }
              }
              const hasAnim = channels.length > 0;

              return (
                <React.Fragment key={layer.id}>
                  <div className={'tl-row' + (isSel ? ' tl-row-sel' : '') + (isPrimary ? ' tl-row-primary' : '')}>
                    <div className="tl-layer-cell" style={{ width: LAYER_COL_W, height: ROW_H }}
                      onClick={e => onLayerRowClick(e, layer.id)}>
                      <span className="chevron"
                        onClick={e => { e.stopPropagation(); if (hasAnim) toggleExpand(layer.id); }}>
                        {hasAnim ? (isExpanded ? '▼' : '▶') : '\u00A0'}
                      </span>
                      <span className="eye"
                        onClick={e => { e.stopPropagation(); updateLayer(layer.id, x => { x.hidden = !x.hidden; }); }}>
                        {layer.hidden ? '○' : '●'}
                      </span>
                      <span className="lname">{layer.name}</span>
                      <span className="ltype">{layer.type}</span>
                      <span className="del"
                        onClick={e => { e.stopPropagation(); removeLayer(layer.id); }}>×</span>
                    </div>

                    <div className="tl-track-cell" style={{ width: totalW, height: ROW_H }}>
                      <div className={'clip clip-' + layer.type + (isSel ? ' clip-sel' : '')}
                        style={{
                          left: layer.inPoint * pxPerSec,
                          width: Math.max(6, (layer.outPoint - layer.inPoint) * pxPerSec),
                        }}
                        onMouseDown={e => startClipDrag(e, layer.id)}>
                        <div className="clip-handle clip-handle-l"
                          onMouseDown={e => startTrim(e, layer.id, 'start')} />
                        <div className="clip-handle clip-handle-r"
                          onMouseDown={e => startTrim(e, layer.id, 'end')} />
                      </div>

                      {!isExpanded && channels.flatMap(({ path, prop }) =>
                        prop.keyframes.map(kf => {
                          const pathAttrs = path.kind === 'prop'
                            ? { 'data-path-kind': 'prop', 'data-path-key': path.propKey }
                            : { 'data-path-kind': 'fx', 'data-path-effect': path.effectId, 'data-path-param': path.paramKey };
                          return (
                            <div
                              key={(path.kind === 'prop' ? path.propKey : path.effectId + path.paramKey) + kf.id}
                              data-layer-id={layer.id}
                              data-kf-id={kf.id}
                              {...pathAttrs}
                              className={kfClass(kf) + ' kf-combined'}
                              style={{ left: kf.time * pxPerSec }}
                              onMouseDown={e => startKeyframeDrag(e, layer.id, path, kf.id, kf.time)}
                              onContextMenu={e => openKfContextMenu(e, layer.id, path, kf.id)}
                              title={pathLabel(path) + ' @ ' + kf.time.toFixed(2) + 's · ' + kf.easing}
                            />
                          );
                        })
                      )}
                    </div>
                  </div>

                  {isExpanded && channels.map(({ path, prop }) => (
                    <div className="tl-row tl-prop-row" key={layer.id + ':' + pathLabel(path)}>
                      <div className="tl-layer-cell tl-prop-cell"
                        style={{ width: LAYER_COL_W, height: PROP_ROW_H }}>
                        <span className="prop-name">{pathLabel(path)}</span>
                        <div className="spacer" />
                        <button className="kf-nav" title="Previous keyframe"
                          onClick={e => { e.stopPropagation(); navKeyframe(layer.id, path, -1); }}>
                          <IconPrevKeyframe />
                        </button>
                        <button className="kf-nav" title="Next keyframe"
                          onClick={e => { e.stopPropagation(); navKeyframe(layer.id, path, 1); }}>
                          <IconNextKeyframe />
                        </button>
                      </div>
                      <div className="tl-track-cell tl-prop-track"
                        style={{ width: totalW, height: PROP_ROW_H }}>
                        {prop.keyframes.map(kf => {
                          const pathAttrs = path.kind === 'prop'
                            ? { 'data-path-kind': 'prop', 'data-path-key': path.propKey }
                            : { 'data-path-kind': 'fx', 'data-path-effect': path.effectId, 'data-path-param': path.paramKey };
                          return (
                            <div
                              key={kf.id}
                              data-layer-id={layer.id}
                              data-kf-id={kf.id}
                              {...pathAttrs}
                              className={kfClass(kf)}
                              style={{ left: kf.time * pxPerSec }}
                              onMouseDown={e => startKeyframeDrag(e, layer.id, path, kf.id, kf.time)}
                              onContextMenu={e => openKfContextMenu(e, layer.id, path, kf.id)}
                              title={pathLabel(path) + ' @ ' + kf.time.toFixed(2) + 's · ' + kf.easing}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </React.Fragment>
              );
            })}

            <div style={{ height: 16 }} />

            <div className="tl-playhead-line" style={{ left: LAYER_COL_W + time * pxPerSec }} />
            <div className="tl-playhead-handle"
              style={{ left: LAYER_COL_W + time * pxPerSec }}
              onMouseDown={startPlayhead} />
            {dropIndicator !== null && (
              <div className="tl-drop-indicator"
                style={{ left: LAYER_COL_W + dropIndicator * pxPerSec }} />
            )}
          </div>
        </div>
      </div>

      {contextMenu && ctxKf && (
        <KeyframeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          count={Math.max(1, selectedKeyframes.length)}
          currentEasing={ctxKf.easing}
          onSetEasing={handleSetEasing}
          onDelete={handleDeleteFromMenu}
          onCopy={handleCopyFromMenu}
          onPaste={handlePasteFromMenu}
          onClose={() => setContextMenu(null)}
        />
      )}

      {marqueeRect && <div className="marquee-rect" style={marqueeRect} />}
    </section>
  );
}

function ticks(duration: number, pxPerSec: number): number[] {
  const step = pxPerSec > 200 ? 0.25 : pxPerSec > 80 ? 0.5 : pxPerSec > 40 ? 1 : 2;
  const out: number[] = [];
  for (let t = 0; t <= duration; t += step) out.push(t);
  return out;
}