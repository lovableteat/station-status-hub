import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MEASUREMENT_SHORTCUTS, measurementShortcutDirection, measurementShortcutLabel, validMeasurementShortcuts } from "../../src/components/pcb-designer/core/measurementShortcuts.ts";

test("R and Shift+R rotate in opposite directions without capturing browser or alignment modifiers", () => {
  const event = { key: "r", shiftKey: false, ctrlKey: false, metaKey: false, altKey: false };
  assert.equal(measurementShortcutDirection(event, DEFAULT_MEASUREMENT_SHORTCUTS), "clockwise");
  assert.equal(measurementShortcutDirection({ ...event, key: "R", shiftKey: true }, DEFAULT_MEASUREMENT_SHORTCUTS), "counterclockwise");
  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    assert.equal(measurementShortcutDirection({ ...event, ...modifiers }, DEFAULT_MEASUREMENT_SHORTCUTS), null);
  }
  const custom = { clockwise: "Shift+x", counterclockwise: "Shift+y" };
  assert.equal(measurementShortcutDirection({ ...event, key: "X", shiftKey: true }, custom), "clockwise");
  assert.equal(measurementShortcutDirection(event, custom), null);
  assert.equal(measurementShortcutLabel(custom.clockwise), "Shift+X");
  assert.equal(measurementShortcutLabel("r"), "R");
});

test("rotation settings reject duplicate, reserved and obsolete flip bindings", () => {
  assert.equal(validMeasurementShortcuts(DEFAULT_MEASUREMENT_SHORTCUTS), true);
  for (const value of [null, {}, { clockwise: "r", counterclockwise: "r" }, { clockwise: "Control+r", counterclockwise: "Shift+r" }, { clockwise: "h", counterclockwise: "Shift+r" }, { clockwise: 1, counterclockwise: "r" }, { horizontal: "h", vertical: "v" }]) {
    assert.equal(validMeasurementShortcuts(value), false);
  }
});
