import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("maintenance source selector exposes current, multi, all and clear scope controls", async () => {
  const source = await readSource(
    "src/components/api-management/MaintenanceSourceSelector.tsx",
  );

  assert.match(source, /機台維修紀錄中心/);
  assert.match(source, /目前專案/);
  assert.match(source, /全部選取/);
  assert.match(source, /清除/);
  assert.match(source, /projects\.map/);
  assert.match(source, /type="checkbox"|<Checkbox/);
  assert.match(source, /currentProjectId/);
  assert.match(source, /selectedProjectIds/);
  assert.match(source, /lastResultCount/);
  assert.match(source, /retrievalError/);
});

test("maintenance citation cards always render accessible source links", async () => {
  const source = await readSource(
    "src/components/api-management/MaintenanceCitationList.tsx",
  );

  assert.match(source, /buildMaintenanceSourceHref/);
  assert.match(source, /citations\.map/);
  assert.match(source, /citation\.sourceLabel/);
  assert.match(source, /citation\.title/);
  assert.match(source, /citation\.projectName/);
  assert.match(source, /<a/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noreferrer"/);
  assert.match(source, /查看原始資料/);
});
