import type { ImportedStepModel } from "@/components/data-center/dataCenterTypes";
import type {
  PcbModelAsset,
  PcbModelAssetMetadata,
  PcbModelAssetPart,
} from "../types.ts";

export const PCB_MODEL_FILE_ACCEPT = ".stp,.step,model/step,application/step";
export const MAX_PCB_MODEL_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_PCB_MODEL_PARTS = 256;
export const MAX_PCB_MODEL_VERTICES = 500_000;
export const MAX_PCB_MODEL_INDICES = 1_500_000;

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

function invalidModel(message: string): Error {
  return new Error(`PCB 3D 模型無效：${message}`);
}

function isFiniteNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function isFiniteTuple(value: unknown): value is [number, number, number] {
  return Array.isArray(value)
    && value.length === 3
    && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function isPositiveDimensions(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const dimensions = value as Record<string, unknown>;
  return ["widthMm", "depthMm", "heightMm"].every((key) =>
    typeof dimensions[key] === "number" && Number.isFinite(dimensions[key]) && dimensions[key] > 0,
  );
}

export function assertImportedModelWithinLimits(model: ImportedStepModel): void {
  if (model.parts.length === 0) throw invalidModel("找不到可繪製的零件。 ");
  if (model.parts.length > MAX_PCB_MODEL_PARTS) {
    throw invalidModel(`零件數超過上限 ${MAX_PCB_MODEL_PARTS}。`);
  }
  if (!isFiniteTuple(model.bounds.min) || !isFiniteTuple(model.bounds.max)) {
    throw invalidModel("邊界資料不是有限數值。 ");
  }
  if (!["x", "y", "z"].includes(model.upAxis)
    || !isPositiveDimensions(model.dimensions)
    || !isPositiveDimensions(model.calibratedDimensions)) {
    throw invalidModel("模型方向或尺寸資料無效。 ");
  }
  if (model.bounds.max.some((value, index) => value <= model.bounds.min[index])) {
    throw invalidModel("邊界尺寸必須大於零。 ");
  }

  let vertexCount = 0;
  let indexCount = 0;
  for (const part of model.parts) {
    const partVertices = part.position.length / 3;
    if (!Number.isInteger(partVertices) || partVertices <= 0) {
      throw invalidModel(`零件「${part.name}」的頂點資料不完整。`);
    }
    if (part.normal && part.normal.length !== part.position.length) {
      throw invalidModel(`零件「${part.name}」的法線資料長度不一致。`);
    }
    if (!Array.from(part.position).every(Number.isFinite)
      || (part.normal && !Array.from(part.normal).every(Number.isFinite))) {
      throw invalidModel(`零件「${part.name}」含有非有限座標。`);
    }
    if (part.index.length === 0 || part.index.length % 3 !== 0
      || !Array.from(part.index).every((index) => Number.isInteger(index) && index >= 0 && index < partVertices)) {
      throw invalidModel(`零件「${part.name}」的三角形索引無效。`);
    }
    vertexCount += partVertices;
    indexCount += part.index.length;
    if (vertexCount > MAX_PCB_MODEL_VERTICES || indexCount > MAX_PCB_MODEL_INDICES) {
      throw invalidModel(`頂點或索引數超過安全上限（${MAX_PCB_MODEL_VERTICES} / ${MAX_PCB_MODEL_INDICES}）。`);
    }
  }
}

export function isPcbModelAsset(value: unknown): value is PcbModelAsset {
  if (!value || typeof value !== "object") return false;
  const asset = value as Partial<PcbModelAsset>;
  const metadata = asset.metadata;
  if (!metadata || typeof metadata !== "object" || !Array.isArray(asset.parts)) return false;
  if (metadata.schemaVersion !== 1 || typeof metadata.id !== "string" || !metadata.id
    || typeof metadata.fileName !== "string" || typeof metadata.createdAt !== "string"
    || typeof metadata.updatedAt !== "string" || !["x", "y", "z"].includes(metadata.upAxis)
    || !isPositiveDimensions(metadata.dimensions)
    || !isPositiveDimensions(metadata.calibratedDimensions)
    || !isFiniteTuple(metadata.bounds?.min) || !isFiniteTuple(metadata.bounds?.max)
    || metadata.bounds.max.some((item, index) => item <= metadata.bounds.min[index])
    || !Array.isArray(metadata.parts)
    || !metadata.parts.every((part) => typeof part?.id === "string" && typeof part.name === "string"
      && Number.isInteger(part.vertexCount) && part.vertexCount > 0
      && Number.isInteger(part.indexCount) && part.indexCount > 0)) return false;
  if (asset.parts.length !== metadata.parts.length || asset.parts.length > MAX_PCB_MODEL_PARTS) return false;

  let vertices = 0;
  let indices = 0;
  for (const [index, part] of asset.parts.entries()) {
    const expected = metadata.parts[index];
    if (typeof part?.id !== "string" || part.id !== expected.id
      || !isFiniteNumberArray(part.position) || part.position.length === 0 || part.position.length % 3 !== 0
      || (part.normal !== undefined && (!isFiniteNumberArray(part.normal) || part.normal.length !== part.position.length))
      || !isFiniteNumberArray(part.index) || part.index.length === 0 || part.index.length % 3 !== 0
      || !part.index.every((item) => Number.isInteger(item) && item >= 0 && item < part.position.length / 3)
      || expected.vertexCount !== part.position.length / 3 || expected.indexCount !== part.index.length) return false;
    vertices += part.position.length / 3;
    indices += part.index.length;
  }
  return vertices <= MAX_PCB_MODEL_VERTICES && indices <= MAX_PCB_MODEL_INDICES;
}

export function toPcbModelAssetMetadata(model: ImportedStepModel): PcbModelAssetMetadata {
  assertImportedModelWithinLimits(model);
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
  assertImportedModelWithinLimits(model);
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
    if (!isPcbModelAsset(asset)) throw invalidModel("儲存資料未通過完整性檢查。 ");
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
    const getMemoryFallback = () => {
      const fallback = this.memory.get(id);
      return fallback && isPcbModelAsset(fallback) ? structuredClone(fallback) : null;
    };
    try {
      const database = await this.openDatabase();
      if (!database) return getMemoryFallback();
      const result = await this.runTransaction<PcbModelAsset | undefined>(database, "readonly", (store) => store.get(id));
      if (!result || !isPcbModelAsset(result)) return getMemoryFallback();
      this.memory.set(id, structuredClone(result));
      return structuredClone(result);
    } catch {
      return getMemoryFallback();
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
