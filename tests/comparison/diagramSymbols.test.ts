import assert from "node:assert/strict";
import test from "node:test";
import { diagramSymbolGraphics, diagramSymbolLabelBox, diagramSymbolPortPosition, diagramSymbolPorts, isElectricalSymbol } from "../../src/components/comparison/diagramSymbols.ts";

test("electrical graphics are actual circuit strokes with terminal-specific connection ports", () => {
  assert.equal(isElectricalSymbol("rectangle"), false);
  assert.equal(isElectricalSymbol("netlabel"), false);
  assert.equal(diagramSymbolGraphics("rectangle"), undefined);
  assert.match(diagramSymbolGraphics("resistor")!.paths[0], /L26 34 L38 66/);
  assert.match(diagramSymbolGraphics("capacitor")!.paths[0], /M42 26 V74 M58 26 V74/);
  assert.match(diagramSymbolGraphics("ground")!.paths[0], /M20 36 H80 M30 52 H70 M40 68 H60/);
  assert.deepEqual(diagramSymbolPorts("resistor"), ["left", "right"]);
  assert.deepEqual(diagramSymbolPorts("capacitor"), ["left", "right"]);
  assert.deepEqual(diagramSymbolPorts("ground"), ["top"]);
  assert.deepEqual(diagramSymbolPorts("netlabel"), ["left"]);
  assert.equal(diagramSymbolPortPosition("ground", "bottom"), undefined, "ground never offers a terminal at its bars");
  assert.equal(diagramSymbolPortPosition("netlabel", "right"), undefined, "a net name connects through the tip");
});

test("quarter turns rotate the real terminal IDs and keep text in an upright clear region", () => {
  assert.deepEqual(diagramSymbolPorts("resistor", 90), ["top", "bottom"]);
  assert.deepEqual(diagramSymbolPorts("resistor", 180), ["right", "left"]);
  assert.deepEqual(diagramSymbolPorts("ground", 90), ["right"]);
  assert.deepEqual(diagramSymbolPorts("ground", 180), ["bottom"]);
  assert.deepEqual(diagramSymbolPorts("ground", 270), ["left"]);
  assert.deepEqual(diagramSymbolPortPosition("capacitor", "bottom", 90), { x: 50, y: 100 });
  assert.deepEqual(diagramSymbolPortPosition("ground", "left", 270), { x: 0, y: 50 });
  assert.equal(diagramSymbolPortPosition("resistor", "right", 90), undefined);
  for (const shape of ["resistor", "capacitor", "ground", "netlabel"] as const) for (const rotation of [0, 90, 180, 270] as const) {
    const box = diagramSymbolLabelBox(shape, rotation)!;
    assert.ok(box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0 && box.x + box.width <= 100 && box.y + box.height <= 100);
  }
  assert.equal(diagramSymbolLabelBox("resistor", 90)!.x, 76);
  assert.equal(diagramSymbolLabelBox("capacitor", 90)!.width, 24);
  assert.equal(diagramSymbolLabelBox("ground", 90)!.width, 24);
  assert.equal(diagramSymbolLabelBox("ground", 180)!.y, 0);
});
