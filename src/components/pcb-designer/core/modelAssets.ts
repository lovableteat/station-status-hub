import type { ImportedStepModel } from "@/components/data-center/dataCenterTypes";
import type {
  PcbModelAsset,
  PcbModelAssetMetadata,
  PcbModelAssetPart,
} from "../types.ts";

export const PCB_MODEL_FILE_ACCEPT = ".stp,.step,model/step,application/step";

export function isStepModelFile(file: File): boolean {
  const name = file.name.toLocaleLowerCase();
  return name.endsWith(".stp") || name.endsWith(".step");
}

function clonePart(part: PcbModelAssetPart): PcbModelAssetPart {
  return {
    id: part.id,
    position: toPlainNumberArray(part.position),
    ...(part.normal ? { normal: toPlainNumberArray(part.normal) } : {}),
    index: toPlainNumberArray(part.index),
  };
}

function toPlainNumberArray(values: ArrayLike<number>): number[] {
  return Array.from(values);
}

export function toPcbModelAssetMetadata(model: ImportedStepModel): PcbModelAssetMetadata {
  return {
    schemaVersion: 1,
    id: model.id,
    fileName: model.fileName,
    createdAt: model.importedAt,
    updatedAt: model.importedAt,
    dimensions: structuredClone(model.dimensions),
    calibratedDimensions: structuredClone(model.calibratedDimensions),
    upAxis: model.upAxis,
    bounds: structuredClone(model.bounds),
    parts: model.parts.map((part) => ({
      id: part.id,
      name: part.name,
      ...(part.color ? { color: [...part.color] as [number, number, number] } : {}),
      vertexCount: part.position.length / 3,
      indexCount: part.index.length,
    })),
  };
}

export function toPcbModelAsset(model: ImportedStepModel): PcbModelAsset {
  const metadata = toPcbModelAssetMetadata(model);
  const parts = model.parts.map((part) => ({
    id: part.id,
    position: Array.from(part.position),
    ...(part.normal ? { normal: Array.from(part.normal) } : {}),
    index: Array.from(part.index),
  }));
  return { metadata, parts };
}

export interface ModelAssetStore {
  put(asset: PcbModelAsset): Promise<void>;
  get(id: string): Promise<PcbModelAsset | null>;
  delete(id: string): Promise<void>;
}

interface IndexedDbModelAssetStoreOptions {
  indexedDB?: IDBFactory;
  databaseName?: string;
}

const STORE_NAME = "model-assets";

export class IndexedDbModelAssetStore implements ModelAssetStore {
  private readonly indexedDb?: IDBFactory;
  private readonly databaseName: string;
  private readonly memory = new Map<string, PcbModelAsset>();
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(options: IndexedDbModelAssetStoreOptions = {}) {
    this.indexedDb = options.indexedDB ?? (typeof indexedDB === "undefined" ? undefined : indexedDB);
    this.databaseName = options.databaseName ?? "work-platform:pcb-model-assets:v1";
  }

  async put(asset: PcbModelAsset): Promise<void> {
    const copy = structuredClone(asset);
    this.memory.set(copy.metadata.id, copy);
    try {
      const database = await this.openDatabase();
      if (database) await this.runTransaction(database, "readwrite", (store) => store.put(copy));
    } catch {
      // IndexedDB can be disabled or quota-limited; memory remains the safe fallback.
    }
  }

  async get(id: string): Promise<PcbModelAsset | null> {
    try {
      const database = await this.openDatabase();
      if (!database) return structuredClone(this.memory.get(id) ?? null);
      const result = await this.runTransaction<PcbModelAsset | undefined>(database, "readonly", (store) => store.get(id));
      if (!result) return structuredClone(this.memory.get(id) ?? null);
      this.memory.set(id, structuredClone(result));
      return structuredClone(result);
    } catch {
      return structuredClone(this.memory.get(id) ?? null);
    }
  }

  async delete(id: string): Promise<void> {
    this.memory.delete(id);
    try {
      const database = await this.openDatabase();
      if (database) await this.runTransaction(database, "readwrite", (store) => store.delete(id));
    } catch {
      // The in-memory delete above is still authoritative for this session.
    }
  }

  private openDatabase(): Promise<IDBDatabase | null> {
    if (!this.indexedDb) return Promise.resolve(null);
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve) => {
      const request = this.indexedDb!.open(this.databaseName, 1);
      request.onerror = () => resolve(null);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: "metadata.id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
    return this.databasePromise;
  }

  private runTransaction<T = IDBValidKey>(
    database: IDBDatabase,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Model asset storage failed."));
      transaction.onerror = () => reject(transaction.error ?? new Error("Model asset transaction failed."));
    });
  }
}

let defaultStore: IndexedDbModelAssetStore | null = null;

export function getDefaultPcbModelAssetStore(): IndexedDbModelAssetStore {
  defaultStore ??= new IndexedDbModelAssetStore();
  return defaultStore;
}
