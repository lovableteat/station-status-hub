export type DiagramAppearance = "light" | "dark";

/** Portable exports intentionally retain a light page, independently of editor appearance. */
export const DIAGRAM_THEME = {
  canvas: "#ffffff",
  text: "#1f2937",
  detail: "#526171",
  labelBackground: "#ffffff",
} as const;

const DARK_DIAGRAM_THEME = {
  canvas: "#1c1c1e",
  text: "#f5f5f7",
  detail: "#b6bcc6",
  labelBackground: "#2c2c2e",
} as const;

export function diagramTheme(mode: DiagramAppearance = "light") {
  return mode === "dark"
    ? { ...DARK_DIAGRAM_THEME, grid: "#444448" }
    : { ...DIAGRAM_THEME, grid: "#c6cdd1" };
}

export const DIAGRAM_APPEARANCE_KEY = "autocheck-diagram-appearance";

function browserStorage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; }
  catch { return null; }
}

/** Appearance belongs to this browser, never to a saved diagram or its undo history. */
export function readDiagramAppearance(storage: Pick<Storage, "getItem"> | null = browserStorage()): DiagramAppearance {
  try { return storage?.getItem(DIAGRAM_APPEARANCE_KEY) === "light" ? "light" : "dark"; }
  catch { return "dark"; }
}

export function writeDiagramAppearance(mode: DiagramAppearance, storage: Pick<Storage, "setItem"> | null = browserStorage()): void {
  try { storage?.setItem(DIAGRAM_APPEARANCE_KEY, mode); }
  catch { /* The current appearance still works when browser storage is unavailable. */ }
}

function channels(color: string): number[] {
  return [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
}

function blend(color: string, toward: string, amount: number): string {
  const destination = channels(toward);
  return `#${channels(color).map((value, index) => Math.round(value + (destination[index] - value) * amount).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(color: string): number {
  const linear = channels(color).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

/** Retain the chosen hue while keeping even white/yellow connections visible. */
export function diagramStrokeColor(color: string, mode: DiagramAppearance = "light"): string {
  const dark = mode === "dark";
  const threshold = dark ? 0.32 : 0.25;
  const sufficient = (value: number) => dark ? value >= threshold : value <= threshold;
  if (sufficient(luminance(color))) return color.toLowerCase();
  const destination = dark ? "#c1dcff" : "#233542";
  let low = 0, high = 1;
  for (let step = 0; step < 12; step++) {
    const amount = (low + high) / 2;
    if (!sufficient(luminance(blend(color, destination, amount)))) low = amount;
    else high = amount;
  }
  return blend(color, destination, high);
}

export function diagramNodeColors(color: string, mode: DiagramAppearance = "light") {
  const theme = diagramTheme(mode);
  return {
    fill: blend(color, theme.canvas, mode === "dark" ? 0.84 : 0.88),
    stroke: diagramStrokeColor(color, mode),
    text: theme.text,
    detail: theme.detail,
  };
}
