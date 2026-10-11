import type { Project } from '../core/types';

export interface History { past: Project[]; future: Project[]; }

export function pushHistory(h: History, snapshot: Project, limit = 100): History {
  const past = [...h.past, JSON.parse(JSON.stringify(snapshot))];
  if (past.length > limit) past.shift();
  return { past, future: [] };
}

export function undo(h: History, current: Project) {
  if (h.past.length === 0) return null;
  const prev = h.past[h.past.length - 1];
  return {
    history: {
      past: h.past.slice(0, -1),
      future: [JSON.parse(JSON.stringify(current)), ...h.future],
    },
    project: prev,
  };
}

export function redo(h: History, current: Project) {
  if (h.future.length === 0) return null;
  const next = h.future[0];
  return {
    history: {
      past: [...h.past, JSON.parse(JSON.stringify(current))],
      future: h.future.slice(1),
    },
    project: next,
  };
}