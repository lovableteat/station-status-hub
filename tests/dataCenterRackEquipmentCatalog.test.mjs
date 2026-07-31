import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EQUIPMENT_CATEGORY_OPTIONS,
  getAvailableCatalogEquipmentUnits,
  getEquipmentCategory,
  getEquipmentDeviceType,
} from "../src/components/data-center/rackEquipmentCatalog.mjs";

test("the equipment catalog supports more than L10 compute modules", () => {
  assert.deepEqual(
    EQUIPMENT_CATEGORY_OPTIONS.map((option) => option.id),
    ["all", "compute", "network", "storage", "power", "cooling", "management", "other"],
  );
  assert.equal(getEquipmentCategory({ kind: "l10", equipmentCategory: "network" }), "network");
  assert.equal(getEquipmentCategory({ kind: "l10" }), "compute");
  assert.equal(getEquipmentDeviceType("storage"), "storage-tray");
  assert.equal(getEquipmentDeviceType("cooling"), "cdu");
});

test("available U positions avoid primary modules, other devices, and reserved rail space", () => {
  const available = getAvailableCatalogEquipmentUnits({
    rack: {
      capacityU: 12,
      devices: [
        { id: "network-1", slotStart: 6, slotSpan: 2 },
        { id: "moving", slotStart: 10, slotSpan: 2 },
      ],
    },
    model: { kind: "l10", rackUnits: 2 },
    primarySlots: [4, 8],
    primaryRackUnits: 1,
    reservedBottomU: 1,
    reservedTopU: 1,
    ignoredDeviceId: "moving",
  });

  assert.deepEqual(available, [2, 9, 10]);
});

test("the model dialog provides category search, U installation, and 3D rendering", async () => {
  const [workspaceSource, plannerSource] = await Promise.all([
    readFile(new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/data-center/DataCenter3DPlanner.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(workspaceSource, /模型目錄/);
  assert.match(workspaceSource, /櫃內設備/);
  assert.match(workspaceSource, /搜尋設備名稱、廠牌、類型或版本/);
  assert.match(workspaceSource, /安裝到 \{selectedRack\.cabinet\}/);
  assert.match(workspaceSource, /installCatalogEquipment/);
  assert.match(plannerSource, /RackCatalogEquipmentModels/);
  assert.match(plannerSource, /catalogModelId/);
});

test("Data Center uses a window-based navigation dock and a brighter model catalog", async () => {
  const workspaceSource = await readFile(
    new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
    "utf8",
  );

  assert.match(workspaceSource, /data-testid="data-center-navigation-dock"/);
  assert.match(workspaceSource, /aria-label="Data Center 功能選單"/);
  assert.match(workspaceSource, /setMobileLeftOpen\(true\)/);
  assert.match(workspaceSource, /openProjectManager/);
  assert.match(workspaceSource, /data-model-catalog="bright-catalog"/);
});

test("Data Center navigation and catalog keep aligned semantic color groups", async () => {
  const workspaceSource = await readFile(
    new URL("../src/components/data-center/DeploymentPlanningCenter.tsx", import.meta.url),
    "utf8",
  );

  assert.match(workspaceSource, /lg:grid-cols-\[188px_minmax\(0,1fr\)_360px\]/);
  assert.match(workspaceSource, /h-12 w-12 place-items-center justify-self-center/);
  assert.match(workspaceSource, /border-l-sky-300/);
  assert.match(workspaceSource, /border-l-emerald-300/);
  assert.match(workspaceSource, /border-l-amber-300/);
  assert.match(workspaceSource, /border-l-violet-300/);
  assert.match(workspaceSource, /border-l-orange-300/);
  assert.match(workspaceSource, /border-l-cyan-300/);
});
