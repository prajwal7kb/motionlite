import React, { useRef, useState, useEffect } from 'react';
import { useEditor } from '../../state/store';
import type { AnimatableProp } from '../../core/types';

const LAYER_COL_W = 220;
const ROW_H = 26;
const PROP_ROW_H = 22;

type KfPath =
  | { kind: 'prop'; propKey: string }
  | { kind: 'fx'; effectId: string; paramKey: string };

type Drag =
  | { kind: 'playhead' }
  | { kind: 'clip'; layerId: string; startClientX: number; startIn: number; startOut: number }
  | { kind: 'trim-start'; layerId: string; startClientX: number; startIn: number }
  | { kind: 'trim-end'; layerId: string; startClientX: number; startOut: number }
  | { kind: 'keyframe'; layerId: string; path: KfPath; kfId: string; startClientX: number; startTime: number };

function getKfArray(layer: any, path: KfPath): AnimatableProp | undefined {
  if (path.kind === 'prop') return layer.props[path.propKey];
  const fx = layer.effects.find((e: any) => e.id === path.effectId);
  return fx?.params[path.paramKey];
}

function channelLabel(path: KfPath): string {
  if (path.kind === 'prop') return path.propKey;
  return 'fx · ' + path.paramKey;
}

function channelKey(path: KfPath): string {
  return path.kind === 'prop' ? 'p:' + path.propKey : 'f:' + path.effectId + ':' + path.paramKey;
}

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

export default function Timeline() {
  const {
    project, time, setTime, selectedLayerId, selectedLayerIds,
    selectWithModifiers, updateLayer, setProject, removeLayer,
  } = useEditor();
  const [pxPerSec, setPxPerSec] = useState(80);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dropIndicator, setDropIndicator] = useState<number | null>(null);
  const [draggingKfId, setDraggingKfId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const pxRef = useRef(pxPerSec);
  pxRef.current = pxPerSec;

  const totalW = project.duration * pxPerSec;

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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
        const newIn = Math.max(0, d.startIn + delta);
        const newOut = d.startOut + delta;
        updateLayer(d.layerId, l => { l.inPoint = newIn; l.outPoint = newOut; });
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
          const prop = getKfArray(l, d.path);
          if (!prop) return;
          const kf = prop.keyframes.find(k => k.id === d.kfId);
          if (kf) kf.time = newTime;
          prop.keyframes.sort((a, b) => a.time - b.time);
        });
      }
    };

    const onUp = () => {
      const d = dragRef.current;
      if (d && d.kind === 'keyframe') {
        updateLayer(d.layerId, l => {
          const prop = getKfArray(l, d.path);
          if (prop) prop.keyframes.sort((a, b) => a.time - b.time);
        });
        setDraggingKfId(null);
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

  useEffect(() => {
    const onDrop = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        assetId: string;
        clientX: number;
        clientY: number;
      };
      if (!detail) return;
      const target = document.elementFromPoint(detail.clientX, detail.clientY);
      if (!target || !target.closest('.timeline-body')) {
        setDropIndicator(null);
        return;
      }
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
      if (!target || !target.closest('.timeline-body')) {
        setDropIndicator(null);
        return;
      }
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = detail.clientX - rect.left - LAYER_COL_W + el.scrollLeft;
      setDropIndicator(Math.max(0, x / pxRef.current));
    };
    window.addEventListener('ml-hover-asset', onHover);
    return () => window.removeEventListener('ml-hover-asset', onHover);
  }, []);

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
    e: React.MouseEvent, layerId: string, path: KfPath, kfId: string, kfTime: number
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    useEditor.getState().select(layerId);
    setTime(kfTime);
    setDraggingKfId(kfId);
    dragRef.current = {
      kind: 'keyframe', layerId, path, kfId,
      startClientX: e.clientX, startTime: kfTime,
    };
  };

  const updateDuration = (v: number) => {
    setProject({ ...project, duration: Math.max(1, v) });
  };

  const onLayerRowClick = (e: React.MouseEvent, id: string) => {
    selectWithModifiers(id, e.shiftKey, e.ctrlKey || e.metaKey);
  };

  /**
   * Click on any empty area of the timeline (background, spacers, gaps
   * between clips) → deselect. Clicks on rows, cells, clips, markers,
   * playhead, or the ruler are ignored.
   */
  const onTimelineEmptyClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInteractive = target.closest(
      '.tl-layer-cell, .clip, .kf-marker, .tl-playhead-handle, .tl-ruler, .tl-prop-cell, .tl-prop-track'
    );
    if (isInteractive) return;
    useEditor.getState().select(null);
  };

  const navKeyframe = (layerId: string, path: KfPath, direction: -1 | 1) => {
    const layer = project.layers.find(l => l.id === layerId);
    if (!layer) return;
    const prop = getKfArray(layer, path);
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
        <span className="timecode">{fmt(time)} / {fmt(project.duration)}</span>
        <button className="btn sm" onClick={() => setPxPerSec(p => Math.max(20, p / 1.5))}>−</button>
        <button className="btn sm" onClick={() => setPxPerSec(p => Math.min(600, p * 1.5))}>+</button>
      </div>

      <div className="timeline-body">
        <div className="tl-scroll" ref={scrollRef} onMouseDown={onTimelineEmptyClick}>
          <div className="tl-content" style={{ width: LAYER_COL_W + totalW }}>

            <div className="tl-row tl-ruler-row">
              <div className="tl-corner" style={{ width: LAYER_COL_W }} />
              <div className="tl-ruler" style={{ width: totalW }} onMouseDown={startPlayhead}>
                {ticks(project.duration, pxPerSec).map(t => (
                  <div key={t} className="tick" style={{ left: t * pxPerSec }}>
                    <span>{fmt(t)}</span>
                  </div>
                ))}
              </div>
            </div>

            {project.layers.map(layer => {
              const isExpanded = expanded.has(layer.id);
              const isSel = selectedLayerIds.includes(layer.id);
              const isPrimary = layer.id === selectedLayerId;

              const channels: Array<{ path: KfPath; prop: AnimatableProp }> = [];
              for (const [key, p] of Object.entries(layer.props)) {
                if ((p.keyframes || []).length > 0) {
                  channels.push({ path: { kind: 'prop', propKey: key }, prop: p });
                }
              }
              for (const fx of layer.effects) {
                for (const [key, p] of Object.entries(fx.params)) {
                  if ((p.keyframes || []).length > 0) {
                    channels.push({
                      path: { kind: 'fx', effectId: fx.id, paramKey: key },
                      prop: p,
                    });
                  }
                }
              }
              const hasAnim = channels.length > 0;

              return (
                <React.Fragment key={layer.id}>
                  <div className={'tl-row' + (isSel ? ' tl-row-sel' : '') + (isPrimary ? ' tl-row-primary' : '')}>
                    <div
                      className="tl-layer-cell"
                      style={{ width: LAYER_COL_W, height: ROW_H }}
                      onClick={e => onLayerRowClick(e, layer.id)}
                    >
                      <span
                        className="chevron"
                        onClick={e => { e.stopPropagation(); if (hasAnim) toggleExpand(layer.id); }}
                      >
                        {hasAnim ? (isExpanded ? '▼' : '▶') : '\u00A0'}
                      </span>
                      <span
                        className="eye"
                        onClick={e => { e.stopPropagation(); updateLayer(layer.id, x => { x.hidden = !x.hidden; }); }}
                      >
                        {layer.hidden ? '○' : '●'}
                      </span>
                      <span className="lname">{layer.name}</span>
                      <span className="ltype">{layer.type}</span>
                      <span
                        className="del"
                        onClick={e => { e.stopPropagation(); removeLayer(layer.id); }}
                      >×</span>
                    </div>

                    <div className="tl-track-cell" style={{ width: totalW, height: ROW_H }}>
                      <div
                        className={'clip clip-' + layer.type + (isSel ? ' clip-sel' : '')}
                        style={{
                          left: layer.inPoint * pxPerSec,
                          width: Math.max(6, (layer.outPoint - layer.inPoint) * pxPerSec),
                        }}
                        onMouseDown={e => startClipDrag(e, layer.id)}
                      >
                        <div className="clip-handle clip-handle-l" onMouseDown={e => startTrim(e, layer.id, 'start')} />
                        <div className="clip-handle clip-handle-r" onMouseDown={e => startTrim(e, layer.id, 'end')} />
                      </div>

                      {!isExpanded && channels.flatMap(({ path, prop }) =>
                        prop.keyframes.map(kf => (
                          <div
                            key={channelKey(path) + kf.id}
                            className={
                              'kf-marker kf-combined' +
                              (draggingKfId === kf.id ? ' kf-dragging' : '')
                            }
                            style={{ left: kf.time * pxPerSec }}
                            onMouseDown={e => startKeyframeDrag(e, layer.id, path, kf.id, kf.time)}
                            title={channelLabel(path) + ' @ ' + kf.time.toFixed(2) + 's · drag to re-time'}
                          />
                        ))
                      )}
                    </div>
                  </div>

                  {isExpanded && channels.map(({ path, prop }) => (
                    <div className="tl-row tl-prop-row" key={layer.id + ':' + channelKey(path)}>
                      <div className="tl-layer-cell tl-prop-cell" style={{ width: LAYER_COL_W, height: PROP_ROW_H }}>
                        <span className="prop-name">{channelLabel(path)}</span>
                        <div className="spacer" />
                        <button
                          className="kf-nav"
                          title="Previous keyframe"
                          onClick={e => { e.stopPropagation(); navKeyframe(layer.id, path, -1); }}
                        >
                          <IconPrevKeyframe />
                        </button>
                        <button
                          className="kf-nav"
                          title="Next keyframe"
                          onClick={e => { e.stopPropagation(); navKeyframe(layer.id, path, 1); }}
                        >
                          <IconNextKeyframe />
                        </button>
                      </div>
                      <div className="tl-track-cell tl-prop-track" style={{ width: totalW, height: PROP_ROW_H }}>
                        {prop.keyframes.map(kf => (
                          <div
                            key={kf.id}
                            className={'kf-marker' + (draggingKfId === kf.id ? ' kf-dragging' : '')}
                            style={{ left: kf.time * pxPerSec }}
                            onMouseDown={e => startKeyframeDrag(e, layer.id, path, kf.id, kf.time)}
                            title={'drag to re-time · ' + kf.time.toFixed(2) + 's'}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </React.Fragment>
              );
            })}

            <div style={{ height: 16 }} />

            <div
              className="tl-playhead-line"
              style={{ left: LAYER_COL_W + time * pxPerSec }}
            />
            <div
              className="tl-playhead-handle"
              style={{ left: LAYER_COL_W + time * pxPerSec }}
              onMouseDown={startPlayhead}
            />
            {dropIndicator !== null && (
              <div
                className="tl-drop-indicator"
                style={{ left: LAYER_COL_W + dropIndicator * pxPerSec }}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const f = Math.floor((s % 1) * 30);
  return m + ':' + sec.toString().padStart(2, '0') + ':' + f.toString().padStart(2, '0');
};

function ticks(duration: number, pxPerSec: number): number[] {
  const step = pxPerSec > 200 ? 0.25 : pxPerSec > 80 ? 0.5 : pxPerSec > 40 ? 1 : 2;
  const out: number[] = [];
  for (let t = 0; t <= duration; t += step) out.push(t);
  return out;
}