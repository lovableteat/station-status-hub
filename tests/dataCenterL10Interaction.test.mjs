import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const plannerSource = await readFile(
  new URL("../src/components/data-center/DataCenter3DPlanner.tsx", import.meta.url),
  "utf8",
);
const workspaceSource = await readFile(
  new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
  "utf8",
);
const typesSource = await readFile(
  new URL("../src/components/data-center/dataCenterTypes.ts", import.meta.url),
  "utf8",
);

test("every mounted L10 module has a direct hit target and selected highlight", () => {
  assert.match(plannerSource, /function L10ModuleHitTargets/);
  assert.match(plannerSource, /layout\.positions\.map/);
  assert.match(plannerSource, /createL10EquipmentSelection/);
  assert.match(plannerSource, /event\.instanceId/);
  assert.match(plannerSource, /onPointerDown=\{handleSelect\}/);
  assert.match(plannerSource, /layout\.positions\[event\.instanceId\]/);
  assert.match(plannerSource, /rackDepth \/ 2 \+ 0\.11/);
  assert.match(plannerSource, /layout\.fittedHeight \+ 0\.006,\s+0\.02/);
  assert.match(plannerSource, /onSelect\(selection\)/);
  assert.match(plannerSource, /selectedEquipmentId === selection\.id/);
  assert.match(plannerSource, /event\.stopPropagation\(\)/);
});

test("the selected L10 lights only its rack-unit face and leaves details to the inspector", () => {
  assert.match(plannerSource, /name=\{`\$\{selection\.id\}-selected-u-layer`\}/);
  assert.match(plannerSource, /position=\{\[0, 0, 0\.015\]\}/);
  assert.match(plannerSource, /layout\.fittedWidth \+ 0\.045/);
  assert.match(plannerSource, /layout\.fittedHeight \+ 0\.018/);
  assert.match(plannerSource, /0\.014,/);
  assert.match(plannerSource, /<Edges/);
  assert.match(plannerSource, /lineWidth=\{2\}/);
  assert.match(plannerSource, /depthTest=\{false\}/);
  assert.match(plannerSource, /renderOrder=\{90\}/);
  assert.doesNotMatch(plannerSource, /data-selected-rack-unit-label="true"/);
  assert.doesNotMatch(plannerSource, /<span>已選取<\/span>/);
  assert.match(plannerSource, /function Gb300EquipmentInspector/);
  assert.match(plannerSource, /\{rack\.cabinet\} · U\{equipment\.rackUnitStart\}/);
});

test("L10 inspector shows telemetry and can update per-slot health", () => {
  assert.match(typesSource, /l10ModuleHealth\?: Record<string, RackDeviceHealth>/);
  assert.match(plannerSource, /equipment\.kind === "l10"/);
  assert.match(plannerSource, /equipment\.powerKw/);
  assert.match(plannerSource, /equipment\.temperatureC/);
  assert.match(plannerSource, /equipment\.utilizationPercent/);
  assert.match(plannerSource, /onUpdateL10ModuleHealth/);
  assert.match(workspaceSource, /handleL10ModuleHealthChange/);
  assert.equal(
    (workspaceSource.match(/onUpdateL10ModuleHealth=\{handleL10ModuleHealthChange\}/g) ?? []).length,
    2,
  );
});
