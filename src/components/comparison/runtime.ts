/** The page talks to the AutoCheck engine through this interface, whether it runs in a worker here or on a server. */
export interface EngineRuntime {
  readonly generation: number;
  request<T>(type: string, payload: unknown, progress?: (message: string) => void): Promise<T>;
  cancel(message?: string): void;
}

/** Same limits as autocheck.worker.js and server/autocheck_api. */
export const ENGINE_LIMITS = { count: 1000, file: 64 * 1024 * 1024, total: 128 * 1024 * 1024 };
const LIMIT_MESSAGE = "輸入超過限制（1000 個檔案、單檔 64 MiB、總計 128 MiB）";
const TEXT_LIMIT = 2 * 1024 * 1024;
const TIMEOUT = 600_000;

export class ComparisonRuntime implements EngineRuntime {
  private cancellationGeneration = 0;
  get generation(): number { return this.cancellationGeneration; }
  private worker: Worker | null = null;
  private nextId = 0;
  private pending = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void; progress?: (message: string) => void; timeout: ReturnType<typeof setTimeout> }>();

  request<T>(type: string, payload: unknown, progress?: (message: string) => void): Promise<T> {
    if (!this.worker) {
      this.worker = new Worker(`${import.meta.env.BASE_URL}comparison/autocheck.worker.js?revision=2026-10-27`);
      this.worker.onmessage = ({ data }) => {
        const pending = this.pending.get(data.id);
        if (!pending) return;
        if (data.type === "progress") { pending.progress?.(data.message); return; }
        clearTimeout(pending.timeout);
        this.pending.delete(data.id);
        if (data.type === "error") pending.reject(new Error(data.message || "比對引擎執行失敗"));
        else pending.resolve(data.result);
      };
      this.worker.onerror = event => this.cancel(event.message || "無法載入比對引擎，請檢查網路後重試");
      this.worker.onmessageerror = () => this.cancel("比對結果傳輸失敗，請重試");
    }
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => this.cancel("執行超過 10 分鐘，已停止；請縮小輸入或重新執行"), TIMEOUT);
      this.pending.set(id, { resolve: value => resolve(value as T), reject, progress, timeout });
      try { this.worker!.postMessage({ id, type, payload }); }
      catch (error) { clearTimeout(timeout); this.pending.delete(id); reject(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  cancel(message = "已取消執行"): void {
    ++this.cancellationGeneration;
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(new Error(message)); }
    this.pending.clear();
  }
}

function validPath(path: unknown): string {
  // Same rules as the worker and the server; the server writes these under a temporary folder.
  if (typeof path !== "string" || !path || path.length > 4096 || Array.from(path).some(char => char === ":" || char.charCodeAt(0) < 32)) throw new Error("檔案路徑無效");
  const normalized = path.replaceAll("\\", "/").normalize("NFC");
  if (normalized.split("/").some(part => !part || part === "." || part === "..")) throw new Error("檔案路徑不可包含絕對路徑或上層目錄");
  return normalized;
}

export interface EncodedRequest { form: FormData; count: number; bytes: number }

/** Turns a worker payload into a multipart form: file bytes become parts f0, f1, … and the JSON keeps {path, part} references. */
export function encodeRequest(type: string, payload: unknown): EncodedRequest {
  if (!payload || typeof payload !== "object") throw new Error("工作內容格式無效");
  const form = new FormData();
  const totals = { count: 0, bytes: 0 };
  let parts = 0;
  const account = (size: number, single = true) => {
    totals.count += 1; totals.bytes += size;
    if ((single && size > ENGINE_LIMITS.file) || totals.bytes > ENGINE_LIMITS.total || totals.count > ENGINE_LIMITS.count) throw new Error(LIMIT_MESSAGE);
  };
  const attach = (bytes: ArrayBuffer, name: string) => { const part = `f${parts++}`; form.append(part, new Blob([bytes]), name); return part; };
  const files = (list: unknown) => {
    if (!Array.isArray(list)) throw new Error("檔案清單格式無效");
    const seen = new Set<string>();
    return list.map(file => {
      const path = validPath((file as { path?: unknown } | null)?.path);
      const bytes = (file as { bytes?: unknown }).bytes;
      if (!(bytes instanceof ArrayBuffer)) throw new Error(`${path} 缺少檔案內容`);
      const key = path.toLowerCase();
      if (seen.has(key)) throw new Error(`重複檔案路徑：${path}`);
      seen.add(key);
      account(bytes.byteLength);
      return { path, part: attach(bytes, path) };
    });
  };
  const body = payload as Record<string, unknown>;
  let request: unknown;
  if (type === "run") {
    const options = (body.options ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = { ...options, datasheets: files(options.datasheets ?? []) };
    for (const key of ["config", "railMap", "railDomain", "i2cDeclared", "library"]) {
      if (options[key] == null) continue;
      if (typeof options[key] === "string") {
        const size = new TextEncoder().encode(options[key] as string).length;
        if (!["config", "library"].includes(key) || size > TEXT_LIMIT) throw new Error(`${key} 格式或大小無效`);
        account(size, false);
      } else out[key] = files([options[key]])[0];
    }
    request = { ...body, a: files(body.a), b: files(body.b), options: out };
  } else if (type === "datasheet") {
    request = { ...body, file: files([body.file])[0] };
  } else if (type === "tracker") {
    if (!(body.template instanceof ArrayBuffer) || body.template.byteLength > ENGINE_LIMITS.file) throw new Error("Excel 範本格式或大小無效");
    if (!Array.isArray(body.rows) || body.rows.length > 100000) throw new Error("追蹤列格式或數量無效");
    account(body.template.byteLength);
    request = { ...body, template: { part: attach(body.template, "template.xlsx") } };
  } else if (type === "library") {
    for (const key of ["yaml", "entryYaml"]) {
      const value = body[key];
      if (value != null && (typeof value !== "string" || new TextEncoder().encode(value).length > TEXT_LIMIT)) throw new Error("使用者位址 YAML 格式或大小無效");
    }
    request = body;
  } else throw new Error("不支援的 AutoCheck 工作");
  form.append("request", JSON.stringify(request));
  return { form, count: totals.count, bytes: totals.bytes };
}

function fromBase64(text: unknown): ArrayBuffer {
  if (typeof text !== "string") throw new Error("伺服器回應缺少檔案內容");
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

/** Server responses carry artifacts as base64; the page expects the worker's ArrayBuffers. */
export function decodeResult(type: string, data: unknown): unknown {
  if (!data || typeof data !== "object") throw new Error("伺服器回應格式無效");
  if (type === "run") {
    const result = data as { artifacts?: unknown };
    if (!Array.isArray(result.artifacts)) throw new Error("伺服器回應格式無效");
    return { ...result, artifacts: result.artifacts.map(artifact => ({ ...(artifact as Record<string, unknown>), bytes: fromBase64((artifact as { bytes?: unknown }).bytes) })) };
  }
  if (type === "tracker") return { ...(data as Record<string, unknown>), bytes: fromBase64((data as { bytes?: unknown }).bytes) };
  return data;
}

function hostOf(url: string): string {
  try { return new URL(url).host; }
  catch { return url; }
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MiB` : `${Math.max(1, Math.round(bytes / 1024))} KiB`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { throw new Error(`伺服器回應不是 JSON（HTTP ${response.status}）`); }
}

export interface EngineServer { url: string; token: string }
export interface EngineServerInfo { revision: string; version: string; files: number; auth: string }

/** GET /health: used by 測試連線 before a server is saved. */
export async function checkEngineServer(server: EngineServer, signal?: AbortSignal): Promise<EngineServerInfo> {
  const response = await fetch(`${server.url}/api/autocheck/health`, { headers: server.token ? { Authorization: `Bearer ${server.token}` } : {}, signal, cache: "no-store" })
    .catch(error => { throw new Error(`無法連線到 ${hostOf(server.url)}：${error instanceof Error ? error.message : String(error)}`); });
  const data = await readJson(response);
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `伺服器回應 HTTP ${response.status}`);
  if (data.service !== "autocheck-api") throw new Error("這個位址不是 AutoCheck 比對伺服器");
  if (data.auth === "token" && !server.token) throw new Error("這台伺服器需要 API token");
  const engine = (data.engine ?? {}) as Record<string, unknown>;
  return { revision: String(engine.revision ?? ""), version: String(engine.version ?? ""), files: Number(engine.files ?? 0), auth: String(data.auth ?? "none") };
}

/** Sends each job to server/autocheck_api; the page code is unchanged because the responses match the worker's. */
export class RemoteRuntime implements EngineRuntime {
  private cancellationGeneration = 0;
  get generation(): number { return this.cancellationGeneration; }
  private controllers = new Set<AbortController>();
  private server: EngineServer;

  constructor(server: EngineServer) { this.server = { url: server.url.replace(/\/+$/, ""), token: server.token }; }

  async request<T>(type: string, payload: unknown, progress?: (message: string) => void): Promise<T> {
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(new Error("執行超過 10 分鐘，已停止；請縮小輸入或重新執行")), TIMEOUT);
    const host = hostOf(this.server.url);
    try {
      const { form, count, bytes } = encodeRequest(type, payload);
      progress?.(count ? `上傳 ${count} 份檔案（${formatSize(bytes)}）到 ${host}，伺服器處理中…` : `${host} 處理中…`);
      const response = await fetch(`${this.server.url}/api/autocheck/${type}`, { method: "POST", body: form, headers: this.server.token ? { Authorization: `Bearer ${this.server.token}` } : {}, signal: controller.signal })
        .catch(error => {
          if (controller.signal.aborted) throw error;
          throw new Error(`無法連線到比對伺服器 ${host}（${error instanceof Error ? error.message : String(error)}）；確認伺服器已啟動、位址正確，且允許這個網站存取`);
        });
      const data = await readJson(response);
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `伺服器回應 HTTP ${response.status}`);
      return decodeResult(type, data) as T;
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason instanceof Error ? controller.signal.reason : new Error("已取消執行");
      throw error;
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }

  cancel(message = "已取消執行"): void {
    ++this.cancellationGeneration;
    for (const controller of this.controllers) controller.abort(new Error(message));
    this.controllers.clear();
  }
}

export function createRuntime(settings: { mode: "browser" | "server"; url: string; token: string }): EngineRuntime {
  return settings.mode === "server" && settings.url ? new RemoteRuntime(settings) : new ComparisonRuntime();
}
