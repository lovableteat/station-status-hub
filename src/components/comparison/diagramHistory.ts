import type { DiagramDocument } from "./diagramModel.ts";

export interface DiagramHistory {
  past: DiagramDocument[];
  present: DiagramDocument;
  future: DiagramDocument[];
}

export function diagramHistory(document: DiagramDocument): DiagramHistory {
  return { past: [], present: document, future: [] };
}

export function editDiagram(history: DiagramHistory, next: DiagramDocument, before = history.present): DiagramHistory {
  if (JSON.stringify(before) === JSON.stringify(next)) return { ...history, present: next };
  return { past: [...history.past.slice(-49), before], present: next, future: [] };
}

export function undoDiagram(history: DiagramHistory): DiagramHistory {
  if (!history.past.length) return history;
  return { past: history.past.slice(0, -1), present: history.past.at(-1)!, future: [history.present, ...history.future] };
}

export function redoDiagram(history: DiagramHistory): DiagramHistory {
  if (!history.future.length) return history;
  return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) };
}
