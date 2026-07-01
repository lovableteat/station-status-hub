import type { MaterialWorkbookPayload } from "./materialRequestUtils";

export interface BomWorkspace {
  id: string;
  name: string;
  payload: MaterialWorkbookPayload;
  updatedAt: string;
}

const DATABASE_NAME = "station-status-hub-material-boms";
const STORE_NAME = "boms";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runRequest<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

export function loadBomWorkspaces() {
  return runRequest<BomWorkspace[]>("readonly", (store) => store.getAll());
}

export function saveBomWorkspace(workspace: BomWorkspace) {
  return runRequest<IDBValidKey>("readwrite", (store) => store.put(workspace));
}

export function removeBomWorkspace(id: string) {
  return runRequest<undefined>("readwrite", (store) => store.delete(id));
}
