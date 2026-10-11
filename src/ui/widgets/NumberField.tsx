import React from 'react';

export interface NumberFieldProps {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  style?: React.CSSProperties;
}

/**
 * Number input that lets the user type intermediate states like "-", "-.", "1."
 * without wiping the field. Only commits when the string parses to a real number.
 */
export default function NumberField({ value, onChange, step = 1, min, max, style }: NumberFieldProps) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const display = draft !== null ? draft : String(round(value));

  return (
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      style={style}
      value={display}
      onChange={e => {
        const raw = e.target.value;
        setDraft(raw);
        const n = parseFloat(raw);
        if (!isNaN(n)) {
          let v = n;
          if (min !== undefined) v = Math.max(min, v);
          if (max !== undefined) v = Math.min(max, v);
          onChange(v);
        }
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          setDraft(null);
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
          setDraft(null);
        }
      }}
    />
  );
}

const round = (n: number) => Math.round(n * 100) / 100;