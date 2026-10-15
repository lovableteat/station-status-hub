import { parseDrawioDocument, type DrawioDocument } from "./drawioDocument.ts";

const DATABASE = "autocheck-drawio-v1";
const STORE = "documents";

function account(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)) {
    throw new Error("需要有效的登入帳號才能儲存 DRAWIO 圖稿");
  }
  return value.toLowerCase();
}

function documentId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value)) throw new Error("DRAWIO 圖稿識別碼無效");
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("瀏覽器不支援本機 DRAWIO 儲存，請匯出 .drawio 保留圖稿")); return; }
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(DATABASE, 1); }
    catch { reject(new Error("無法開啟本機 DRAWIO 儲存，請先匯出 .drawio")); return; }
    let blocked = false;
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: ["accountId", "id"] });
      store.createIndex("accountId", "accountId");
    };
    request.onblocked = () => { blocked = true; reject(new Error("本機 DRAWIO 儲存被其他分頁占用，請關閉其他分頁後重試")); };
    request.onerror = () => reject(new Error(`無法開啟本機 DRAWIO 儲存：${request.error?.message || "瀏覽器拒絕存取"}`));
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore, failed: (error: unknown) => void) => () => T): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let failure: unknown;
      let result = (): T => undefined as T;
      const fail = (error: unknown) => {
        failure = error;
        try { tx.abort(); }
        catch { reject(error); }
      };
      tx.oncomplete = () => failure ? reject(failure) : resolve(result());
      tx.onerror = () => { failure ??= new Error(`本機 DRAWIO 儲存失敗：${tx.error?.message || "瀏覽器拒絕操作"}`); };
      tx.onabort = () => reject(failure || new Error(`本機 DRAWIO 操作未完成，原有資料已保留：${tx.error?.message || "交易已取消"}`));
      try { result = operation(tx.objectStore(STORE), fail); }
      catch (error) { fail(error); }
    });
  } finally { db.close(); }
}

export async function listDrawioDocuments(accountId: string): Promise<DrawioDocument[]> {
  const owner = account(accountId);
  return transaction("readonly", (store, fail) => {
    const documents: DrawioDocument[] = [];
    const request = store.index("accountId").getAll(owner);
    request.onsuccess = () => {
      try {
        for (const stored of request.result) {
          if (!stored || typeof stored !== "object" || stored.accountId !== owner) throw new Error("DRAWIO 圖稿帳號資料不一致");
          const document = parseDrawioDocument(stored.document);
          if (document.id !== stored.id) throw new Error("DRAWIO 圖稿識別碼與儲存資料不一致");
          documents.push(document);
        }
      } catch (error) { fail(new Error(`無法讀取本機 DRAWIO 圖稿，原有資料已保留：${error instanceof Error ? error.message : String(error)}`)); }
    };
    return () => documents.sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt) || first.id.localeCompare(second.id));
  });
}

export async function saveDrawioDocument(accountId: string, document: DrawioDocument): Promise<void> {
  const owner = account(accountId);
  const snapshot = parseDrawioDocument(document);
  return transaction("readwrite", store => {
    store.put({ accountId: owner, id: snapshot.id, document: snapshot });
    return () => undefined;
  });
}

export async function deleteDrawioDocument(accountId: string, id: string): Promise<void> {
  const owner = account(accountId);
  documentId(id);
  return transaction("readwrite", store => {
    store.delete([owner, id]);
    return () => undefined;
  });
}
