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
