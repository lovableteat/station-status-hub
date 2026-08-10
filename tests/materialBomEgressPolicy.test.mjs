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

test("transient BOM read failures retry without reloading the page", async () => {
  const { runBomReadWithRetry } = await loadPolicy();
  const delays = [];
  let attempts = 0;

  const result = await runBomReadWithRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw new TypeError("Failed to fetch");
    return "connected";
  }, {
    retries: 3,
    delaysMs: [5, 10],
    sleep: async (delayMs) => delays.push(delayMs),
  });

  assert.equal(result, "connected");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [5, 10]);
});

test("permanent BOM permission and schema errors do not loop", async () => {
  const { isRetryableBomReadError, runBomReadWithRetry } = await loadPolicy();
  let attempts = 0;

  assert.equal(isRetryableBomReadError({ status: 503 }), true);
  assert.equal(isRetryableBomReadError({ status: 401 }), false);
  assert.equal(isRetryableBomReadError({ code: "42P01" }), false);
  assert.equal(isRetryableBomReadError({ code: "42501" }), false);

  await assert.rejects(runBomReadWithRetry(async () => {
    attempts += 1;
    throw { code: "42501", message: "permission denied" };
  }, {
    retries: 3,
    sleep: async () => {},
  }));

  assert.equal(attempts, 1);
});

test("BOM search promotes a partial workspace to a full workspace load", async () => {
  const pageSource = await readFile(pageUrl, "utf8");
  assert.match(pageSource, /const requiresFullBomLoad = searchTokens\.length > 0/);
  assert.match(pageSource, /loadAllRecords:\s*true/);
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
  assert.match(loadLatest, /loadAllRecords:\s*true/);
});

test("workspace switches use cache-aware refreshes by default", async () => {
  const pageSource = await readFile(pageUrl, "utf8");
  const reloadWorkspace = readFunctionBlock(
    pageSource,
    "const reloadBomWorkspaces = useCallback(async (",
    "useEffect(() => {",
  );

  assert.ok(reloadWorkspace, "reloadBomWorkspaces implementation should be present");
  assert.match(reloadWorkspace, /options:\s*\{[\s\S]*forceRefresh\?: boolean[\s\S]*recordPage\?: number[\s\S]*\}\s*=\s*\{\}/);
  assert.match(reloadWorkspace, /loadAllRecords:\s*options\.loadAllRecords \?\? true/);
});

test("only the latest workspace load may clear the busy state", async () => {
  const pageSource = await readFile(pageUrl, "utf8");

  assert.match(pageSource, /import \{ isLatestBomWorkspaceLoad \} from "\.\/materialBomSyncPolicy"/);
  assert.match(pageSource, /const workspaceLoadingRequestRef = useRef\(0\)/);
  assert.match(pageSource, /const startWorkspaceLoad = useCallback\(\(\) =>/);
  assert.match(pageSource, /const finishWorkspaceLoad = useCallback\(\(requestId: number\) =>/);
  assert.match(pageSource, /if \(isLatestBomWorkspaceLoad\(requestId, workspaceLoadingRequestRef\.current\)\) \{\s*setIsWorkspaceLoading\(false\);/);
});

test("initial and retry workspace syncs request the full remote BOM", async () => {
  const pageSource = await readFile(pageUrl, "utf8");

  assert.match(pageSource, /await reloadBomWorkspaces\(activeBomIdRef\.current, \{\s*forceRefresh:\s*true,\s*loadAllRecords:\s*true,/);
  assert.match(pageSource, /const result = await loadBomWorkspacesDetailed\(preferredWorkspaceId, \{\s*cachedResult,\s*loadAllRecords:\s*true,/);
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

test("partial record fetches never mark a remote workspace as fully loaded", async () => {
  const storageSource = await readFile(storageUrl, "utf8");

  assert.match(storageSource, /const activeWorkspaceHasAllRecords = Boolean\(activeWorkspaceRow\)/);
  assert.match(storageSource, /activeRecordRows\.length >= \(activeWorkspaceRow\?\.record_count \?\? 0\)/);
  assert.match(storageSource, /shouldLoadAllRecords && activeWorkspaceHasAllRecords/);
});
