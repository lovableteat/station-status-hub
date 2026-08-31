import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { BUILT_IN_COMPONENTS, createBlankProject } from "../../src/components/pcb-designer/defaults.ts";
import { getComponentKeepout, getComponentKeepoutBounds, getRenderedKeepouts, isValidComponentKeepout, resizeComponentKeepoutSide } from "../../src/components/pcb-designer/core/componentKeepout.ts";
import { canPlaceComponent } from "../../src/components/pcb-designer/core/geometry.ts";
import { runDrc } from "../../src/components/pcb-designer/core/drc.ts";
import { editSelectedObject, moveObjects } from "../../src/components/pcb-designer/core/editor.ts";
import { duplicatePcbSelection } from "../../src/components/pcb-designer/core/selection.ts";
import { createWorkspaceState, reduceWorkspaceState } from "../../src/components/pcb-designer/core/workspace.ts";
import { normalizePcbSaveState, parseProjectJson } from "../../src/components/pcb-designer/core/validation.ts";
import { exportProjectJson } from "../../src/components/pcb-designer/core/exports.ts";
import { mergePcbRemoteState, syncPcbRemote } from "../../src/components/pcb-designer/core/remoteSync.ts";
import type { PcbPlacedComponent, PcbSaveState } from "../../src/components/pcb-designer/types.ts";

const margins = { top: 1, right: 2, bottom: 3, left: 4 };
const part = (patch: Partial<PcbPlacedComponent> = {}): PcbPlacedComponent => ({
  ...BUILT_IN_COMPONENTS[0], instanceId: "owner", reference: "U1", width: 10, height: 4,
  x: 40, y: 40, rotation: 0, layer: "top", locked: false, keepout: { ...margins }, ...patch,
});
const board = (...components: PcbPlacedComponent[]) => ({ ...createBlankProject("Keepout test"), components });
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);

test("four margins expand only their corresponding local edge", () => {
  const component = part();
  assert.deepEqual(getComponentKeepoutBounds(component), { x: -9, y: -3, width: 16, height: 8 });
  assert.deepEqual(resizeComponentKeepoutSide(component, "right", { x: 52, y: 15 }), { ...margins, right: 7 });
  assert.deepEqual(resizeComponentKeepoutSide(component, "left", { x: 37, y: 12 }), { ...margins, left: 0 });
  assert.deepEqual(resizeComponentKeepoutSide(component, "top", { x: 10, y: 36.7 }, 1), { ...margins, top: 1 });
  assert.deepEqual(resizeComponentKeepoutSide(component, "bottom", { x: 2, y: 47.25 }), { ...margins, bottom: 5.25 });
});

test("asymmetric keepouts rotate about their owner's center, not their own offset center", () => {
  const zone = getComponentKeepout(part({ rotation: 90 }))!;
  near(zone.x + zone.width / 2, 39);
  near(zone.y + zone.height / 2, 39);
  assert.equal(zone.rotation, 90);
  assert.deepEqual(resizeComponentKeepoutSide(part({ rotation: 90 }), "right", { x: 20, y: 52 }), { ...margins, right: 7 });
  const rotated = part({ rotation: 33 });
  const angle = 33 * Math.PI / 180;
  const point = { x: 40 + 12 * Math.cos(angle), y: 40 + 12 * Math.sin(angle) };
  assert.deepEqual(resizeComponentKeepoutSide(rotated, "right", point), { ...margins, right: 7 });
});

test("owner is exempt, other same-layer components collide, opposite layer stays legal", () => {
  const owner = part();
  const other = part({ instanceId: "other", reference: "U2", width: 1, height: 1, x: 46.5, keepout: undefined });
  assert.deepEqual(runDrc(board(owner)), []);
  assert.equal(canPlaceComponent(board(owner), owner), true);
  assert.equal(canPlaceComponent(board(owner), other), false);
  assert.equal(canPlaceComponent(board(other), owner), false);
  const issues = runDrc(board(owner, other));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, "KEEPOUT_COLLISION");
  assert.deepEqual(issues[0].objectIds, ["other", "owner"]);
  assert.deepEqual(runDrc(board(owner, { ...other, layer: "bottom" })), []);
  assert.equal(canPlaceComponent(board(owner), { ...other, layer: "bottom" }), true);
});

test("keepout boundary violations remain visible and block automatic placement", () => {
  const owner = part({ x: 8 });
  assert.equal(canPlaceComponent(board(), owner), false);
  const issues = runDrc(board(owner));
  assert.equal(issues.length, 1);
  assert.deepEqual(issues[0].objectIds, ["owner"]);
  assert.match(issues[0].message, /禁制區超出板框/);
});

test("move, mixed group move, rotate, duplicate and delete preserve attachment without extra objects", () => {
  const project = board(part());
  project.keepouts = [{ id: "free", name: "Free", x: 65, y: 65, width: 4, height: 4, color: "#f00" }];
  const moved = moveObjects(project, ["owner", "free"], { x: 3, y: 4 }, true);
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  const originalZone = getComponentKeepout(project.components[0])!;
  const movedZone = getComponentKeepout(moved.project.components[0])!;
  near(movedZone.x, originalZone.x + 3);
  near(movedZone.y, originalZone.y + 4);
  const rotated = editSelectedObject(moved.project, { kind: "component", id: "owner" }, { type: "rotate" });
  assert.equal(getComponentKeepout(rotated.components[0])!.rotation, 90);
  const copied = duplicatePcbSelection(rotated, ["owner"]);
  assert.ok(copied);
  assert.deepEqual(copied.project.components[1].keepout, margins);
  assert.notEqual(getComponentKeepout(copied.project.components[1])!.id, movedZone.id);
  assert.equal(copied.project.keepouts.length, 1);
  const deleted = editSelectedObject(project, { kind: "component", id: "owner" }, { type: "delete" });
  assert.equal(getRenderedKeepouts(deleted, "all").length, 1);
  assert.deepEqual(project.components[0], part());
});

test("JSON round-trip, normalized storage and undo/redo retain per-side values; legacy boards stay valid", () => {
  const project = board(part({ keepout: undefined }));
  const data: PcbSaveState = { projects: [project], templates: [], library: [], activeProjectId: project.id, updatedAt: project.updatedAt };
  const initial = createWorkspaceState(data, true);
  const committed = reduceWorkspaceState(initial, { type: "project/commit", update: { ...project, components: [part()] } });
  const parsed = parseProjectJson(JSON.parse(exportProjectJson(committed.activeProject)));
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(parsed.value.components[0].keepout, margins);
  assert.deepEqual(normalizePcbSaveState(committed.data).projects[0].components[0].keepout, margins);
  const undone = reduceWorkspaceState(committed, { type: "history/undo" });
  assert.equal(undone.activeProject.components[0].keepout, undefined);
  const redone = reduceWorkspaceState(undone, { type: "history/redo" });
  assert.deepEqual(redone.activeProject.components[0].keepout, margins);
  assert.equal(parseProjectJson(project).ok, true);
  assert.equal(reduceWorkspaceState(createWorkspaceState(data, false), { type: "project/commit", update: board(part()) }).activeProject.components[0].keepout, undefined);
});

test("invalid, missing or negative margins cannot enter imported documents", () => {
  for (const invalid of [null, {}, { ...margins, left: -1 }, { ...margins, right: Infinity }, { ...margins, top: NaN }, { ...margins, bottom: "2" }]) {
    assert.equal(isValidComponentKeepout(invalid), false);
    assert.equal(parseProjectJson(board(part({ keepout: invalid as never }))).ok, false);
  }
  assert.equal(isValidComponentKeepout({ top: 0, right: 0, bottom: 0, left: 0 }), true);
});

test("existing remote payload and account save paths preserve keepouts without a schema migration", async () => {
  const project = board(part());
  const data: PcbSaveState = { projects: [project], templates: [], library: [], activeProjectId: project.id, updatedAt: project.updatedAt };
  const captured: Record<string, unknown[]> = {};
  assert.equal(await syncPcbRemote({ from: (table) => ({
    upsert: async (rows) => { captured[table] = structuredClone(rows); return { error: null }; },
    delete: () => ({ in: async () => ({ error: null }) }),
  }) }, data), true);
  const uploaded = captured.pcb_designer_projects[0] as { payload: typeof project };
  assert.deepEqual(uploaded.payload.components[0].keepout, margins);
  assert.equal(await syncPcbRemote({ save: async (snapshot) => {
    assert.deepEqual(snapshot.projects[0].components[0].keepout, margins);
    return true;
  } }, data), true);
  assert.deepEqual(mergePcbRemoteState({ ...data, projects: [{ ...project, components: [] }] }, data).projects[0].components[0].keepout, margins);
});

test("3D rendered zones respect owner layer and use owner selection identity", () => {
  const project = board(part(), part({ instanceId: "bottom", layer: "bottom" }));
  assert.equal(getRenderedKeepouts(project, "all").length, 2);
  assert.deepEqual(getRenderedKeepouts(project, "bottom").map((zone) => zone.componentId), ["bottom"]);
});

test("right-click exposes settings without the redundant heading and supports four side handles", () => {
  const canvas = readFileSync(new URL("../../src/components/pcb-designer/PcbCanvas.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(canvas, /元件操作/);
  assert.match(canvas, /設定元件禁制區/);
  assert.match(canvas, /data-keepout-side=\{side\}/);
  assert.match(canvas, /resizeComponentKeepoutSide/);
  assert.match(canvas, /disabled=\{!workspace.canMutate \|\| contextComponentLocked\}/);
});
