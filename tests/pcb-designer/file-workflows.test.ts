import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const filesUrl = new URL(
  "../../src/components/pcb-designer/core/files.ts",
  import.meta.url,
);

async function loadFilesModule() {
  await assert.doesNotReject(access(filesUrl), "file workflow module should exist");
  return import(filesUrl.href);
}

test("safe download names remove path characters and preserve the requested suffix", async () => {
  const { projectExportFilename, bomExportFilename } = await loadFilesModule();

  assert.equal(projectExportFilename("../Power:Board*"), "Power-Board.pcb-project.json");
  assert.equal(bomExportFilename("Power / Board", "csv"), "Power-Board.bom.csv");
  assert.equal(bomExportFilename("Power / Board", "xlsx"), "Power-Board.bom.xlsx");
});

test("file kind validation and accept values stay aligned", async () => {
  const {
    BOM_FILE_ACCEPT,
    LIBRARY_FILE_ACCEPT,
    PROJECT_FILE_ACCEPT,
    classifyImportFile,
  } = await loadFilesModule();

  assert.equal(PROJECT_FILE_ACCEPT, ".json,application/json");
  assert.match(LIBRARY_FILE_ACCEPT, /\.json/);
  assert.match(LIBRARY_FILE_ACCEPT, /\.csv/);
  assert.match(LIBRARY_FILE_ACCEPT, /\.xlsx/);
  assert.match(BOM_FILE_ACCEPT, /\.csv/);
  assert.match(BOM_FILE_ACCEPT, /\.xlsx/);
  assert.equal(classifyImportFile("parts.XLSX"), "xlsx");
  assert.equal(classifyImportFile("parts.txt"), null);
});

test("XLSX is loaded dynamically only from XLSX branches", async () => {
  const source = await readFile(filesUrl, "utf8");

  assert.match(source, /await import\(["']xlsx["']\)/);
  assert.doesNotMatch(source, /^import\s+.*from\s+["']xlsx["']/m);
});

test("tabular imports allow files up to exactly 50 MiB", async () => {
  const { MAX_IMPORT_FILE_BYTES, readTabularFile } = await loadFilesModule();
  const file = new File(["name,width,height,max height\nPart,10,10,1"], "parts.csv", {
    type: "text/csv",
  });
  let textReadCount = 0;
  Object.defineProperty(file, "size", { value: MAX_IMPORT_FILE_BYTES });
  Object.defineProperty(file, "text", {
    value: async () => {
      textReadCount += 1;
      return "name,width,height,max height\nPart,10,10,1";
    },
  });

  assert.equal(MAX_IMPORT_FILE_BYTES, 50 * 1024 * 1024);
  const rows = await readTabularFile(file);
  assert.equal(rows.length, 1);
  assert.equal(textReadCount, 1);
});

test("rejects imports larger than 50 MB before reading their contents", async () => {
  const { MAX_IMPORT_FILE_BYTES, readTabularFile } = await loadFilesModule();
  const file = new File(["x"], "parts.csv", { type: "text/csv" });
  let textReadCount = 0;
  Object.defineProperty(file, "size", { value: MAX_IMPORT_FILE_BYTES + 1 });
  Object.defineProperty(file, "text", {
    value: async () => {
      textReadCount += 1;
      return "name,width,height,max height\nPart,10,10,1";
    },
  });

  await assert.rejects(
    readTabularFile(file),
    /50 MB/i,
  );
  assert.equal(textReadCount, 0);
});

test("accepts STP and STEP files but rejects unrelated extensions", async () => {
  const { isStepModelFile, PCB_MODEL_FILE_ACCEPT } = await import(
    "../../src/components/pcb-designer/core/modelAssets.ts"
  );

  assert.equal(isStepModelFile(new File([], "board.stp")), true);
  assert.equal(isStepModelFile(new File([], "board.step")), true);
  assert.equal(isStepModelFile(new File([], "board.glb")), false);
  assert.match(PCB_MODEL_FILE_ACCEPT, /\.stp/);
  assert.match(PCB_MODEL_FILE_ACCEPT, /\.step/);
});

test("serializes STEP parts into JSON-safe PCB model metadata", async () => {
  const { toPcbModelAssetMetadata } = await import(
    "../../src/components/pcb-designer/core/modelAssets.ts"
  );
  const metadata = toPcbModelAssetMetadata({
    id: "step-1",
    fileName: "housing.STEP",
    importedAt: "2026-08-08T00:00:00.000Z",
    sourceUnit: "millimeter",
    upAxis: "z",
    bounds: { min: [0, 0, 0], max: [10, 20, 30] },
    dimensions: { widthMm: 10, depthMm: 20, heightMm: 30 },
    calibratedDimensions: { widthMm: 10, depthMm: 20, heightMm: 30 },
    parts: [{
      id: "part-1",
      name: "Housing",
      color: [0.1, 0.2, 0.3],
      position: Float32Array.from([0, 1, 2, 1, 2, 3, 2, 3, 4]),
      normal: Float32Array.from([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      index: Uint32Array.from([0, 1, 2]),
    }],
  });

  assert.equal(metadata.id, "step-1");
  assert.deepEqual(metadata.dimensions, { widthMm: 10, depthMm: 20, heightMm: 30 });
  assert.equal(metadata.upAxis, "z");
  assert.equal(metadata.parts.length, 1);
  assert.deepEqual(metadata.parts[0], {
    id: "part-1",
    name: "Housing",
    color: [0.1, 0.2, 0.3],
    vertexCount: 3,
    indexCount: 3,
  });
  assert.doesNotThrow(() => JSON.stringify(metadata));
});

test("exposes PCB STP import assignment and a procedural 3D fallback", async () => {
  const workspace = await readFile(
    new URL("../../src/components/pcb-designer/PcbDesignerWorkspace.tsx", import.meta.url),
    "utf8",
  );
  const inspector = await readFile(
    new URL("../../src/components/pcb-designer/PcbInspector.tsx", import.meta.url),
    "utf8",
  );
  const canvas = await readFile(
    new URL("../../src/components/pcb-designer/Pcb3DCanvas.tsx", import.meta.url),
    "utf8",
  );

  assert.match(workspace, /importStepModel/);
  assert.match(workspace, /PCB_MODEL_FILE_ACCEPT/);
  assert.match(inspector, /modelAssetId/);
  assert.match(inspector, /type=["']file["']/);
  assert.match(inspector, /loading|error|success/i);
  assert.match(canvas, /modelAssetId/);
  assert.match(canvas, /BufferGeometry/);
  assert.match(canvas, /procedural|fallback/i);
});

test("stores model payloads through the in-memory asset fallback", async () => {
  const { IndexedDbModelAssetStore } = await import(
    "../../src/components/pcb-designer/core/modelAssets.ts"
  );
  const store = new IndexedDbModelAssetStore({ indexedDB: undefined });
  const asset = {
    metadata: {
      schemaVersion: 1 as const,
      id: "step-asset",
      fileName: "board.stp",
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
      dimensions: { widthMm: 1, depthMm: 2, heightMm: 3 },
      calibratedDimensions: { widthMm: 1, depthMm: 2, heightMm: 3 },
      upAxis: "z" as const,
      bounds: { min: [0, 0, 0] as [number, number, number], max: [1, 2, 3] as [number, number, number] },
      parts: [{ id: "part-1", name: "Part 1", vertexCount: 3, indexCount: 3 }],
    },
    parts: [{ id: "part-1", position: [0, 1, 2, 1, 2, 3, 2, 3, 4], normal: [0, 0, 1, 0, 0, 1, 0, 0, 1], index: [0, 1, 2] }],
  };

  await store.put(asset);
  assert.deepEqual(await store.get("step-asset"), asset);
  await store.delete("step-asset");
  assert.equal(await store.get("step-asset"), null);
});

test("rejects oversized model meshes before storing them", async () => {
  const { MAX_PCB_MODEL_PARTS, toPcbModelAssetMetadata } = await import(
    "../../src/components/pcb-designer/core/modelAssets.ts"
  );
  const part = {
    id: "part-1",
    name: "Part 1",
    position: Float32Array.from([0, 0, 0]),
    index: Uint32Array.from([0, 0, 0]),
  };
  const model = {
    id: "oversized-model",
    fileName: "oversized.step",
    importedAt: "2026-08-08T00:00:00.000Z",
    sourceUnit: "millimeter" as const,
    upAxis: "z" as const,
    bounds: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] },
    dimensions: { widthMm: 1, depthMm: 1, heightMm: 1 },
    calibratedDimensions: { widthMm: 1, depthMm: 1, heightMm: 1 },
    parts: Array.from({ length: MAX_PCB_MODEL_PARTS + 1 }, (_, index) => ({ ...part, id: `part-${index}` })),
  };

  assert.throws(() => toPcbModelAssetMetadata(model), /上限/i);
});

test("rejects corrupted stored mesh indices so the 3D view can use its fallback", async () => {
  const { IndexedDbModelAssetStore, isPcbModelAsset } = await import(
    "../../src/components/pcb-designer/core/modelAssets.ts"
  );
  const asset = {
    metadata: {
      schemaVersion: 1 as const,
      id: "corrupt-asset",
      fileName: "broken.step",
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
      dimensions: { widthMm: 1, depthMm: 2, heightMm: 3 },
      upAxis: "z" as const,
      bounds: { min: [0, 0, 0] as [number, number, number], max: [1, 2, 3] as [number, number, number] },
      parts: [{ id: "part-1", name: "Part 1", vertexCount: 1, indexCount: 3 }],
    },
    parts: [{ id: "part-1", position: [0, 1, 2], index: [0, 1, 9] }],
  };

  assert.equal(isPcbModelAsset(asset), false);
  const store = new IndexedDbModelAssetStore({ indexedDB: undefined });
  await assert.rejects(store.put(asset), /無效/i);
});

test("uses the smallest PCB model span as the default up axis", async () => {
  const { inferPcbUpAxis } = await import("../../src/components/data-center/dataCenterTypes.ts");
  assert.equal(inferPcbUpAxis([10, 20, 2]), "z");
  assert.equal(inferPcbUpAxis([2, 20, 10]), "x");
});
