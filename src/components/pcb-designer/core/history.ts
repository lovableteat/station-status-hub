export interface HistoryState<T> {
  current: T;
  undo: T[];
  redo: T[];
}

const MAX_TRANSACTIONS = 100;

function snapshot<T>(value: T): T {
  return structuredClone(value);
}

export function createHistoryState<T>(initial: T): HistoryState<T> {
  return { current: snapshot(initial), undo: [], redo: [] };
}

export function pushHistory<T>(state: HistoryState<T>, next: T): HistoryState<T> {
  return {
    current: snapshot(next),
    undo: [...state.undo, snapshot(state.current)].slice(-MAX_TRANSACTIONS),
    redo: [],
  };
}

export function undoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  const previous = state.undo.at(-1);
  if (previous === undefined) {
    return { current: snapshot(state.current), undo: state.undo.map(snapshot), redo: state.redo.map(snapshot) };
  }

  return {
    current: snapshot(previous),
    undo: state.undo.slice(0, -1).map(snapshot),
    redo: [snapshot(state.current), ...state.redo.map(snapshot)],
  };
}

export function redoHistory<T>(state: HistoryState<T>): HistoryState<T> {
  const next = state.redo[0];
  if (next === undefined) {
    return { current: snapshot(state.current), undo: state.undo.map(snapshot), redo: state.redo.map(snapshot) };
  }

  return {
    current: snapshot(next),
    undo: [...state.undo.map(snapshot), snapshot(state.current)].slice(-MAX_TRANSACTIONS),
    redo: state.redo.slice(1).map(snapshot),
  };
}
