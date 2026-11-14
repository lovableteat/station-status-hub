import type { ResearchBoard } from "./researchLayout.ts";

const BRD_READER_URL = "http://127.0.0.1:8766/v1/board";
const MAX_BRD_BYTES = 512 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024;

type BoardRecord = Record<string, unknown>;

function isRecord(value: unknown): value is BoardRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= 512 && (allowEmpty || value.trim().length > 0);
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000;
}

function isDimension(value: unknown): value is number {
  return isCoordinate(value) && value > 0;
}

function isPoint(value: unknown): boolean {
  return isRecord(value) && isCoordinate(value.x) && isCoordinate(value.y);
}

function isPath(value: unknown, minimum: number): boolean {
  return Array.isArray(value) && value.length >= minimum && value.every(isPoint);
}

function isLocked(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function rows(value: unknown, predicate: (row: BoardRecord) => boolean): boolean {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || !isText(row.id) || ids.has(row.id) || !predicate(row)) return false;
    ids.add(row.id);
  }
  return true;
}

function isBoard(value: unknown): value is ResearchBoard {
  if (!isRecord(value) || !isDimension(value.width) || !isDimension(value.height)) return false;
  if (value.outline !== undefined && !isPath(value.outline, 3)) return false;
  if (value.holes !== undefined && (!Array.isArray(value.holes) || !value.holes.every((hole) => isPath(hole, 3)))) return false;
  if (!Array.isArray(value.layers) || value.layers.length === 0 || !value.layers.every((name) => isText(name))) return false;
  if (value.unresolvedNets !== undefined && (!Array.isArray(value.unresolvedNets) || !value.unresolvedNets.every((name) => isText(name)))) return false;

  const layers = new Set(value.layers);
  if (layers.size !== value.layers.length) return false;
  const hasLayers = (list: unknown) => Array.isArray(list) && list.length > 0 && list.every((layer) => layers.has(layer));
  const components = new Set<unknown>();
  if (!rows(value.components, (row) => {
    components.add(row.id);
    return isText(row.reference) && isPoint(row) && isDimension(row.width) && isDimension(row.height)
      && isCoordinate(row.rotation) && (row.side === "top" || row.side === "bottom") && typeof row.locked === "boolean";
  })) return false;

  return rows(value.pads, (row) => isText(row.net, true) && isPoint(row) && isDimension(row.width)
    && isDimension(row.height) && hasLayers(row.layers) && isLocked(row.obstacleOnly)
    && (row.componentId === undefined || components.has(row.componentId)))
    && rows(value.keepouts, (row) => isPoint(row) && isDimension(row.width) && isDimension(row.height)
      && (row.kind === "placement" || row.kind === "routing" || row.kind === "both")
      && (row.points === undefined || isPath(row.points, 3))
      && (row.layers === undefined || hasLayers(row.layers)))
    && rows(value.tracks, (row) => isText(row.net, true) && isText(row.layer) && layers.has(row.layer) && isDimension(row.width)
      && isPath(row.points, 2) && isLocked(row.locked))
    && rows(value.vias, (row) => isText(row.net, true) && isPoint(row) && isDimension(row.diameter)
      && hasLayers(row.layers) && isLocked(row.locked));
}

async function readBridgeResponse(response: Response): Promise<unknown> {
  if (!response.body || !response.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw new Error("本機 BRD 匯入工具未提供有效資料。");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("板件資料超過 50 MiB，無法載入完整圖面。");
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(chunks.join("")) as unknown;
  } catch {
    throw new Error("本機 BRD 匯入工具傳回無效資料。");
  }
}

export async function readResearchBrd(file: File, options: { token: string; signal?: AbortSignal }): Promise<{ board: ResearchBoard; warnings: string[] }> {
  options.signal?.throwIfAborted();
  if (!/\.brd$/i.test(file.name) || file.size < 256) throw new Error("請選擇有效的 Allegro BRD 板檔。");
  if (file.size > MAX_BRD_BYTES) throw new Error("BRD 板檔大小超過 512 MiB 上限。");
  const token = options.token.trim();
  if (!/^[\w-]{16,128}$/.test(token)) throw new Error("請輸入本機 BRD 匯入工具顯示的配對碼。");

  const timeout = AbortSignal.timeout(480_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const init: RequestInit & { targetAddressSpace: "loopback" } = {
    method: "POST",
    body: file,
    headers: { "Content-Type": "application/octet-stream", "X-PCB-Research-Token": token },
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    signal,
    targetAddressSpace: "loopback",
  };

  let response: Response;
  try {
    response = await fetch(BRD_READER_URL, init);
  } catch {
    if (options.signal?.aborted) throw options.signal.reason;
    if (timeout.aborted) throw new Error("本機 BRD 匯入逾時，請檢查匯入工具的畫面後重試。");
    throw new Error("無法連線到本機 BRD 匯入工具。請確認工具已啟動，並允許瀏覽器存取本機網路。");
  }
  let data: unknown;
  try {
    data = await readBridgeResponse(response);
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    if (timeout.aborted) throw new Error("本機 BRD 匯入逾時，請檢查匯入工具的畫面後重試。");
    throw error;
  }
  if (response.status === 401 || response.status === 403) throw new Error("本機 BRD 匯入工具拒絕連線，請確認配對碼和允許的網站位置。");
  if (!response.ok) {
    const message = isRecord(data) && typeof data.error === "string" ? data.error.trim().slice(0, 512) : "";
    throw new Error(message || "本機 BRD 匯入失敗，請檢查板檔版本後重試。");
  }
  if (!isRecord(data) || !isBoard(data.board) || !Array.isArray(data.warnings)
    || !data.warnings.every((warning) => isText(warning))) {
    throw new Error("本機 BRD 匯入工具傳回的板件資料不完整。");
  }
  return { board: data.board, warnings: data.warnings };
}
