import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getCanonicalModelBounds } from "../src/components/data-center/stepModelBounds.mjs";

const plannerUrl = new URL(
  "../src/components/data-center/DeploymentPlanningCenter.tsx",
  import.meta.url
);
const clientUrl = new URL(
  "../src/components/data-center/modelConversionWorker.ts",
  import.meta.url
);
const workerUrl = new URL(
  "../src/components/data-center/stepConversion.worker.ts",
  import.meta.url
);
const freeCadScriptUrl = new URL(
  "../scripts/freecad-step-to-glb.py",
  import.meta.url
);
const freeCadRunnerUrl = new URL(
  "../scripts/convert-step-with-freecad.ps1",
  import.meta.url
);

test("STEP conversion derives calibrated millimeter dimensions from assembly bounds", () => {
  const result = getCanonicalModelBounds([
    {
      xmin: -354.4,
      ymin: -1200.314835,
      zmin: -536.1,
      xmax: 354.4,
      ymax: 1108,
      zmax: 536.1,
    },
  ]);

  assert.equal(result.sourceUpAxis, "y");
  assert.deepEqual(result.dimensions, {
    widthMm: 708.8,
    depthMm: 1072.2,
    heightMm: 2308.3,
  });
});

test("large STEP files use the OpenCascade 8 background worker without fixed application size caps", async () => {
  const [planner, client, worker] = await Promise.all([
    readFile(plannerUrl, "utf8"),
    readFile(clientUrl, "utf8"),
    readFile(workerUrl, "utf8"),
  ]);

  assert.doesNotMatch(planner, /MAX_MODEL_FILE_BYTES|MAX_BROWSER_STEP_BYTES/);
  assert.doesNotMatch(planner, /超過 100MB|請先轉為 Meshopt\/Draco GLB/);
  assert.match(planner, /convertStepToGlb\(file/);
  assert.match(planner, /new Blob\(\[converted\.glb\]/);
  assert.match(client, /new Worker\(new URL\("\.\/stepConversion\.worker\.ts"/);
  assert.match(client, /signal\.addEventListener\("abort"/);
  assert.match(worker, /occt-wasm/);
  assert.match(worker, /importXCAFFromSTEP/);
  assert.match(worker, /exportGLTF/);
  assert.match(worker, /getBoundingBox/);
  assert.doesNotMatch(worker, /occt-import-js/);
});

test("model import UI explains automatic conversion and exposes cancellation", async () => {
  const planner = await readFile(plannerUrl, "utf8");

  assert.match(planner, /STEP\/STP 會在背景自動轉為 GLB/);
  assert.match(planner, /onCancelImport/);
  assert.match(planner, /取消轉換/);
  assert.match(planner, /importProgress/);
});

test("native conversion exports top-level assembly roots without duplicating child parts", async () => {
  const [converter, runner] = await Promise.all([
    readFile(freeCadScriptUrl, "utf8"),
    readFile(freeCadRunnerUrl, "utf8"),
  ]);

  assert.match(converter, /document\.RootObjects/);
  assert.match(converter, /Import\.export\(export_objects,\s*output_path\)/);
  assert.doesNotMatch(converter, /Import\.export\(document\.Objects,\s*output_path\)/);
  assert.match(converter, /def glb_up_axis\(source_up_axis\)/);
  assert.match(converter, /"y":\s*"z"/);
  assert.match(converter, /"upAxis":\s*glb_up_axis\(args\.up_axis\)/);
  assert.match(converter, /rootCoverage/);
  assert.match(runner, /\/usr\/local\/bin\/FreeCADCmd/);
});
