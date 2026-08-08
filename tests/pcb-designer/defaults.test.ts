import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILT_IN_COMPONENTS,
  BUILT_IN_TEMPLATES,
  createBlankProject,
} from "../../src/components/pcb-designer/defaults.ts";

test("blank project and built-in components satisfy domain invariants", () => {
  const project = createBlankProject("測試板");

  assert.equal(project.schemaVersion, 1);
  assert.ok(project.board.width >= 20);
  assert.equal(
    new Set(BUILT_IN_COMPONENTS.map((item) => item.id)).size,
    BUILT_IN_COMPONENTS.length,
  );
  assert.ok(
    BUILT_IN_COMPONENTS.every((item) => item.width > 0 && item.height > 0),
  );
  assert.equal(BUILT_IN_TEMPLATES.length, 5);
  assert.equal(
    new Set(BUILT_IN_TEMPLATES.map((item) => item.id)).size,
    BUILT_IN_TEMPLATES.length,
  );
});

test("built-in starter templates provide distinct, usable layouts", () => {
  const [blank, microcontroller, sensor, power] = BUILT_IN_TEMPLATES;

  assert.equal(blank.project.components.length, 0);
  assert.ok(microcontroller.project.components.length >= 6);
  assert.ok(sensor.project.components.length >= 5);
  assert.ok(power.project.components.length >= 6);
  assert.notDeepEqual(
    [microcontroller.project.board.width, microcontroller.project.board.height],
    [sensor.project.board.width, sensor.project.board.height],
  );
  for (const template of BUILT_IN_TEMPLATES) {
    assert.equal(
      new Set(
        template.project.components.map((component) => component.instanceId),
      ).size,
      template.project.components.length,
    );
  }
});

test("ships an isolated built-in L10 design template", () => {
  const template = BUILT_IN_TEMPLATES.find((item) => item.name === "L10 Design");

  assert.ok(template);
  assert.equal(template?.isBuiltIn, true);
  assert.notEqual(template?.project.name, createBlankProject().name);
});
