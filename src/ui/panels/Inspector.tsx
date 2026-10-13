import React from 'react';
import { useEditor } from '../../state/store';
import { evalProp } from '../../core/expression';
import { setKeyframe } from '../../core/prop';
import { presetFromLayer } from '../../core/presets';
import { PROP_DEFAULTS } from '../../core/types';
import type { Layer } from '../../core/types';
import { SHAPE_DEFAULTS } from '../../core/layer';
import NumberField from '../widgets/NumberField';
import EffectsSection from './EffectsSection';

function LinkIcon({ linked }: { linked: boolean }) {
  if (linked) {
    return (
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <path d="M5 7 L7 5" />
        <path d="M7.5 3.5 L8.5 2.5 A2 2 0 0 1 10.5 4.5 L9.5 5.5" />
        <path d="M4.5 8.5 L3.5 9.5 A2 2 0 0 1 1.5 7.5 L2.5 6.5" />
      </svg>
    );
  }
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none"
      stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.55">
      <path d="M7 5 L8.5 3.5 A2 2 0 0 1 10.5 5.5 L9.5 6.5" />
      <path d="M5 7 L3.5 8.5 A2 2 0 0 1 1.5 6.5 L2.5 5.5" />
      <path d="M1.5 10.5 L10.5 1.5" strokeDasharray="1 1.5" />
    </svg>
  );
}

function RotationDualFields({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [turnsDraft, setTurnsDraft] = React.useState<string | null>(null);
  const [degDraft, setDegDraft] = React.useState<string | null>(null);

  const turns = Math.trunc(value / 360);
  const degs = Math.round((value - turns * 360) * 100) / 100;

  const turnsDisplay = turnsDraft !== null ? turnsDraft : String(turns);
  const degsDisplay = degDraft !== null ? degDraft : String(degs);

  const commitTurns = () => {
    if (turnsDraft !== null) {
      const t = parseFloat(turnsDraft);
      if (!isNaN(t)) onChange(Math.trunc(t) * 360 + degs);
    }
    setTurnsDraft(null);
  };
  const commitDegs = () => {
    if (degDraft !== null) {
      const d = parseFloat(degDraft);
      if (!isNaN(d)) onChange(turns * 360 + d);
    }
    setDegDraft(null);
  };

  return (
    <span className="rot-dual">
      <input
        className="rot-turns" type="number" step={1}
        value={turnsDisplay}
        onChange={e => setTurnsDraft(e.target.value)}
        onBlur={commitTurns}
        onKeyDown={e => { if (e.key === 'Enter') commitTurns(); if (e.key === 'Escape') setTurnsDraft(null); }}
        title="Full turns · 1 = 360°"
      />
      <span className="rot-sep">x</span>
      <input
        className="rot-degs" type="number" step={1}
        value={degsDisplay}
        onChange={e => setDegDraft(e.target.value)}
        onBlur={commitDegs}
        onKeyDown={e => { if (e.key === 'Enter') commitDegs(); if (e.key === 'Escape') setDegDraft(null); }}
        title="Degrees added to the turns"
      />
      <span className="rot-sep">°</span>
    </span>
  );
}

export default function Inspector() {
  const { project, selectedLayerId, time } = useEditor();
  const [chainScale, setChainScale] = React.useState(true);
  const [chainPos, setChainPos] = React.useState(true);
  const layer = project.layers.find(l => l.id === selectedLayerId);

  if (!layer) {
    return (
      <section className="panel inspector-panel">
        <div className="panel-head">Inspector</div>
        <div className="empty">No layer selected</div>
      </section>
    );
  }

  const upd = (fn: (l: Layer) => void) => useEditor.getState().updateLayer(layer.id, fn);
  const ctx = { time, layer, comp: project };

  const assignNum = (key: string, value: number) => {
    upd(l => {
      const p = l.props[key];
      if (!p) return;
      if (p.keyframes.length) setKeyframe(p, time, value, 'linear');
      else p.value = value;
    });
  };

  const assignVecAxis = (key: string, axis: 'x' | 'y', value: number) => {
    upd(l => {
      const p = l.props[key];
      if (!p) return;
      const cur = evalProp(p, ctx) as any;
      const next = { ...cur, [axis]: value };
      if (p.keyframes.length) setKeyframe(p, time, next, 'linear');
      else p.value = next;
    });
  };

  const resetProp = (key: string) => {
    useEditor.getState().commit();
    upd(l => {
      const p = l.props[key];
      if (!p) return;
      const def = JSON.parse(JSON.stringify(PROP_DEFAULTS[key] ?? p.value));
      if (p.keyframes.length === 0) p.value = def;
      else setKeyframe(p, time, def, 'linear');
    });
  };

  const num = (key: string, label: string, step = 1, scrubPerPixel = 0.15, min?: number, max?: number) => {
    const p = layer.props[key];
    if (!p) return null;
    const v = evalProp(p, ctx) as number;
    const atKey = p.keyframes.some(k => Math.abs(k.time - time) < 1e-4);
    const animated = p.keyframes.length > 0;
    return (
      <div className="row" key={key}>
        <label>{label}{animated ? ' ●' : ''}</label>
        <NumberField
          value={round(v)}
          step={step} min={min} max={max}
          scrubPerPixel={scrubPerPixel}
          onChange={nv => assignNum(key, nv)}
        />
        <button
          className={'kfbtn ' + (atKey ? 'on' : animated ? 'animated' : '')}
          title={atKey ? 'Remove keyframe at playhead' : 'Add keyframe at playhead'}
          onClick={() => {
            useEditor.getState().commit();
            upd(l => {
              const prop = l.props[key];
              if (atKey) prop.keyframes = prop.keyframes.filter(k => Math.abs(k.time - time) > 1e-4);
              else setKeyframe(prop, time, v, 'linear');
            });
          }}
        >◆</button>
        <button className="kfbtn" title="Reset to default (at playhead)" onClick={() => resetProp(key)}>↺</button>
      </div>
    );
  };

  const rotProp = layer.props.rotation;
  const rotVal = evalProp(rotProp, ctx) as number;
  const rotAnimated = rotProp.keyframes.length > 0;
  const rotAtKey = rotProp.keyframes.some(k => Math.abs(k.time - time) < 1e-4);

  const setRotation = (nv: number) => assignNum('rotation', nv);

  const posX = (evalProp(layer.props.position, ctx) as any).x;
  const posY = (evalProp(layer.props.position, ctx) as any).y;
  const posAnimated = layer.props.position.keyframes.length > 0;
  const posAtKey = layer.props.position.keyframes.some(k => Math.abs(k.time - time) < 1e-4);

  const sclX = (evalProp(layer.props.scale, ctx) as any).x;
  const sclY = (evalProp(layer.props.scale, ctx) as any).y;
  const sclAnimated = layer.props.scale.keyframes.length > 0;
  const sclAtKey = layer.props.scale.keyframes.some(k => Math.abs(k.time - time) < 1e-4);

  const updateScale = (axis: 'x' | 'y', nv: number) => {
    upd(l => {
      const p = l.props.scale;
      const cur = evalProp(p, ctx) as any;
      const next = { ...cur };
      if (chainScale) {
        const ratio = cur.x === 0 ? 1 : cur.y / cur.x;
        if (axis === 'x') { next.x = nv; next.y = nv * ratio; }
        else { next.y = nv; next.x = nv / ratio; }
      } else {
        next[axis] = nv;
      }
      if (p.keyframes.length) setKeyframe(p, time, next, 'linear');
      else p.value = next;
    });
  };

  const shapeKindOptions = [
    { value: 'rect', label: 'Rectangle' },
    { value: 'ellipse', label: 'Ellipse' },
    { value: 'polygon', label: 'Polygon' },
    { value: 'star', label: 'Star' },
    { value: 'line', label: 'Line' },
  ];

  return (
    <section className="panel inspector-panel">
      <div className="panel-head">Inspector</div>
      <div className="insp-body">
        <div className="group">
          <div className="group-title">Layer</div>
          <div className="row">
            <label>Name</label>
            <input value={layer.name} onChange={e => upd(l => { l.name = e.target.value; })} />
          </div>
          <div className="row">
            <label>In / Out</label>
            <NumberField value={layer.inPoint} step={0.1} scrubPerPixel={0.02}
              onChange={v => upd(l => { l.inPoint = v; })} />
            <NumberField value={layer.outPoint} step={0.1} scrubPerPixel={0.02}
              onChange={v => upd(l => { l.outPoint = v; })} />
          </div>
          <div className="row">
            <label>Blend</label>
            <select value={layer.blendMode} onChange={e => upd(l => { l.blendMode = e.target.value as any; })}>
              {['source-over','multiply','screen','overlay','lighter','difference'].map(m =>
                <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="group">
          <div className="group-title">Transform</div>
          {num('opacity', 'Opacity', 0.01, 0.002, 0, 1)}

          <div className="row">
            <label>Rotation{rotAnimated ? ' ●' : ''}</label>
            <RotationDualFields value={rotVal} onChange={setRotation} />
            <button
              className={'kfbtn ' + (rotAtKey ? 'on' : rotAnimated ? 'animated' : '')}
              onClick={() => {
                useEditor.getState().commit();
                upd(l => {
                  const prop = l.props.rotation;
                  if (rotAtKey) prop.keyframes = prop.keyframes.filter(k => Math.abs(k.time - time) > 1e-4);
                  else setKeyframe(prop, time, rotVal, 'linear');
                });
              }}
            >◆</button>
            <button className="kfbtn" title="Reset" onClick={() => resetProp('rotation')}>↺</button>
          </div>

          <div className="row">
            <label>Position X{posAnimated ? ' ●' : ''}</label>
            <NumberField value={round(posX)} scrubPerPixel={0.15}
              onChange={v => assignVecAxis('position', 'x', v)} />
            <button
              className={'kfbtn chain ' + (chainPos ? 'on' : '')}
              title={chainPos ? 'Unlink Position X/Y' : 'Link Position X/Y'}
              onClick={() => setChainPos(c => !c)}
            ><LinkIcon linked={chainPos} /></button>
            <button
              className={'kfbtn ' + (posAtKey ? 'on' : posAnimated ? 'animated' : '')}
              onClick={() => {
                useEditor.getState().commit();
                upd(l => {
                  const p = l.props.position;
                  if (posAtKey) p.keyframes = p.keyframes.filter(k => Math.abs(k.time - time) > 1e-4);
                  else setKeyframe(p, time, evalProp(p, ctx) as any, 'linear');
                });
              }}
            >◆</button>
            <button className="kfbtn" title="Reset position" onClick={() => resetProp('position')}>↺</button>
          </div>
          <div className="row">
            <label>Position Y{posAnimated ? ' ●' : ''}</label>
            <NumberField value={round(posY)} scrubPerPixel={0.15}
              onChange={v => assignVecAxis('position', 'y', v)} />
            <span className="kf-spacer" />
            <button
              className={'kfbtn ' + (posAtKey ? 'on' : posAnimated ? 'animated' : '')}
              onClick={() => {
                useEditor.getState().commit();
                upd(l => {
                  const p = l.props.position;
                  if (posAtKey) p.keyframes = p.keyframes.filter(k => Math.abs(k.time - time) > 1e-4);
                  else setKeyframe(p, time, evalProp(p, ctx) as any, 'linear');
                });
              }}
            >◆</button>
            <button className="kfbtn" title="Reset position" onClick={() => resetProp('position')}>↺</button>
          </div>

          <div className="row">
            <label>Scale X{sclAnimated ? ' ●' : ''}</label>
            <NumberField value={round(sclX * 100) / 100} step={0.01} scrubPerPixel={0.002}
              onChange={v => updateScale('x', v)} />
            <button
              className={'kfbtn chain ' + (chainScale ? 'on' : '')}
              title={chainScale ? 'Unlink Scale X/Y' : 'Link Scale X/Y'}
              onClick={() => setChainScale(c => !c)}
            ><LinkIcon linked={chainScale} /></button>
            <button
              className={'kfbtn ' + (sclAtKey ? 'on' : sclAnimated ? 'animated' : '')}
              onClick={() => {
                useEditor.getState().commit();
                upd(l => {
                  const p = l.props.scale;
                  if (sclAtKey) p.keyframes = p.keyframes.filter(k => Math.abs(k.time - time) > 1e-4);
                  else setKeyframe(p, time, evalProp(p, ctx) as any, 'linear');
                });
              }}
            >◆</button>
            <button className="kfbtn" title="Reset scale" onClick={() => resetProp('scale')}>↺</button>
          </div>
          <div className="row">
            <label>Scale Y{sclAnimated ? ' ●' : ''}</label>
            <NumberField value={round(sclY * 100) / 100} step={0.01} scrubPerPixel={0.002}
              onChange={v => updateScale('y', v)} />
            <span className="kf-spacer" />
            <button
              className={'kfbtn ' + (sclAtKey ? 'on' : sclAnimated ? 'animated' : '')}
              onClick={() => {
                useEditor.getState().commit();
                upd(l => {
                  const p = l.props.scale;
                  if (sclAtKey) p.keyframes = p.keyframes.filter(k => Math.abs(k.time - time) > 1e-4);
                  else setKeyframe(p, time, evalProp(p, ctx) as any, 'linear');
                });
              }}
            >◆</button>
            <button className="kfbtn" title="Reset scale" onClick={() => resetProp('scale')}>↺</button>
          </div>
        </div>

        {(layer.type === 'shape' || layer.type === 'solid') && layer.shape && (
          <div className="group">
            <div className="group-title">{layer.type === 'solid' ? 'Solid' : 'Shape'}</div>

            {layer.type === 'shape' && (
              <div className="row">
                <label>Kind</label>
                <select
                  value={layer.shape.kind}
                  onChange={e => {
                    const k = e.target.value as any;
                    useEditor.getState().commit();
                    upd(l => {
                      l.shape = {
                        ...l.shape!,
                        ...SHAPE_DEFAULTS[k as keyof typeof SHAPE_DEFAULTS],
                        kind: k,
                      };
                    });
                  }}
                >
                  {shapeKindOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}

            {(layer.shape.kind === 'polygon' || layer.shape.kind === 'star') && (
              <div className="row">
                <label>Sides</label>
                <NumberField value={layer.shape.sides} min={3} max={24} scrubPerPixel={0.02}
                  onChange={v => upd(l => { l.shape!.sides = Math.round(v); })} />
              </div>
            )}

            <div className="row">
              <label>Width</label>
              <NumberField value={layer.shape.w} scrubPerPixel={0.15}
                onChange={v => upd(l => { l.shape!.w = v; })} />
            </div>
            {layer.shape.kind !== 'line' && (
              <div className="row">
                <label>Height</label>
                <NumberField value={layer.shape.h} scrubPerPixel={0.15}
                  onChange={v => upd(l => { l.shape!.h = v; })} />
              </div>
            )}
            {layer.shape.kind === 'rect' && (
              <div className="row">
                <label>Radius</label>
                <NumberField value={layer.shape.radius} scrubPerPixel={0.1}
                  onChange={v => upd(l => { l.shape!.radius = v; })} />
              </div>
            )}
            {layer.shape.kind === 'star' && (
              <div className="row">
                <label>Inner %</label>
                <NumberField value={layer.shape.radius} min={5} max={95} scrubPerPixel={0.06}
                  onChange={v => upd(l => { l.shape!.radius = v; })} />
              </div>
            )}

            {layer.shape.kind !== 'line' && (
              <div className="row">
                <label>Fill</label>
                <input type="checkbox" checked={layer.shape.fillOn}
                  onChange={e => upd(l => { l.shape!.fillOn = e.target.checked; })} />
                <input type="color" value={layer.shape.fill}
                  onChange={e => upd(l => { l.shape!.fill = e.target.value; })} />
              </div>
            )}

            <div className="row">
              <label>Stroke</label>
              <input type="checkbox" checked={layer.shape.strokeOn}
                onChange={e => upd(l => { l.shape!.strokeOn = e.target.checked; })} />
              <input type="color" value={layer.shape.stroke}
                onChange={e => upd(l => { l.shape!.stroke = e.target.value; })} />
              <NumberField value={layer.shape.strokeWidth} min={0} scrubPerPixel={0.03}
                onChange={v => upd(l => { l.shape!.strokeWidth = v; })}
                style={{ maxWidth: 60 }} />
            </div>
          </div>
        )}

        {layer.type === 'text' && layer.text && (
          <div className="group">
            <div className="group-title">Text</div>
            <div className="row">
              <label>Content</label>
              <textarea value={layer.text.content}
                onChange={e => upd(l => { l.text!.content = e.target.value; })} />
            </div>
            <div className="row">
              <label>Size</label>
              <NumberField value={layer.text.fontSize} scrubPerPixel={0.1}
                onChange={v => upd(l => { l.text!.fontSize = v; })} />
            </div>
            <div className="row">
              <label>Reveal</label>
              <NumberField
                value={round(evalProp(layer.props.reveal ?? { value: 1, keyframes: [] }, ctx) as number)}
                min={0} max={1} step={0.01} scrubPerPixel={0.002}
                onChange={v => {
                  upd(l => {
                    const p = l.props.reveal ?? (l.props.reveal = { value: 1, keyframes: [] });
                    if (p.keyframes.length) setKeyframe(p, time, v, 'linear');
                    else p.value = v;
                  });
                }}
              />
              <button
                className="kfbtn" title="Keyframe reveal"
                onClick={() => {
                  useEditor.getState().commit();
                  upd(l => {
                    const p = l.props.reveal ?? (l.props.reveal = { value: 1, keyframes: [] });
                    const atKey = p.keyframes.some(k => Math.abs(k.time - time) < 1e-4);
                    if (atKey) p.keyframes = p.keyframes.filter(k => Math.abs(k.time - time) > 1e-4);
                    else setKeyframe(p, time, p.value, 'linear');
                  });
                }}
              >◆</button>
              <button className="kfbtn" title="Reset reveal" onClick={() => resetProp('reveal')}>↺</button>
            </div>
            <div className="row">
              <label>Fill</label>
              <input type="color" value={layer.text.fill}
                onChange={e => upd(l => { l.text!.fill = e.target.value; })} />
            </div>
          </div>
        )}

        <EffectsSection layer={layer} />

        <ExprSection layer={layer} />

        <div className="group">
          <div className="group-title">Presets</div>
          <div className="row">
            <button className="btn" onClick={() => {
              const name = prompt('Preset name?', layer.name);
              if (!name) return;
              const p = presetFromLayer(layer, name, 'Favorites');
              useEditor.getState().addPreset(p);
            }}>Save layer preset</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ExprSection({ layer }: { layer: Layer }) {
  const { time, project } = useEditor();
  const [key, setKey] = React.useState<string>('position');
  const prop = layer.props[key] ?? { value: 0, keyframes: [] };
  const [src, setSrc] = React.useState(prop.expression ?? '');
  const [on, setOn] = React.useState(!!prop.expressionOn);

  React.useEffect(() => {
    const p = layer.props[key] ?? { value: 0, keyframes: [] };
    setSrc(p.expression ?? '');
    setOn(!!p.expressionOn);
  }, [layer.id, key]);

  const commit = (nextSrc: string, nextOn: boolean) => {
    useEditor.getState().updateLayer(layer.id, l => {
      const p = l.props[key];
      if (!p) return;
      p.expression = nextSrc || undefined;
      p.expressionOn = nextOn;
    });
  };

  let error = '';
  try {
    if (on && src) {
      evalProp(
        { ...prop, expression: src, expressionOn: true } as any,
        { time, layer, comp: project }
      );
    }
  } catch (e: any) { error = e.message; }

  return (
    <div className="group">
      <div className="group-title">Expression</div>
      <div className="row">
        <label>Property</label>
        <select value={key} onChange={e => setKey(e.target.value)}>
          {Object.keys(layer.props).map(k => <option key={k}>{k}</option>)}
        </select>
        <label className="chk">
          <input
            type="checkbox" checked={on}
            onChange={e => { const next = e.target.checked; setOn(next); commit(src, next); }}
          /> on
        </label>
      </div>
      <textarea
        className="expr" placeholder="wiggle(3, 20)"
        value={src} onChange={e => setSrc(e.target.value)}
      />
      <div className="row" style={{ marginTop: 4 }}>
        <button className="btn sm" onClick={() => commit(src, on)}>Apply</button>
        <span style={{ color: 'var(--fg-1)', fontSize: 10 }}>
          wiggle(3, 20) · value + Math.sin(time*5)*30
        </span>
      </div>
      {error && <div className="err">{error}</div>}
    </div>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;