import assert from "node:assert/strict";
import test from "node:test";
import { createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import { objectRevision, projectRevision, sameProjectScope } from "../../src/components/pcb-designer/core/workspaceRevision.ts";

test("reference-equal boards skip revision reads and changed snapshots are hashed only once", () => {
  let reads = 0;
  const boards = Array.from({ length: 26 }, (_, i) => {
    const project = createBlankProject(`測試板 ${i}`);
    Object.defineProperty(project, "description", { enumerable: true, get() { reads++; return ""; } });
    return Object.freeze(project);
  });
  for (let pass = 0; pass < 40; pass++) for (const project of boards) assert.equal(sameProjectScope(project, project), true);
  assert.equal(reads, 0);
  const changed = { ...boards[0], name: "已修改" };
  reads = 0;
  assert.equal(sameProjectScope(changed, boards[0]), false);
  assert.equal(reads, 1);
  for (let pass = 0; pass < 40; pass++) assert.equal(sameProjectScope(changed, boards[0]), false);
  assert.equal(reads, 1);
});

test("cached revisions preserve content comparison across key order and save metadata", () => {
  const project = createBlankProject("測試板");
  const reordered = Object.fromEntries(Object.entries(project).reverse()) as typeof project;
  assert.equal(projectRevision(project), projectRevision(reordered));
  assert.equal(projectRevision(project, true), projectRevision({ ...project, updatedAt: "2099-01-01", lastEditedBy: "測試者" }, true));
  assert.notEqual(projectRevision(project), projectRevision({ ...project, updatedAt: "2099-01-01" }));
  const pending = Object.freeze([{ reference: "U1", quantity: 1 }]);
  assert.equal(objectRevision(pending), objectRevision([{ quantity: 1, reference: "U1" }]));
  assert.equal(sameProjectScope(project, project, pending, []), false);
});
