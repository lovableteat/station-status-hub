import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const policyUrl = new URL(
  "../src/components/material-requests/materialBomSyncPolicy.ts",
  import.meta.url,
);
const pageUrl = new URL(
  "../src/components/material-requests/MaterialRequestPage.tsx",
  import.meta.url,
);
const storageUrl = new URL(
  "../src/components/material-requests/materialBomStorage.ts",
  import.meta.url,
);

async function loadPolicy() {
  const source = await readFile(policyUrl, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);
}

function readFunctionBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  return start >= 0 && end > start ? source.slice(start, end) : null;
}

test("reuses a complete BOM cache only when its remote version and record count match", async () => {
  const { canReuseBomWorkspaceCache } = await loadPolicy();
  const remote = {
    id: "bom-a",
    recordCount: 6606,
    updatedAt: "2026-07-17T08:00:00.123456+00:00",
  };

  assert.equal(canReuseBomWorkspaceCache({
    cached: {
      id: "bom-a",
      isLoaded: true,
      loadedRecordCount: 6606,
      updatedAt: "2026-07-17T08:00:00.123456Z",
    },
    remote,
  }), true);
  assert.equal(canReuseBomWorkspaceCache({
    cached: {
      id: "bom-a",
      isLoaded: false,
      loadedRecordCount: 0,
      updatedAt: remote.updatedAt,
    },
    remote,
  }), false);
  assert.equal(canReuseBomWorkspaceCache({
    cached: {
      id: "bom-a",
      isLoaded: true,
      loadedRecordCount: 6605,
      updatedAt: remote.updatedAt,
    },
    remote,
  }), false);
  assert.equal(canReuseBomWorkspaceCache({
    cached: {
      id: "bom-a",
      isLoaded: true,
      loadedRecordCount: 6606,
      updatedAt: "2026-07-17T07:59:59.000Z",
    },
    remote,
  }), false);
});

test("BOM search does not force a full workspace reload", async () => {
  const pageSource = await readFile(pageUrl, "utf8");
  const applySearch = readFunctionBlock(
    pageSource,
    "const applySearch = async () => {",
    "const clearFilters = () => {",
  );

  assert.ok(applySearch, "applySearch implementation should be present");
  assert.doesNotMatch(applySearch, /reloadBomWorkspaces/);
});

test("manual latest-data action still forces a remote refresh", async () => {
  const pageSource = await readFile(pageUrl, "utf8");
  const loadLatest = readFunctionBlock(
    pageSource,
    "const loadLatestBomData = async () => {",
    "const toggleMarkedGroup = (groupKey: string) => {",
  );

  assert.ok(loadLatest, "loadLatestBomData implementation should be present");
  assert.match(loadLatest, /forceRefresh:\s*true/);
});

test("workspace switches use cache-aware refreshes by default", async () => {
  const pageSource = await readFile(pageUrl, "utf8");
  const reloadWorkspace = readFunctionBlock(
    pageSource,
    "const reloadBomWorkspaces = useCallback(async (",
    "useEffect(() => {",
  );

  assert.ok(reloadWorkspace, "reloadBomWorkspaces implementation should be present");
  assert.match(reloadWorkspace, /options:\s*\{\s*forceRefresh\?: boolean\s*\}\s*=\s*\{\}/);
});

test("single-record saves persist the database record version into the cache", async () => {
  const storageSource = await readFile(storageUrl, "utf8");
  const saveRecord = readFunctionBlock(
    storageSource,
    "export async function saveBomWorkspaceRecord(",
    "export async function saveBomWorkspacePageTracker(",
  );

  assert.ok(saveRecord, "saveBomWorkspaceRecord implementation should be present");
  assert.match(saveRecord, /recordMeta:\s*\{\s*\.\.\.workspace\.recordMeta,\s*\[record\.id\]:\s*recordMeta/);
});
