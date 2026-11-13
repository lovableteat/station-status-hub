import type { NvBomCompareSession } from "./NvBomComparePanel";

export interface NvBomHistoryEntry {
  id: string;
  createdAt: string;
  beforeName: string;
  afterName: string;
  differenceCount: number;
  aiCount: number;
}

const DATABASE = "nv-bom-comparison-history";
const ENTRIES = "entries";
const SESSIONS = "sessions";
type StoredEntry = { scope: string; id: string; entry: NvBomHistoryEntry };
type StoredSession = { scope: string; id: string; session: NvBomCompareSession };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("瀏覽器不支援儲存 NV BOM 比對紀錄"));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore(ENTRIES, { keyPath: ["scope", "id"] }).createIndex("scope", "scope");
      database.createObjectStore(SESSIONS, { keyPath: ["scope", "id"] });
    };
    request.onblocked = () => {
      blocked = true;
      reject(new Error("比對紀錄儲存被其他分頁占用，請關閉其他分頁後重試"));
    };
    request.onerror = () => reject(request.error ?? new Error("無法開啟 NV BOM 比對紀錄"));
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) { database.close(); return; }
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

async function transact<T>(
  scope: string,
  stores: string[],
  mode: IDBTransactionMode,
  requestFor: (transaction: IDBTransaction) => IDBRequest<T>,
): Promise<T> {
  if (!scope.trim()) throw new Error("缺少 NV BOM 比對紀錄的儲存範圍");
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(stores, mode);
      transaction.onabort = () => reject(transaction.error ?? new Error("NV BOM 比對紀錄操作已取消"));
      try {
        const request = requestFor(transaction);
        transaction.oncomplete = () => resolve(request.result);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  } finally {
    database.close();
  }
}

export async function listNvBomHistory(scope: string): Promise<NvBomHistoryEntry[]> {
  const rows: StoredEntry[] = await transact(scope, [ENTRIES], "readonly", transaction =>
    transaction.objectStore(ENTRIES).index("scope").getAll(scope));
  return rows.map(({ entry }) => entry).sort((first, second) =>
    second.createdAt.localeCompare(first.createdAt) || first.id.localeCompare(second.id));
}

export async function loadNvBomHistory(scope: string, id: string): Promise<NvBomCompareSession | undefined> {
  const row: StoredSession | undefined = await transact(scope, [SESSIONS], "readonly", transaction =>
    transaction.objectStore(SESSIONS).get([scope, id]));
  return row?.session;
}

export async function saveNvBomHistory(scope: string, entry: NvBomHistoryEntry, session: NvBomCompareSession): Promise<void> {
  const { id } = entry;
  await transact(scope, [ENTRIES, SESSIONS], "readwrite", transaction => {
    transaction.objectStore(ENTRIES).put({ scope, id, entry } satisfies StoredEntry);
    return transaction.objectStore(SESSIONS).put({ scope, id, session } satisfies StoredSession);
  });
}
