import React, { useState } from 'react';
import { useEditor } from '../../state/store';
import { evalProp } from '../../core/expression';
import { setKeyframe } from '../../core/prop';
import { EFFECT_DEFS, makeEffect, type EffectKind } from '../../core/effects';
import { presetFromEffect } from '../../core/presets';
import NumberField from '../widgets/NumberField';
import type { Effect, Layer } from '../../core/types';

export default function EffectsSection({ layer }: { layer: Layer }) {
  const { project, time } = useEditor();
  const ctx = { time, layer, comp: project };
  const upd = (fn: (l: Layer) => void) => useEditor.getState().updateLayer(layer.id, fn);

  const addEffect = (kind: EffectKind) => {
    useEditor.getState().commit();
    upd(l => { l.effects = [...l.effects, makeEffect(kind)]; });
  };

  const availableKinds: EffectKind[] = ['blur', 'glow', 'dropShadow', 'colorCorrect'];

  return (
    <div className="group">
      <div className="group-title">Effects</div>

      <div className="row">
        <label>Add</label>
        <select
          value=""
          onChange={e => {
            const v = e.target.value as EffectKind;
            if (v) addEffect(v);
            e.target.value = '';
          }}
        >
          <option value="">— choose effect —</option>
          {availableKinds.map(k => (
            <option key={k} value={k}>{EFFECT_DEFS[k].label}</option>
          ))}
        </select>
      </div>

      {layer.effects.length === 0 && (
        <div style={{ color: 'var(--fg-1)', fontSize: 10, padding: '4px 0' }}>
          No effects. Add one above.
        </div>
      )}

      {layer.effects.map(effect => (
        <EffectRow key={effect.id} effect={effect} layer={layer} ctx={ctx} />
      ))}
    </div>
  );
}

function EffectRow({ effect, layer, ctx }: { effect: Effect; layer: Layer; ctx: any }) {
  const [open, setOpen] = useState(true);
  const def = EFFECT_DEFS[effect.type];
  const upd = (fn: (l: Layer) => void) => useEditor.getState().updateLayer(layer.id, fn);

  const updateParam = (key: string, value: number | string, isColor: boolean) => {
    upd(l => {
      const e = l.effects.find(x => x.id === effect.id);
      if (!e) return;
      const p = e.params[key];
      if (!p) return;
      if (p.keyframes.length && !isColor) {
        setKeyframe(p, ctx.time, value, 'linear');
      } else {
        p.value = value;
      }
    });
  };

  const toggleKeyframe = (key: string) => {
    useEditor.getState().commit();
    upd(l => {
      const e = l.effects.find(x => x.id === effect.id);
      if (!e) return;
      const p = e.params[key];
      if (!p) return;
      const atKey = p.keyframes.some((k: any) => Math.abs(k.time - ctx.time) < 1e-4);
      if (atKey) {
        p.keyframes = p.keyframes.filter((k: any) => Math.abs(k.time - ctx.time) > 1e-4);
      } else {
        setKeyframe(p, ctx.time, p.value, 'linear');
      }
    });
  };

  const resetParam = (key: string, isColor: boolean) => {
    useEditor.getState().commit();
    upd(l => {
      const e = l.effects.find(x => x.id === effect.id);
      if (!e) return;
      const p = e.params[key];
      if (!p) return;
      const spec = def.defaults[key];
      const defVal = spec.value;
      if (p.keyframes.length && !isColor) {
        setKeyframe(p, ctx.time, defVal as number, 'linear');
      } else {
        p.value = isColor ? (defVal as string) : (defVal as number);
      }
    });
  };

  return (
    <div className="effect-row">
      <div className="effect-head">
        <span className="chevron" onClick={() => setOpen(o => !o)}>{open ? '▼' : '▶'}</span>
        <input
          type="checkbox"
          checked={effect.enabled}
          onChange={e => upd(l => {
            const x = l.effects.find(y => y.id === effect.id);
            if (x) x.enabled = e.target.checked;
          })}
        />
        <span className="effect-name">{def.label}</span>
        <div className="spacer" />
        <button
          className="btn sm"
          title="Save as preset"
          onClick={() => {
            const name = prompt('Preset name?', def.label);
            if (!name) return;
            useEditor.getState().addPreset(presetFromEffect(effect, name, 'Favorites'));
          }}
        >★</button>
        <button
          className="btn sm"
          title="Delete effect"
          onClick={() => {
            useEditor.getState().commit();
            upd(l => { l.effects = l.effects.filter(x => x.id !== effect.id); });
          }}
        >×</button>
      </div>

      {open && (
        <div className="effect-body">
          {Object.entries(def.defaults).map(([key, spec]) => {
            const prop = effect.params[key];
            if (!prop) return null;

            if (spec.kind === 'color') {
              const v = evalProp(prop, ctx) as string;
              return (
                <div className="row" key={key}>
                  <label>{key}</label>
                  <input
                    type="color"
                    value={v}
                    onChange={e => updateParam(key, e.target.value, true)}
                  />
                  <button className="kfbtn" title="Reset" onClick={() => resetParam(key, true)}>↺</button>
                </div>
              );
            }

            const v = evalProp(prop, ctx) as number;
            const atKey = prop.keyframes.some((k: any) => Math.abs(k.time - ctx.time) < 1e-4);
            const animated = prop.keyframes.length > 0;
            return (
              <div className="row" key={key}>
                <label>{key}{animated ? ' ●' : ''}</label>
                <NumberField
                  value={Math.round(v * 100) / 100}
                  step={spec.step ?? 0.1}
                  min={spec.min}
                  max={spec.max}
                  onChange={nv => updateParam(key, nv, false)}
                />
                <button
                  className={'kfbtn ' + (atKey ? 'on' : animated ? 'animated' : '')}
                  onClick={() => toggleKeyframe(key)}
                  title={atKey ? 'Remove keyframe' : 'Add keyframe'}
                >◆</button>
                <button className="kfbtn" title="Reset" onClick={() => resetParam(key, false)}>↺</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}