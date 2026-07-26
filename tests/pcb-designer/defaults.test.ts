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
  assert.equal(BUILT_IN_TEMPLATES.length, 4);
  assert.equal(
    new Set(BUILT_IN_TEMPLATES.map((item) => item.id)).size,
    BUILT_IN_TEMPLATES.length,
  );
});
