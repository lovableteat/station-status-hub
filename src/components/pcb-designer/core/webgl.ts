export type WebglContextKind = "webgl2" | "webgl";
export type WebglContextFactory = (kind: WebglContextKind) => unknown;

export function hasWebglSupport(createContext: WebglContextFactory): boolean {
  for (const kind of ["webgl2", "webgl"] as const) {
    try {
      if (createContext(kind)) return true;
    } catch {
      // Browsers can throw when graphics acceleration is disabled.
    }
  }
  return false;
}

export function detectWebglSupport(): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  return hasWebglSupport((kind) => canvas.getContext(kind));
}
