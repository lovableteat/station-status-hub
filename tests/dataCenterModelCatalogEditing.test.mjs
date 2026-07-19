import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("catalog overrides only edit safe metadata and preserve model identity and assets", async () => {
  const {
    mergeModelCatalogOverrides,
    serializeModelCatalogOverrides,
  } = await import("../src/components/data-center/modelCatalog.mjs");

  const base = {
    gb300: {
      id: "gb300",
      kind: "rack",
      name: "GB300",
      manufacturer: "NVIDIA",
      revision: "REV 7",
      source: "builtin-glb",
      assetUrl: "/models/gb300.glb",
      dimensions: { widthMm: 700, depthMm: 1000, heightMm: 2200 },
      upAxis: "y",
      isCalibrated: true,
    },
  };
  const overrides = {
    gb300: {
      name: "GB300 Lab",
      manufacturer: "EE TEAM",
      revision: "R8",
      dimensions: { widthMm: 720, depthMm: 1100, heightMm: 2300 },
      id: "hijacked",
      kind: "l10",
      assetUrl: "/bad.glb",
    },
  };

  const merged = mergeModelCatalogOverrides(base, overrides);
  assert.equal(merged.gb300.name, "GB300 Lab");
  assert.equal(merged.gb300.id, "gb300");
  assert.equal(merged.gb300.kind, "rack");
  assert.equal(merged.gb300.assetUrl, "/models/gb300.glb");
  assert.deepEqual(serializeModelCatalogOverrides(merged, base), {
    gb300: {
      name: "GB300 Lab",
      manufacturer: "EE TEAM",
      revision: "R8",
      dimensions: { widthMm: 720, depthMm: 1100, heightMm: 2300 },
    },
  });
});

test("L10 compatibility prevents a VR200 unit from being mounted in a GB300 rack", async () => {
  const { isL10CompatibleWithRack } = await import(
    "../src/components/data-center/modelCatalog.mjs"
  );
  const gb300RackId = "nv-mgx-rack-v1-2-rev7";

  assert.equal(
    isL10CompatibleWithRack(
      { kind: "l10", compatibleRackModelIds: [gb300RackId] },
      gb300RackId,
    ),
    true,
  );
  assert.equal(
    isL10CompatibleWithRack(
      { kind: "l10", compatibleRackModelIds: [] },
      gb300RackId,
    ),
    false,
  );
  assert.equal(isL10CompatibleWithRack({ kind: "l10" }, gb300RackId), true);
});

test("model library exposes edit and detail actions and persists catalog overrides", async () => {
  const workspaceSource = await readFile(
    new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
    "utf8",
  );

  assert.match(workspaceSource, /MODEL_CATALOG_STORAGE_KEY/);
  assert.match(workspaceSource, /readInitialModels/);
  assert.match(workspaceSource, /編輯模型資料/);
  assert.match(workspaceSource, /檢視模型細節/);
  assert.match(workspaceSource, /onUpdateModel/);
  assert.match(workspaceSource, /onPreviewModel/);
});

test("detail viewer provides orbit, x-ray, wireframe and section inspection", async () => {
  const viewerSource = await readFile(
    new URL("../src/components/data-center/DataCenterModelViewer.tsx", import.meta.url),
    "utf8",
  );

  assert.match(viewerSource, /OrbitControls/);
  assert.match(viewerSource, /實體/);
  assert.match(viewerSource, /透視/);
  assert.match(viewerSource, /線框/);
  assert.match(viewerSource, /剖面/);
  assert.match(viewerSource, /localClippingEnabled/);
  assert.match(viewerSource, /touchAction:\s*"none"/);
});
