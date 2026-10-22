/**
 * Windows File Explorer selection rules for the file library list.
 *
 * Keys are opaque strings ("file:<id>" / "folder:<id>"). `ordered` is the list
 * exactly as it is shown (after search, filters and sort), so ranges follow
 * what the user sees.
 */
export interface ExplorerSelection {
  keys: ReadonlySet<string>;
  /** Where a Shift range starts. */
  anchor: string | null;
  /** The row with keyboard focus; the preview pane shows it. */
  focus: string | null;
}

export const EMPTY_SELECTION: ExplorerSelection = { keys: new Set(), anchor: null, focus: null };

export function singleSelection(key: string): ExplorerSelection {
  return { keys: new Set([key]), anchor: key, focus: key };
}

function range(ordered: readonly string[], from: string, to: string): string[] {
  const start = ordered.indexOf(from);
  const end = ordered.indexOf(to);
  if (start < 0 || end < 0) return [to];
  return ordered.slice(Math.min(start, end), Math.max(start, end) + 1);
}

/** Click, Ctrl+click (toggle) and Shift+click (range; Ctrl+Shift adds the range). */
export function clickSelection(
  current: ExplorerSelection,
  ordered: readonly string[],
  key: string,
  { toggle = false, extend = false }: { toggle?: boolean; extend?: boolean } = {},
): ExplorerSelection {
  if (extend) {
    const anchor = current.anchor && ordered.includes(current.anchor) ? current.anchor : key;
    const keys = new Set(toggle ? current.keys : []);
    for (const item of range(ordered, anchor, key)) keys.add(item);
    return { keys, anchor, focus: key };
  }
  if (toggle) {
    const keys = new Set(current.keys);
    if (keys.has(key)) keys.delete(key);
    else keys.add(key);
    return { keys, anchor: key, focus: key };
  }
  return singleSelection(key);
}

export type SelectionMove = "next" | "previous" | "first" | "last";

/** Arrow keys, Home and End; Shift extends from the anchor. */
export function moveSelection(
  current: ExplorerSelection,
  ordered: readonly string[],
  move: SelectionMove,
  { extend = false }: { extend?: boolean } = {},
): ExplorerSelection {
  if (ordered.length === 0) return EMPTY_SELECTION;
  const index = current.focus ? ordered.indexOf(current.focus) : -1;
  const target = move === "first"
    ? 0
    : move === "last"
      ? ordered.length - 1
      : index < 0
        ? (move === "next" ? 0 : ordered.length - 1)
        : Math.max(0, Math.min(ordered.length - 1, index + (move === "next" ? 1 : -1)));
  const key = ordered[target];
  if (!extend) return singleSelection(key);
  const anchor = current.anchor && ordered.includes(current.anchor) ? current.anchor : current.focus && ordered.includes(current.focus) ? current.focus : key;
  return { keys: new Set(range(ordered, anchor, key)), anchor, focus: key };
}

export function selectAll(current: ExplorerSelection, ordered: readonly string[]): ExplorerSelection {
  if (ordered.length === 0) return EMPTY_SELECTION;
  const focus = current.focus && ordered.includes(current.focus) ? current.focus : ordered[0];
  return { keys: new Set(ordered), anchor: ordered[0], focus };
}

/** Right-click keeps a multi-selection when the item is part of it, like Explorer. */
export function contextSelection(current: ExplorerSelection, key: string): ExplorerSelection {
  if (current.keys.has(key)) return { ...current, focus: key };
  return singleSelection(key);
}

/** Drops keys that are no longer listed (deleted, filtered out or moved away). */
export function pruneSelection(current: ExplorerSelection, ordered: readonly string[]): ExplorerSelection {
  const visible = new Set(ordered);
  const keys = [...current.keys].filter((key) => visible.has(key));
  const anchor = current.anchor && visible.has(current.anchor) ? current.anchor : null;
  const focus = current.focus && visible.has(current.focus) ? current.focus : null;
  if (keys.length === current.keys.size && anchor === current.anchor && focus === current.focus) return current;
  return { keys: new Set(keys), anchor, focus };
}

/** Type-ahead: the next name after the focused row that starts with the typed text. */
export function typeAheadMatch(
  ordered: readonly { key: string; name: string }[],
  focus: string | null,
  typed: string,
): string | null {
  const needle = typed.normalize("NFKC").toLocaleLowerCase();
  if (!needle || ordered.length === 0) return null;
  const start = Math.max(0, ordered.findIndex((item) => item.key === focus));
  // A repeated single letter cycles to the next match; longer text keeps the current row when it still matches.
  const offset = needle.length === 1 ? 1 : 0;
  for (let step = 0; step < ordered.length; step += 1) {
    const item = ordered[(start + offset + step) % ordered.length];
    if (item.name.normalize("NFKC").toLocaleLowerCase().startsWith(needle)) return item.key;
  }
  return null;
}
