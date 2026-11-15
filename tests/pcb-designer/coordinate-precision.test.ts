import assert from "node:assert/strict";
import test from "node:test";
import { BUILT_IN_COMPONENTS, createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import { arrangeComponents, duplicateKeepout, editSelectedObject, moveComponent, moveComponents, moveKeepout, moveObjects } from "../../src/components/pcb-designer/core/editor.ts";
import { duplicatePcbSelection } from "../../src/components/pcb-designer/core/selection.ts";
import type { PcbPlacedComponent } from "../../src/components/pcb-designer/types.ts";

const component = (id: string, x = 30, y = 20): PcbPlacedComponent => ({
  ...structuredClone(BUILT_IN_COMPONENTS[3]), instanceId: id, reference: id, x, y,
  width: 2, height: 2, rotation: 0, layer: "top", locked: false,
});
function fixture() {
  const project = createBlankProject("精度測試");
  project.board.snapToGrid = false;
  project.components = [component("U1")];
  project.keepouts = [{ id: "K1", name: "禁制區", x: 50, y: 50, width: 5, height: 5, color: "#fff" }];
  project.measurements = [{ id: "M1", x1: 30, y1: 10, x2: 40, y2: 10, color: "#fff" }];
  return project;
}
const isRounded = (value: number) => assert.equal(value, Math.round(value * 10000) / 10000);

test("ten 0.1 mm nudges end at an exact millimetre for components, keepouts and measurements", () => {
  let project = fixture();
  for (let index = 0; index < 10; index++) {
    project = editSelectedObject(project, { kind: "component", id: "U1" }, { type: "nudge", dx: 0.1, dy: 0 });
    project = editSelectedObject(project, { kind: "keepout", id: "K1" }, { type: "nudge", dx: 0.1, dy: 0 });
    project = editSelectedObject(project, { kind: "measurement", id: "M1" }, { type: "nudge", dx: 0.1, dy: -0.1 });
  }
  assert.equal(project.components[0].x, 31);
  assert.equal(project.keepouts[0].x, 51);
  assert.deepEqual([project.measurements[0].x1, project.measurements[0].x2, project.measurements[0].y1, project.measurements[0].y2], [31, 41, 9, 9]);
});

test("single and group moves write at most four decimal places without changing source data", () => {
  const project = fixture(), before = structuredClone(project);
  const moved = moveComponent(project, "U1", { x: 30.123456, y: 20.654321 }, true);
  assert.ok(moved.ok); assert.deepEqual([moved.component.x, moved.component.y], [30.1235, 20.6543]);
  const grouped = moveComponents(project, ["U1"], { x: 0.123456, y: 0.654321 }, true);
  assert.ok(grouped.ok); assert.deepEqual([grouped.components[0].x, grouped.components[0].y], [30.1235, 20.6543]);
  const mixed = moveObjects(project, ["U1", "K1"], { x: 0.123456, y: 0.654321 }, true);
  assert.ok(mixed.ok);
  [...mixed.components, ...mixed.keepouts].forEach(item => { isRounded(item.x); isRounded(item.y); });
  const keepout = moveKeepout(project, "K1", { x: 50.123456, y: 50.654321 }, true);
  assert.ok(keepout.ok); assert.deepEqual([keepout.keepout.x, keepout.keepout.y], [50.1235, 50.6543]);
  const copied = duplicateKeepout(project, "K1", { x: 0.123456, y: 0.654321 });
  assert.ok(copied.ok); assert.deepEqual([copied.keepout.x, copied.keepout.y], [50.1235, 50.6543]);
  assert.deepEqual(project, before);
});

test("alignment and distribution round their resulting positions", () => {
  const project = fixture();
  project.components = [component("U1", 20.123456, 10), component("U2", 35.654321, 20), component("U3", 60.654321, 40)];
  project.components[0].rotation = 37;
  for (const arrangement of ["align-left", "align-horizontal-center", "distribute-horizontal", "distribute-vertical"] as const) {
    const result = arrangeComponents(project, ["U1", "U2", "U3"], arrangement);
    assert.ok(result.ok);
    result.components.forEach(item => { isRounded(item.x); isRounded(item.y); });
  }
});

test("paste rounds component, keepout and measurement coordinates, including overlap fallback", () => {
  for (const crowded of [false, true]) {
    const project = fixture();
    project.components[0].x = 30.123456;
    project.keepouts[0].x = 50.123456;
    project.measurements[0].x1 = 30.123456;
    project.measurements[0].x2 = 40.654321;
    if (crowded) {
      project.components[0].x = project.components[0].y = 50;
      project.components[0].width = project.board.width;
      project.components[0].height = project.board.height;
    }
    const result = duplicatePcbSelection(project, ["U1", "K1", "M1"]);
    assert.ok(result);
    const copied = new Set(result.objectIds);
    result.project.components.filter(item => copied.has(item.instanceId)).forEach(item => { isRounded(item.x); isRounded(item.y); });
    result.project.keepouts.filter(item => copied.has(item.id)).forEach(item => { isRounded(item.x); isRounded(item.y); });
    result.project.measurements.filter(item => copied.has(item.id)).forEach(item => [item.x1, item.y1, item.x2, item.y2].forEach(isRounded));
    if (crowded) assert.equal(result.usedOverlapFallback, true);
  }
});
