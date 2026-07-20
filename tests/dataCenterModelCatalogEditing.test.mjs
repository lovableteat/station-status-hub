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
  const { isL10CompatibleWithRack, selectCompatibleL10ModelId } = await import(
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

  assert.equal(
    selectCompatibleL10ModelId(
      {
        vr200: {
          id: "vr200",
          kind: "l10",
          compatibleRackModelIds: [],
          isPlaceholder: false,
          isCalibrated: true,
        },
        placeholder: {
          id: "placeholder",
          kind: "l10",
          isPlaceholder: true,
          isCalibrated: false,
        },
        gb300: {
          id: "gb300",
          kind: "l10",
          compatibleRackModelIds: [gb300RackId],
          isPlaceholder: false,
          isCalibrated: true,
        },
      },
      gb300RackId,
    ),
    "gb300",
  );
});

test("deleting an assigned model safely reassigns racks and records built-in deletion", async () => {
  const {
    mergeModelCatalogOverrides,
    removeCatalogModel,
    serializeModelCatalogOverrides,
  } = await import("../src/components/data-center/modelCatalog.mjs");

  const baseModels = {
    "generic-42u": {
      id: "generic-42u",
      kind: "rack",
      name: "Generic 42U",
      manufacturer: "Open Rack",
      revision: "Standard",
      dimensions: { widthMm: 600, depthMm: 1200, heightMm: 2200 },
    },
    "l10-placeholder": {
      id: "l10-placeholder",
      kind: "l10",
      name: "Placeholder",
      manufacturer: "Internal",
      revision: "Planning",
      dimensions: { widthMm: 482.6, depthMm: 800, heightMm: 44.45 },
    },
    gb300: {
      id: "gb300",
      kind: "rack",
      name: "GB300",
      manufacturer: "NVIDIA",
      revision: "R7",
      dimensions: { widthMm: 708.8, depthMm: 1072.2, heightMm: 2308.315 },
    },
  };
  const sites = [{
    id: "tpe",
    racks: [{
      id: "rack-1",
      modelId: "gb300",
      l10ModelId: "custom-l10",
      l10Count: 3,
    }],
  }];
  const models = {
    ...baseModels,
    "custom-l10": {
      id: "custom-l10",
      kind: "l10",
      name: "Custom L10",
      manufacturer: "Internal",
      revision: "A",
      dimensions: { widthMm: 480, depthMm: 800, heightMm: 44.45 },
    },
  };

  const deletedL10 = removeCatalogModel({ models, sites, modelId: "custom-l10" });
  assert.equal(deletedL10.deleted, true);
  assert.equal(deletedL10.affectedRackCount, 1);
  assert.equal(deletedL10.sites[0].racks[0].l10ModelId, "l10-placeholder");
  assert.equal(deletedL10.sites[0].racks[0].l10Count, 3);

  const deletedRack = removeCatalogModel({
    models: deletedL10.models,
    sites: deletedL10.sites,
    modelId: "gb300",
  });
  assert.equal(deletedRack.sites[0].racks[0].modelId, "generic-42u");

  const persisted = serializeModelCatalogOverrides(deletedRack.models, baseModels);
  assert.deepEqual(persisted.__deletedModelIds, ["gb300"]);
  assert.equal(mergeModelCatalogOverrides(baseModels, persisted).gb300, undefined);

  const protectedResult = removeCatalogModel({
    models: deletedRack.models,
    sites: deletedRack.sites,
    modelId: "generic-42u",
  });
  assert.equal(protectedResult.deleted, false);
  assert.equal(protectedResult.reason, "protected");
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
  assert.match(workspaceSource, /onDeleteModel/);
  assert.match(workspaceSource, /removeCatalogModel/);
  assert.match(workspaceSource, /getDefaultRackL10Assignment/);
  assert.match(workspaceSource, /確認刪除/);
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

test("CAD inspection keeps thin sheet-metal covers visible from both sides", async () => {
  const viewerSource = await readFile(
    new URL("../src/components/data-center/DataCenterModelViewer.tsx", import.meta.url),
    "utf8",
  );
  const plannerSource = await readFile(
    new URL("../src/components/data-center/DataCenter3DPlanner.tsx", import.meta.url),
    "utf8",
  );

  assert.match(viewerSource, /material\.side\s*=\s*THREE\.DoubleSide/);
  assert.doesNotMatch(viewerSource, /mode === "solid"\s*\?\s*THREE\.FrontSide/);
  assert.match(plannerSource, /material\.side\s*=\s*THREE\.DoubleSide/);
  assert.match(plannerSource, /side=\{THREE\.DoubleSide\}/);
});

test("detail viewer exposes searchable per-part visibility controls", async () => {
  const viewerSource = await readFile(
    new URL("../src/components/data-center/DataCenterModelViewer.tsx", import.meta.url),
    "utf8",
  );

  assert.match(viewerSource, /partSearch/);
  assert.match(viewerSource, /hiddenPartNames/);
  assert.match(viewerSource, /onPartNamesChange/);
  assert.match(viewerSource, /setHiddenPartNames/);
  assert.match(viewerSource, /visiblePartNames/);
});
