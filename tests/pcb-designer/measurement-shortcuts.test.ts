import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MEASUREMENT_SHORTCUTS, measurementShortcutAxis, validMeasurementShortcuts } from "../../src/components/pcb-designer/core/measurementShortcuts.ts";

test("measurement shortcuts distinguish flips from copy, paste, pan and component alignment", () => {
  const event = { key: "H", shiftKey: true, ctrlKey: false, metaKey: false, altKey: false };
  assert.equal(measurementShortcutAxis(event, DEFAULT_MEASUREMENT_SHORTCUTS), "horizontal");
  assert.equal(measurementShortcutAxis({ ...event, key: "v" }, DEFAULT_MEASUREMENT_SHORTCUTS), "vertical");
  for (const modifiers of [{ shiftKey: false }, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    assert.equal(measurementShortcutAxis({ ...event, ...modifiers }, DEFAULT_MEASUREMENT_SHORTCUTS), null);
  }
  assert.equal(measurementShortcutAxis({ ...event, key: "X" }, { horizontal: "x", vertical: "y" }), "horizontal");
  assert.equal(measurementShortcutAxis(event, { horizontal: "x", vertical: "y" }), null);
});

test("shortcut preferences reject duplicate bindings and invalid stored settings", () => {
  assert.equal(validMeasurementShortcuts(DEFAULT_MEASUREMENT_SHORTCUTS), true);
  for (const value of [null, {}, { horizontal: "x", vertical: "x" }, { horizontal: "Control+C", vertical: "v" }, { horizontal: 1, vertical: "v" }]) {
    assert.equal(validMeasurementShortcuts(value), false);
  }
});
