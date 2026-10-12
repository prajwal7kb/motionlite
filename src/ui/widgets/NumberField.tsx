import React from 'react';

export interface NumberFieldProps {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  style?: React.CSSProperties;
  /**
   * Value change per pixel of horizontal drag.
   * Defaults are chosen to feel natural per typical field range:
   * - Small numbers (opacity, scale): very small rate
   * - Medium (rotation, width): moderate
   * - Large (position): larger
   */
  scrubPerPixel?: number;
}

export default function NumberField({
  value,
  onChange,
  step = 1,
  min,
  max,
  style,
  scrubPerPixel = 0.5,
}: NumberFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [draft, setDraftState] = React.useState<string | null>(null);
  const [focused, setFocused] = React.useState(false);

  // Drafts in a ref so onBlur can read the latest synchronous value
  const draftRef = React.useRef<string | null>(null);
  const setDraft = (v: string | null) => {
    draftRef.current = v;
    setDraftState(v);
  };

  // Value at focus time — Escape reverts to this
  const focusedValueRef = React.useRef<number>(value);

  const scrubRef = React.useRef<{
    startX: number;
    startValue: number;
    moved: boolean;
  } | null>(null);

  const clamp = (n: number) => {
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };

  const commit = (n: number) => {
    if (isNaN(n)) return;
    onChange(clamp(n));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    if (document.activeElement === inputRef.current) return;
    e.preventDefault();
    scrubRef.current = {
      startX: e.clientX,
      startValue: value,
      moved: false,
    };
    (e.target as HTMLInputElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLInputElement>) => {
    const s = scrubRef.current;
    if (!s) return;
    const dx = e.clientX - s.startX;
    if (!s.moved && Math.abs(dx) < 3) return;
    s.moved = true;
    let rate = scrubPerPixel;
    if (e.shiftKey) rate *= 0.1;
    else if (e.ctrlKey || e.metaKey) rate *= 10;
    commit(s.startValue + dx * rate);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLInputElement>) => {
    const s = scrubRef.current;
    scrubRef.current = null;
    try { (e.target as HTMLInputElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    if (s && !s.moved) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  const display = focused && draft !== null ? draft : String(round(value));

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={display}
      style={{
        ...style,
        cursor: focused ? 'text' : 'ew-resize',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onFocus={() => {
        setFocused(true);
        focusedValueRef.current = value;
      }}
      onBlur={() => {
        setFocused(false);
        const d = draftRef.current;
        if (d !== null) {
          const n = parseFloat(d);
          if (!isNaN(n)) commit(n);
          setDraft(null);
        }
      }}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          const n = parseFloat(draftRef.current ?? '');
          if (!isNaN(n)) commit(n);
          setDraft(null);
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
          // Revert to the value that was present when we focused
          setDraft(null);
          onChange(focusedValueRef.current);
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const dir = e.key === 'ArrowUp' ? 1 : -1;
          const mult = e.shiftKey ? 10 : e.ctrlKey || e.metaKey ? 0.1 : 1;
          commit(value + dir * step * mult);
        }
      }}
    />
  );
}

const round = (n: number) => Math.round(n * 100) / 100;