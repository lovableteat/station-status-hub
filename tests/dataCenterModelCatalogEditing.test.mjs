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

test("stale deletion settings cannot hide official GB300 and VR200 models", async () => {
  const {
    isProtectedCatalogModel,
    mergeModelCatalogOverrides,
    removeCatalogModel,
    serializeModelCatalogOverrides,
  } = await import("../src/components/data-center/modelCatalog.mjs");

  const officialModelIds = [
    "nv-mgx-rack-v1-2-rev7",
    "carlo-next-l10-20260715",
    "vera-rubin-vr-1u-20260715",
  ];
  const baseModels = Object.fromEntries(
    officialModelIds.map((id, index) => [
      id,
      {
        id,
        kind: index === 0 ? "rack" : "l10",
        name: id,
        manufacturer: "Official",
        revision: "1",
        dimensions: { widthMm: 700, depthMm: 1000, heightMm: 2200 },
      },
    ]),
  );
  const staleOverrides = { __deletedModelIds: [...officialModelIds] };

  const restored = mergeModelCatalogOverrides(baseModels, staleOverrides);
  assert.deepEqual(Object.keys(restored).sort(), [...officialModelIds].sort());
  assert.equal(serializeModelCatalogOverrides(restored, baseModels).__deletedModelIds, undefined);

  for (const modelId of officialModelIds) {
    assert.equal(isProtectedCatalogModel(modelId), true);
    const result = removeCatalogModel({ models: restored, sites: [], modelId });
    assert.equal(result.deleted, false);
    assert.equal(result.reason, "protected");
  }
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
  assert.match(workspaceSource, /isProtectedCatalogModel\(selectedModel\?\.id\)/);
  assert.match(workspaceSource, /getDefaultRackL10Assignment/);
  assert.match(workspaceSource, /確認刪除/);
  assert.match(workspaceSource, /onPreviewModel/);
});

test("model editing groups identity, physical dimensions and installation separately", async () => {
  const source = (await readFile(new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url), "utf8")).replaceAll("\r\n", "\n");
  const edit = source.slice(source.indexOf(') : view === "edit"'), source.indexOf(') : (\n            <div className="space-y-5">', source.indexOf(') : view === "edit"')));
  const groups = [...edit.matchAll(/<fieldset className="dc-model-edit-section">([\s\S]*?)<\/fieldset>/g)].map((match) => match[1]);

  assert.equal(groups.length, 3);
  assert.match(groups[0], /<legend>[\s\S]*基本資料<\/legend>/);
  assert.match(groups[0], /dc-model-edit-fields sm:grid-cols-2 md:grid-cols-3/);
  for (const key of ["name", "manufacturer", "revision"]) assert.ok(groups[0].includes(`editDraft.${key}`));
  assert.doesNotMatch(groups[0], /equipmentCategory|rackUnits/);
  assert.match(groups[1], /<legend>[\s\S]*實體校正尺寸<\/legend>/);
  assert.match(groups[1], /widthMm[\s\S]*depthMm[\s\S]*heightMm/);
  assert.match(groups[1], /dc-model-edit-fields sm:grid-cols-3/);
  assert.match(edit, /selectedModel.kind === "l10" \? \(\s*<fieldset className="dc-model-edit-section">/);
  assert.match(groups[2], /<legend>[\s\S]*安裝規格<\/legend>/);
  assert.match(groups[2], /equipmentCategory[\s\S]*rackUnits/);
  assert.match(groups[2], /aria-label="設備類別"/);
});

test("model edit save and cancel stay outside the scrolling fields", async () => {
  const source = await readFile(new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url), "utf8");
  const library = source.slice(source.indexOf("function ModelLibrary("), source.indexOf("function useDesktopDataCenterLayout("));
  const footerIndex = library.indexOf('className="dc-model-actions dc-model-edit-actions"');
  assert.ok(footerIndex > library.lastIndexOf("</ScrollArea>"));
  const footer = library.slice(footerIndex, library.indexOf('{view === "browse" ? (', footerIndex));
  assert.match(footer, /aria-label="模型編輯操作"/);
  assert.match(footer, /onClick=\{\(\) => setView\("browse"\)\}/);
  assert.match(footer, /disabled=\{!editDraft.name.trim\(\)\}/);
  assert.match(footer, /onClick=\{saveSelectedModel\}/);
  assert.match(footer, /儲存模型資料/);
});

test("model edit classification uses visible headers and consistent accessible controls", async () => {
  const css = await readFile(new URL("../src/components/data-center/data-center.css", import.meta.url), "utf8");
  assert.match(css, /\.dc-model-editor \{[^}]*gap: 24px/);
  assert.match(css, /\.dc-model-edit-section > legend \{[^}]*background: hsl\(var\(--secondary\)\)/);
  assert.match(css, /\.dc-model-edit-fields \{[^}]*gap: 16px/);
  assert.match(css, /\.dc-model-edit-fields label \{[^}]*gap: 8px/);
  assert.match(css, /\.dc-model-editor :is\(input, button\[role="combobox"\]\) \{[^}]*min-height: 44px/);
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

test("detail viewer redraws immediately after mode, section or part visibility changes", async () => {
  const viewerSource = await readFile(
    new URL("../src/components/data-center/DataCenterModelViewer.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    viewerSource,
    /function GlbInspectionModel[\s\S]*?const \{ invalidate \} = useThree\(\)[\s\S]*?material\.needsUpdate = true;[\s\S]*?invalidate\(\)/,
  );
});
