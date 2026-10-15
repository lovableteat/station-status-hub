import { MAX_DRAWIO_BYTES } from "./drawioDocument.ts";

export const DRAWIO_ORIGIN = "https://embed.diagrams.net";
export function drawioEditorUrl(dark: boolean): string {
  const url = new URL("/", DRAWIO_ORIGIN);
  const parameters = { embed: "1", proto: "json", spin: "1", configure: "1", libraries: "1", libs: "general;basic;arrows2;flowchart;electrical", lang: "zh-tw", ui: dark ? "dark" : "kennedy", local: "1", drafts: "0", stealth: "1", plugins: "0", noExitBtn: "1", suppressNewWindows: "1" };
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
}

export interface DrawioMessage { event: "configure" | "init" | "load" | "autosave" | "save" | "export"; xml?: string; format?: string; message?: { requestId?: string }; error?: string }
/** Only the active official frame may update the host document. XML is never rendered by the host. */
export function readDrawioMessage(event: Pick<MessageEvent, "origin" | "source" | "data">, frame: Window | null): DrawioMessage | null {
  if (!frame || event.origin !== DRAWIO_ORIGIN || event.source !== frame || typeof event.data !== "string" || event.data.length > MAX_DRAWIO_BYTES * 2 + 16384) return null;
  try {
    const value = JSON.parse(event.data);
    if (!value || typeof value !== "object" || Array.isArray(value) || !["configure", "init", "load", "autosave", "save", "export"].includes(value.event)) return null;
    if (value.xml !== undefined && (typeof value.xml !== "string" || value.xml.length > MAX_DRAWIO_BYTES)) return null;
    return value as DrawioMessage;
  } catch { return null; }
}
