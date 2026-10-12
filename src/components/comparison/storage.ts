import { isSafeRelativePath } from "./files.ts";
import type { ComparisonSession } from "./types.ts";

const DATABASE = "work-platform:comparison:v1";
const STORE = "sessions";
const PREFERENCES = "preferences";
const MAX_ROWS = 100000;
const MAX_REPORT_BYTES = 256 * 1024 * 1024;
export const REPLY_FIELDS = ["disp", "owner", "target_rev", "note", "filled"] as const;
const ARTIFACT_MIMES: Record<string, string> = {
  pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  json: "application/json", csv: "text/csv", txt: "text/plain", html: "text/html", db: "application/vnd.sqlite3",
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function text(value: unknown, required = false, limit = 1000000): value is string {
  return typeof value === "string" && value.length <= limit && (!required || value.trim().length > 0);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_ROWS && value.every(item => text(item));
}

function keys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  return required.every(key => Object.prototype.hasOwnProperty.call(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}

function timestamp(value: unknown): boolean {
  return text(value, true, 40) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

function jsonRecord(value: unknown): value is Record<string, unknown> {
  if (!record(value)) return false;
  const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++count > 1000000 || item.depth > 64) return false;
    if (item.value === null || typeof item.value === "boolean" || text(item.value)) continue;
    if (typeof item.value === "number" && Number.isFinite(item.value)) continue;
    if (!Array.isArray(item.value) && !record(item.value)) return false;
    if (Object.keys(item.value).some(key => ["__proto__", "constructor", "prototype"].includes(key))) return false;
    for (const value of Object.values(item.value)) pending.push({ value, depth: item.depth + 1 });
  }
  return true;
}

function records(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.length <= MAX_ROWS && value.every(jsonRecord);
}

export function parseSessionSnapshot(value: unknown): ComparisonSession {
  function require(condition: unknown, detail: string): asserts condition {
    if (!condition) throw new Error(`工作階段資料無效：${detail}`);
  }
  require(record(value) && keys(value, ["version", "projectName", "id", "result", "replies", "history", "savedAt"], ["libraryYaml"]), "缺少欄位或含有未知欄位");
  require(value.version === 1 && text(value.projectName, true, 120) && text(value.id, true, 1024) && timestamp(value.savedAt), "版本、比對名稱、識別碼或儲存時間");
  require(value.libraryYaml === undefined || (text(value.libraryYaml, false, 2 * 1024 * 1024) && new TextEncoder().encode(value.libraryYaml).byteLength <= 2 * 1024 * 1024), "位址庫 YAML 不可超過 2 MiB");
  const result = value.result;
  require(record(result) && keys(result, ["meta", "findings", "rows", "overview", "capRows", "railTodo", "railDomain", "powerTree", "powerTreeA", "i2cMap", "i2cMapA", "inputIssues", "warnings", "library", "artifacts"]), "比對結果結構");
  const meta = result.meta;
  require(record(meta) && keys(meta, ["tool_version", "generated", "a", "b"], ["rules_version", "config_hash", "warnings"]), "報表中繼資料");
  require(text(meta.tool_version, true, 120) && text(meta.generated, true, 80), "工具版本或產生時間");
  require(["rules_version", "config_hash"].every(key => meta[key] === undefined || text(meta[key], false, 256)), "規則版本或設定雜湊");
  require(meta.warnings === undefined || strings(meta.warnings), "中繼資料警告");
  for (const side of ["a", "b"]) {
    const design = meta[side];
    require(record(design) && keys(design, ["label", "sources"]) && text(design.label, true, 120) && records(design.sources), `${side.toUpperCase()} 版本資料`);
  }
  const a = meta.a as { label: string };
  const b = meta.b as { label: string };
  require(value.id === JSON.stringify([value.projectName, a.label, b.label]), "識別碼與比對名稱／版本不一致");
  for (const field of ["findings", "overview", "capRows", "railTodo", "railDomain", "library"]) require(records(result[field]), `${field} 清單`);
  for (const field of ["powerTree", "powerTreeA", "i2cMap", "i2cMapA"]) require(jsonRecord(result[field]), `${field} 圖表`);
  require(strings(result.warnings), "警告清單");
  require(Array.isArray(result.inputIssues) && result.inputIssues.length <= MAX_ROWS && result.inputIssues.every(item => Array.isArray(item) && item.length === 2 && item.every(value => text(value))), "輸入問題清單");
  require(Array.isArray(result.rows) && result.rows.length <= MAX_ROWS, "追蹤列數不可超過 100000");
  const rowKeys = new Set<string>();
  for (const row of result.rows) {
    require(record(row) && keys(row, ["key", "gid", "category", "rule", "severity", "status", "page", "page_title", "refdes", "pins", "nets", "title", "detail", "related", "dest"]), "追蹤列結構");
    require(["key", "gid", "category", "rule", "severity", "status", "page_title", "title", "detail", "dest"].every(field => text(row[field], field === "key")), "追蹤列文字欄位");
    require(["category", "status", "severity"].every(field => text(row[field], true, 120) && !["__proto__", "constructor", "prototype"].includes(row[field] as string)), "追蹤列分類、狀態或嚴重度");
    require(row.page === null || (Number.isSafeInteger(row.page) && (row.page as number) > 0), "追蹤列頁碼");
    require(["refdes", "pins", "nets", "related"].every(field => strings(row[field])), "追蹤列接腳／網路清單");
    require(!rowKeys.has(row.key as string), "追蹤 Key 重複");
    rowKeys.add(row.key as string);
  }
  require(record(value.replies) && Object.keys(value.replies).length <= MAX_ROWS, "回覆清單");
  for (const [key, reply] of Object.entries(value.replies)) {
    require(text(key, true) && !["__proto__", "constructor", "prototype"].includes(key), "回覆 Key");
    require(record(reply) && keys(reply, [...REPLY_FIELDS]) && REPLY_FIELDS.every(field => text(reply[field])), "回覆欄位");
  }
  require(Array.isArray(value.history) && value.history.length <= MAX_ROWS, "修改紀錄清單");
  for (const change of value.history) {
    require(record(change) && keys(change, ["key", "field", "old", "value", "at"]), "修改紀錄結構");
    require(text(change.key, true) && REPLY_FIELDS.includes(change.field as typeof REPLY_FIELDS[number]) && text(change.old) && text(change.value) && timestamp(change.at), "修改紀錄欄位");
  }
  require(Array.isArray(result.artifacts) && result.artifacts.length <= 999, "報表清單");
  const artifactKeys = new Set<string>();
  const artifactNames = new Set<string>();
  let reportBytes = 0;
  for (const artifact of result.artifacts) {
    require(record(artifact) && keys(artifact, ["key", "name", "mime", "bytes"]), "報表結構");
    require(text(artifact.key, true, 120) && isSafeRelativePath(artifact.name) && !artifact.name.includes("/") && /\.(pdf|xlsx|json|csv|txt|html|db)$/i.test(artifact.name) && text(artifact.mime, true, 120), "報表檔名或型別");
    require(artifact.mime === ARTIFACT_MIMES[(artifact.name as string).split(".").at(-1)!.toLowerCase()], "報表 MIME 與檔名不一致");
    require(artifact.bytes instanceof ArrayBuffer, "報表缺少二進位資料");
    require(artifact.key !== "schematic" || artifact.mime === "application/pdf", "線路圖必須是 PDF");
    require(artifact.mime !== "application/pdf" || new TextDecoder().decode(new Uint8Array(artifact.bytes, 0, Math.min(5, artifact.bytes.byteLength))) === "%PDF-", "PDF 檔頭無效");
    require(!artifactKeys.has(artifact.key as string) && !artifactNames.has((artifact.name as string).toLowerCase()), "報表 Key 或檔名重複");
    artifactKeys.add(artifact.key as string);
    artifactNames.add((artifact.name as string).toLowerCase());
    reportBytes += artifact.bytes.byteLength;
    require(reportBytes <= MAX_REPORT_BYTES, "報表總量不可超過 256 MiB");
  }
  return value as unknown as ComparisonSession;
}

function account(value: string): void {
  if (!text(value, true, 256)) throw new Error("需要有效的登入帳號才能使用本機儲存");
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("瀏覽器不支援本機儲存，請先匯出備份")); return; }
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(DATABASE, 1); }
    catch { reject(new Error("無法開啟本機儲存，請先匯出備份")); return; }
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: ["accountId", "id"] });
      store.createIndex("accountId", "accountId");
      request.result.createObjectStore(PREFERENCES, { keyPath: "accountId" });
    };
    let blocked = false;
    request.onblocked = () => { blocked = true; reject(new Error("本機儲存被其他分頁占用，請關閉其他分頁後重試")); };
    request.onerror = () => reject(new Error(`無法開啟本機儲存：${request.error?.message || "請先匯出備份"}`));
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

export async function saveSession(accountId: string, session: ComparisonSession): Promise<void> {
  account(accountId);
  const snapshot = structuredClone(parseSessionSnapshot(session));
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(new Error(`本機儲存失敗，原有結果已保留：${transaction.error?.message || "儲存空間不足或瀏覽器拒絕寫入"}`));
      transaction.objectStore(STORE).put({ accountId, ...snapshot });
    });
  } catch (error) {
    throw new Error(`本機儲存失敗，請匯出備份：${error instanceof Error ? error.message : String(error)}`);
  } finally { db.close(); }
}

export async function listSessions(accountId: string): Promise<ComparisonSession[]> {
  account(accountId);
  const db = await openDatabase();
  try {
    return await new Promise<ComparisonSession[]>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).index("accountId").getAll(accountId);
      const sessions: ComparisonSession[] = [];
      request.onsuccess = () => {
        try {
          for (const stored of request.result) {
            if (!record(stored) || stored.accountId !== accountId) throw new Error("帳號資料不一致");
            const { accountId: _accountId, ...snapshot } = stored;
            sessions.push(parseSessionSnapshot(snapshot));
          }
        } catch (error) { reject(new Error(`無法讀取本機儲存，原有資料已保留：${error instanceof Error ? error.message : String(error)}`)); }
      };
      transaction.oncomplete = () => resolve(sessions.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt)));
      transaction.onerror = transaction.onabort = () => reject(new Error(`本機儲存讀取失敗：${transaction.error?.message || "瀏覽器拒絕讀取"}`));
    });
  } finally { db.close(); }
}

export async function saveLibrary(accountId: string, yaml: string): Promise<void> {
  account(accountId);
  if (!text(yaml, false, 2 * 1024 * 1024) || new TextEncoder().encode(yaml).byteLength > 2 * 1024 * 1024) throw new Error("位址庫 YAML 必須是小於或等於 2 MiB 的文字");
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PREFERENCES, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(new Error(`本機位址庫儲存失敗，原有資料已保留：${transaction.error?.message || "瀏覽器拒絕寫入"}`));
      transaction.objectStore(PREFERENCES).put({ accountId, yaml });
    });
  } catch (error) {
    throw new Error(`本機位址庫儲存失敗，請另存 YAML：${error instanceof Error ? error.message : String(error)}`);
  } finally { db.close(); }
}

export async function readLibrary(accountId: string): Promise<string> {
  account(accountId);
  const db = await openDatabase();
  try {
    return await new Promise<string>((resolve, reject) => {
      const transaction = db.transaction(PREFERENCES, "readonly");
      const request = transaction.objectStore(PREFERENCES).get(accountId);
      let yaml = "";
      request.onsuccess = () => {
        const stored = request.result;
        if (stored === undefined) return;
        if (!record(stored) || !keys(stored, ["accountId", "yaml"]) || stored.accountId !== accountId || !text(stored.yaml, false, 2 * 1024 * 1024) || new TextEncoder().encode(stored.yaml).byteLength > 2 * 1024 * 1024) {
          reject(new Error("本機位址庫儲存資料無效，原有資料已保留")); return;
        }
        yaml = stored.yaml;
      };
      transaction.oncomplete = () => resolve(yaml);
      transaction.onerror = transaction.onabort = () => reject(new Error(`本機位址庫儲存讀取失敗：${transaction.error?.message || "瀏覽器拒絕讀取"}`));
    });
  } finally { db.close(); }
}
