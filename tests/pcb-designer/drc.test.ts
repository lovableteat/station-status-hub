import test from "node:test";
import assert from "node:assert/strict";
import { runDrc } from "../../src/components/pcb-designer/core/drc.ts";
import type { PcbPlacedComponent, PcbProject } from "../../src/components/pcb-designer/types.ts";

const component = (instanceId: string, x: number, y: number, layer: "top" | "bottom" = "top"): PcbPlacedComponent => ({
  id: `library-${instanceId}`,
  name: instanceId,
  type: "IC",
  manufacturer: "Acme",
  partNumber: instanceId,
  width: 4,
  height: 4,
  maxHeight: 1,
  color: "#fff",
  source: "custom",
  createdAt: "2026-01-01T00:00:00.000Z",
  instanceId,
  reference: instanceId,
  x,
  y,
  rotation: 0,
  layer,
  locked: false,
});

const projectWith = (components: PcbPlacedComponent[], keepouts: PcbProject["keepouts"] = []): PcbProject => ({
  schemaVersion: 1,
  id: "project-1",
  name: "DRC test",
  description: "",
  status: "draft",
  board: { width: 10, height: 10, gridSize: 1, showGrid: true, snapToGrid: true, background: "#000" },
  components,
  keepouts,
  measurements: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

test("same-layer overlap creates a component collision", () => {
  const violations = runDrc(projectWith([component("U2", 5, 5), component("U1", 5, 5)]));

  assert.ok(violations.some((item) => item.code === "COMPONENT_COLLISION"));
});

test("different layers do not create a component collision", () => {
  const violations = runDrc(projectWith([component("U1", 5, 5), component("U2", 5, 5, "bottom")]));

  assert.equal(violations.some((item) => item.code === "COMPONENT_COLLISION"), false);
});

test("DRC reports keepout and board violations in stable object-id order", () => {
  const violations = runDrc(projectWith(
    [component("Z1", 11, 5), component("A1", 5, 5)],
    [{ id: "keepout-1", name: "No parts", x: 3, y: 3, width: 4, height: 4, color: "#f00" }],
  ));

  assert.deepEqual(violations.map((item) => [item.code, item.objectIds]), [
    ["BOARD_BOUNDARY", ["Z1"]],
    ["KEEPOUT_COLLISION", ["A1", "keepout-1"]],
  ]);
  assert.deepEqual(violations.map((item) => item.id), ["drc-board-boundary-z1", "drc-keepout-collision-a1-keepout-1"]);
});
