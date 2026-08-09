import assert from "node:assert/strict";
import test from "node:test";

const selectionModule = await import(
  "../src/components/data-center/l10EquipmentSelection.mjs"
).catch(() => null);

const rack = {
  id: "rack-a",
  cabinet: "NEW-03",
  l10Count: 4,
  powerKw: 16.8,
  temperatureC: 24.2,
  utilizationPercent: 72,
  l10ModuleHealth: { "28": "warning" },
};

const definition = {
  id: "carlo-next-l10",
  name: "Carlo-Next L10",
  rackUnits: 2,
};

test("L10 selection exposes the exact U range and rack telemetry", () => {
  assert.ok(selectionModule, "L10 selection helper must exist");

  const selection = selectionModule.createL10EquipmentSelection({
    rack,
    definition,
    rackUnit: 28,
  });

  assert.deepEqual(selection, {
    id: "rack-a-l10-u28",
    kind: "l10",
    name: "Carlo-Next L10",
    rackUnitStart: 28,
    rackUnitSpan: 2,
    sourceDeviceId: null,
    health: "warning",
    model: "Carlo-Next L10",
    role: "L10 運算模組",
    assetTag: "NEW-03-L10-U28",
    powerKw: 4.2,
    temperatureC: 24.2,
    utilizationPercent: 72,
  });
});

test("L10 selection defaults old saved layouts to healthy", () => {
  assert.ok(selectionModule, "L10 selection helper must exist");

  const selection = selectionModule.createL10EquipmentSelection({
    rack: { ...rack, l10ModuleHealth: undefined },
    definition,
    rackUnit: 11,
  });

  assert.equal(selection.health, "healthy");
});
