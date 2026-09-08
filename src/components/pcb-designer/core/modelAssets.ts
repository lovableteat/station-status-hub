import type { ImportedStepModel } from "@/components/data-center/dataCenterTypes";
import type { ImportedComponent } from "./tabular.ts";
import type {
  PcbModelAsset,
  PcbModelAssetMetadata,
  PcbModelAssetPart,
  PcbPlacedComponent,
} from "../types.ts";

export const PCB_MODEL_FILE_ACCEPT = ".stp,.step,model/step,application/step";
export const MAX_PCB_MODEL_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_PCB_MODEL_PARTS = 256;
export const MAX_PCB_MODEL_VERTICES = 800_000;
export const MAX_PCB_MODEL_INDICES = 2_400_000;
export const MAX_PCB_CLOUD_ASSET_BYTES = 64 * 1024 * 1024;

export function isStepModelFile(file: File): boolean {
  const name = file.name.toLocaleLowerCase();
  return name.endsWith(".stp") || name.endsWith(".step");
}

function stepFileDisplayName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.(?:stp|step)$/i, "");
  return withoutExtension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "STEP 元件";
}

function partColorToHex(color?: [number, number, number]): string {
  if (!color) return "#63c6dd";
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${color.map(channel).join("")}`;
}

/** Builds an immediately placeable library record from measured STEP metadata. */
export function toStepLibraryComponent(
  metadata: PcbModelAssetMetadata,
): ImportedComponent {
  const dimensions = metadata.calibratedDimensions;
  return {
    name: stepFileDisplayName(metadata.fileName),
    type: "STEP 3D 元件",
    manufacturer: "",
    partNumber: stepFileDisplayName(metadata.fileName),
    width: dimensions.widthMm,
    height: dimensions.depthMm,
    maxHeight: dimensions.heightMm,
    color: partColorToHex(metadata.parts.find((part) => part.color)?.color),
    shape: "rectangle",
  };
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

export function mapPcbModelPartToComponentSpace(
  part: PcbModelAssetPart,
  asset: PcbModelAsset,
  component: Pick<PcbPlacedComponent, "width" | "height" | "maxHeight">,
): number[] {
  const { min, max } = asset.metadata.bounds;
  const spans = [
    Math.max(max[0] - min[0], 0.001),
    Math.max(max[1] - min[1], 0.001),
    Math.max(max[2] - min[2], 0.001),
  ];
  const center = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const widthAxis = asset.metadata.upAxis === "x" ? 1 : 0;
  const heightAxis = asset.metadata.upAxis === "x" ? 0 : asset.metadata.upAxis === "y" ? 1 : 2;
  const boardDepthAxis = asset.metadata.upAxis === "z" ? 1 : 2;
  const positions: number[] = [];

  for (let offset = 0; offset < part.position.length; offset += 3) {
    const raw = [
      part.position[offset] - center[0],
      part.position[offset + 1] - center[1],
      part.position[offset + 2] - center[2],
    ];
    positions.push(
      (raw[widthAxis] / spans[widthAxis]) * component.width,
      (raw[heightAxis] / spans[heightAxis]) * component.maxHeight,
      (raw[boardDepthAxis] / spans[boardDepthAxis]) * component.height,
    );
  }

  return positions;
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

export interface PcbModelFootprintPrimitive {
  id: string;
  role: "body" | "lead";
  /** Normalized top-view coordinates, centered on the component. */
  points: Array<{ x: number; y: number }>;
  color: string;
}

function projectedAxes(upAxis: PcbModelAssetMetadata["upAxis"]) {
  return {
    widthAxis: upAxis === "x" ? 1 : 0,
    depthAxis: upAxis === "z" ? 1 : 2,
  } as const;
}

function cross(
  origin: { x: number; y: number },
  left: { x: number; y: number },
  right: { x: number; y: number },
) {
  return (left.x - origin.x) * (right.y - origin.y)
    - (left.y - origin.y) * (right.x - origin.x);
}

function convexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const unique = [...new Map(points.map((point) => [
    `${point.x.toFixed(5)}:${point.y.toFixed(5)}`,
    point,
  ])).values()].sort((left, right) => left.x - right.x || left.y - right.y);
  if (unique.length <= 2) return unique;

  const lower: typeof unique = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: typeof unique = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index];
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function footprintPartColor(asset: PcbModelAsset, partId: string, fallback: string): string {
  const color = asset.metadata.parts.find((part) => part.id === partId)?.color;
  return color ? partColorToHex(color) : fallback;
}

function boundsForFootprint(points: Array<{ x: number; y: number }>) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/**
 * Finds disconnected surfaces at the model's board-facing plane. Mechanical
 * STEP assemblies often store the plastic body and every pin in one mesh;
 * these contact islands provide the pad/lead detail needed by a 2D layout.
 */
function buildBoardContactFootprints(
  asset: PcbModelAsset,
  widthAxis: number,
  depthAxis: number,
  widthCenter: number,
  depthCenter: number,
  widthSpan: number,
  depthSpan: number,
): PcbModelFootprintPrimitive[] {
  const upAxis = asset.metadata.upAxis === "x" ? 0 : asset.metadata.upAxis === "y" ? 1 : 2;
  const minUp = asset.metadata.bounds.min[upAxis];
  const upSpan = asset.metadata.bounds.max[upAxis] - minUp;
  const contactLimit = minUp + Math.max(upSpan * 0.08, 0.02);
  const contacts: PcbModelFootprintPrimitive[] = [];

  asset.parts.forEach((part) => {
    const parent = new Map<number, number>();
    const find = (value: number): number => {
      const current = parent.get(value);
      if (current === undefined) {
        parent.set(value, value);
        return value;
      }
      if (current === value) return value;
      const root = find(current);
      parent.set(value, root);
      return root;
    };
    const join = (left: number, right: number) => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
    };

    for (let offset = 0; offset < part.index.length; offset += 3) {
      const triangle = [part.index[offset], part.index[offset + 1], part.index[offset + 2]];
      if (!triangle.every((vertex) => part.position[vertex * 3 + upAxis] <= contactLimit)) continue;
      join(triangle[0], triangle[1]);
      join(triangle[1], triangle[2]);
    }

    const groups = new Map<number, number[]>();
    parent.forEach((_, vertex) => {
      const root = find(vertex);
      const vertices = groups.get(root) ?? [];
      vertices.push(vertex);
      groups.set(root, vertices);
    });

    [...groups.values()].forEach((vertices, groupIndex) => {
      const points = convexHull(vertices.map((vertex) => ({
        x: (part.position[vertex * 3 + widthAxis] - widthCenter) / widthSpan,
        y: (part.position[vertex * 3 + depthAxis] - depthCenter) / depthSpan,
      })));
      if (points.length < 3) return;
      const bounds = boundsForFootprint(points);
      const spanX = bounds.maxX - bounds.minX;
      const spanY = bounds.maxY - bounds.minY;
      const area = spanX * spanY;
      const nearEdge = bounds.minX < -0.32 || bounds.maxX > 0.32
        || bounds.minY < -0.32 || bounds.maxY > 0.32;
      const slender = Math.min(spanX, spanY) / Math.max(spanX, spanY, 0.000001) < 0.45;
      if (area < 0.000004 || area > 0.08 || (!nearEdge && !slender && area > 0.025)) return;
      contacts.push({
        id: `${part.id}-board-contact-${groupIndex}`,
        role: "lead",
        points,
        color: "#f6c453",
      });
    });
  });

  return contacts.slice(0, 256);
}

export function getPcbModelPartColor(asset: PcbModelAsset, partId: string, fallback: string): string {
  return footprintPartColor(asset, partId, fallback);
}

/**
 * Creates a lightweight top-view mechanical footprint from a STEP assembly.
 * Separate lead/contact solids remain visible instead of collapsing the model
 * into the component's rectangular bounding box.
 */
export function buildPcbModelFootprint(
  asset: PcbModelAsset,
  fallbackColor = "#63c6dd",
): PcbModelFootprintPrimitive[] {
  const { min, max } = asset.metadata.bounds;
  const { widthAxis, depthAxis } = projectedAxes(asset.metadata.upAxis);
  const widthSpan = Math.max(max[widthAxis] - min[widthAxis], 0.001);
  const depthSpan = Math.max(max[depthAxis] - min[depthAxis], 0.001);
  const widthCenter = (min[widthAxis] + max[widthAxis]) / 2;
  const depthCenter = (min[depthAxis] + max[depthAxis]) / 2;

  const projected = asset.parts.map((part, partIndex) => {
    const sampleStride = Math.max(1, Math.ceil(part.position.length / 3 / 8_000));
    const points: Array<{ x: number; y: number }> = [];
    for (let offset = 0; offset < part.position.length; offset += 3 * sampleStride) {
      const raw = [part.position[offset], part.position[offset + 1], part.position[offset + 2]];
      points.push({
        x: (raw[widthAxis] - widthCenter) / widthSpan,
        y: (raw[depthAxis] - depthCenter) / depthSpan,
      });
    }
    const hull = convexHull(points);
    const bounds = hull.length ? boundsForFootprint(hull) : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    const metadata = asset.metadata.parts[partIndex];
    return {
      id: part.id,
      name: metadata?.name ?? part.id,
      rawColor: metadata?.color,
      points: hull,
      bounds,
      areaRatio: Math.max(0, bounds.maxX - bounds.minX) * Math.max(0, bounds.maxY - bounds.minY),
      color: footprintPartColor(asset, part.id, fallbackColor),
    };
  }).filter((part) => part.points.length >= 3 && part.areaRatio > 0.000001);

  const primitives = projected.map((part) => {
    const normalizedName = part.name.toLocaleLowerCase();
    const namedLead = /(?:pin|lead|terminal|contact|solder|pad|ball|leg|腳|針|端子|接點)/i.test(normalizedName);
    const touchesEdge = part.bounds.minX < -0.38 || part.bounds.maxX > 0.38
      || part.bounds.minY < -0.38 || part.bounds.maxY > 0.38;
    const spanX = part.bounds.maxX - part.bounds.minX;
    const spanY = part.bounds.maxY - part.bounds.minY;
    const slender = Math.min(spanX, spanY) / Math.max(spanX, spanY, 0.000001) < 0.38;
    const colorRange = part.rawColor
      ? Math.max(...part.rawColor) - Math.min(...part.rawColor)
      : 1;
    const colorLevel = part.rawColor
      ? part.rawColor.reduce((sum, channel) => sum + channel, 0) / 3
      : 0;
    const metallicContact = colorRange < 0.22 && colorLevel > 0.38 && part.areaRatio < 0.1;
    const likelyLead = namedLead
      || metallicContact
      || (touchesEdge && part.areaRatio < 0.08 && (slender || part.areaRatio < 0.018));
    return {
      id: part.id,
      role: likelyLead ? "lead" : "body",
      points: part.points,
      color: part.color,
    };
  }).sort((left, right) => Number(left.role === "lead") - Number(right.role === "lead"));

  const knownLeadParts = new Set(primitives.filter((part) => part.role === "lead").map((part) => part.id));
  const contactPrimitives = buildBoardContactFootprints(
    asset,
    widthAxis,
    depthAxis,
    widthCenter,
    depthCenter,
    widthSpan,
    depthSpan,
  ).filter((contact) => !knownLeadParts.has(contact.id.replace(/-board-contact-\d+$/, "")));

  return [...primitives.filter((part) => part.role === "body"), ...contactPrimitives, ...primitives.filter((part) => part.role === "lead")];
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 32_768;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/g, ""));
  if (binary.length > MAX_PCB_CLOUD_ASSET_BYTES) {
    throw invalidModel("雲端模型超過安全大小上限。");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Compresses the validated mesh payload before sending it to the shared cloud catalog. */
export async function serializePcbModelAsset(asset: PcbModelAsset): Promise<string> {
  if (!isPcbModelAsset(asset)) throw invalidModel("雲端儲存資料未通過完整性檢查。");
  const stream = new Blob([JSON.stringify(asset)])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  if (bytes.byteLength > MAX_PCB_CLOUD_ASSET_BYTES) {
    throw invalidModel("壓縮後的雲端模型超過 64 MB 上限。");
  }
  return bytesToBase64(bytes);
}

/** Restores and revalidates a shared mesh payload downloaded on another computer. */
export async function deserializePcbModelAsset(payloadBase64: string): Promise<PcbModelAsset> {
  if (!payloadBase64 || payloadBase64.length > Math.ceil(MAX_PCB_CLOUD_ASSET_BYTES / 3) * 4 + 16) {
    throw invalidModel("雲端模型內容為空或超過安全大小上限。");
  }
  const stream = new Blob([base64ToBytes(payloadBase64)])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const parsed = JSON.parse(await new Response(stream).text()) as unknown;
  if (!isPcbModelAsset(parsed)) throw invalidModel("雲端模型內容損壞或格式不符。");
  return parsed;
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
