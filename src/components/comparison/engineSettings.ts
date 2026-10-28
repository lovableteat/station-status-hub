/** Where 比對系統 runs the AutoCheck engine: in this browser (default) or on a server running server/autocheck_api. */
export type EngineMode = "browser" | "server";
export interface EngineSettings { mode: EngineMode; url: string; token: string }

export const ENGINE_SETTINGS_KEY = "comparison.engine.v1";
const TOKEN_LIMIT = 512;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function safeStorage(): StorageLike | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; }
  catch { return null; }
}

/** Trims and validates a server base URL; returns "" for blank input. */
export function normalizeEngineUrl(value: string): string {
  const url = value.trim().replace(/\/+$/, "");
  if (!url) return "";
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { throw new Error("伺服器位址格式不正確，例如 http://autocheck.local:8000"); }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("伺服器位址必須以 http:// 或 https:// 開頭");
  if (parsed.search || parsed.hash || parsed.username || parsed.password) throw new Error("伺服器位址只填主機與路徑，不含帳號或查詢字串");
  return url;
}

export function engineHost(url: string): string {
  try { return new URL(url).host; }
  catch { return url; }
}

/** The build can preset a server (VITE_AUTOCHECK_API); a browser-level choice saved on this computer wins over it. */
export function defaultEngineSettings(): EngineSettings {
  let url = "";
  try { url = normalizeEngineUrl(String((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_AUTOCHECK_API ?? "")); }
  catch { url = ""; }
  return { mode: url ? "server" : "browser", url, token: "" };
}

export function readEngineSettings(storage: StorageLike | null = safeStorage()): EngineSettings {
  const fallback = defaultEngineSettings();
  try {
    const raw = storage?.getItem(ENGINE_SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<EngineSettings> | null;
    if (!parsed || typeof parsed !== "object") return fallback;
    const url = typeof parsed.url === "string" ? normalizeEngineUrl(parsed.url) : "";
    const token = typeof parsed.token === "string" && parsed.token.length <= TOKEN_LIMIT ? parsed.token : "";
    const mode: EngineMode = parsed.mode === "server" && url ? "server" : "browser";
    return { mode, url, token };
  } catch { return fallback; }
}

export function writeEngineSettings(settings: EngineSettings, storage: StorageLike | null = safeStorage()): void {
  try { storage?.setItem(ENGINE_SETTINGS_KEY, JSON.stringify({ mode: settings.mode, url: settings.url, token: settings.token })); }
  catch { /* storage unavailable: the choice lasts for this page only */ }
}
