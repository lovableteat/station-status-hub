import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("machine and progress citations open the requested system and station", () => {
  const source = read("src/components/test-tracker/TestTracker.tsx");

  assert.match(source, /get\("system"\)/);
  assert.match(source, /get\("station"\)/);
  assert.match(source, /system\.id === requestedSystem \|\| system\.system_name === requestedSystem/);
  assert.match(source, /setLockedStationId\(requestedStation\)/);
  assert.match(source, /setSelectedSystemId\(matchedSystem\.id\)/);
});

test("station citations select the requested flow station", () => {
  const source = read("src/components/test-tracker/FlowInfo.tsx");

  assert.match(source, /get\("station"\)/);
  assert.match(source, /station\.id === requestedStation \|\| station\.station_name === requestedStation/);
  assert.match(source, /setSelectedStationId\(requested\.id\)/);
});

test("asset citations open the requested asset preview", () => {
  const source = read("src/components/tools/ToolsManagement.tsx");

  assert.match(source, /get\("assetId"\)/);
  assert.match(source, /assets\.find\(\(asset\) => asset\.id === requestedAssetId\)/);
  assert.match(source, /setSelectedAsset\(requestedAsset\)/);
});
