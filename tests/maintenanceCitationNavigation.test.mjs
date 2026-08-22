import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("machine and progress links expose the requested system and station as visible filters", () => {
  const source = read("src/components/test-tracker/TestTracker.tsx");

  assert.match(source, /parseTrackerAutoFilters\(new URLSearchParams\(window\.location\.search\)\)/);
  assert.match(source, /station\.id === parsed\.station \|\| station\.station_name === parsed\.station/);
  assert.match(source, /setStationFilter\(matchedStation\?\.station_name \?\? "all"\)/);
  assert.match(source, /setSystemFilter\(parsed\.system\)/);
  assert.match(source, /setQuery\("system", systemFilter\)/);
  assert.match(source, /setQuery\("station", stationFilter === "all" \? "" : stationFilter\)/);
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
