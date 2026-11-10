import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loader } = require("../../../tests/support/renderHarness.cjs");
const load = loader();
const { circuitSetLabel, groupCircuitChangeEvents, latestCircuitReturn, CIRCUIT_EVENT_LABELS } = load("src/components/circuit-changes/presentation.ts");
const { CIRCUIT_CHANGE_FIELD_LIMITS, circuitChangeMissingForReview, defaultCircuitChangeSet, isUnsavedCircuitChange } = load("src/components/circuit-changes/types.ts");
const event = (revision, type, actorId = "a", note = "") => ({ id: `e${revision}`, itemId: "item", setId: "set", type, actorId, actorName: actorId, revision, note, createdAt: `2026-11-09T0${revision}:00:00Z` });

test("consecutive auto-saved edits by one person are one history entry and every revision stays reachable", () => {
  const groups = groupCircuitChangeEvents([event(1, "created"), event(2, "edited"), event(3, "edited"), event(4, "edited"), event(5, "submit"), event(6, "edited", "b"), event(7, "edited"), event(8, "edited", "a", "note"), event(9, "edited")]);
  assert.equal(groups.map(group => `${group.latest.revision}:${group.events.length}`).join(" "), "9:1 8:1 7:1 6:1 5:1 4:3 1:1");
  assert.equal(groups.find(group => group.latest.revision === 4).events.map(row => row.revision).join(), "4,3,2");
  assert.equal(groups.reduce((total, group) => total + group.events.length, 0), 9, "nothing is dropped from the history");
});

test("the reason shown on a returned change is the newest return, under either event spelling", () => {
  const events = [event(2, "request_changes", "boss", "first"), event(5, "changes_requested", "boss", "second"), event(6, "edited")];
  assert.equal(latestCircuitReturn(events, 6).note, "second");
  assert.equal(latestCircuitReturn(events, 4).note, "first");
  assert.equal(latestCircuitReturn([event(1, "created")], 3), null);
  assert.equal(CIRCUIT_EVENT_LABELS.submit, CIRCUIT_EVENT_LABELS.submitted);
});

test("the batch created with the first change is named after the version on screen", () => {
  assert.equal(JSON.stringify(defaultCircuitChangeSet("V1")), JSON.stringify({ title: "V1 → V2 線路修改", fromLabel: "V1", toLabel: "V2" }));
  assert.equal(defaultCircuitChangeSet("V3 (2)").toLabel, "V4");
  assert.equal(JSON.stringify(defaultCircuitChangeSet("Rev B")), JSON.stringify({ title: "Rev B 線路修改", fromLabel: "Rev B", toLabel: "" }));
  assert.equal(defaultCircuitChangeSet("").title, "線路修改", "the server refuses an empty batch name");
  assert.equal(circuitSetLabel({ title: "V1 → V2 線路修改", fromLabel: "V1", toLabel: "V2" }), "V1 → V2 線路修改", "the versions are not repeated");
  assert.equal(circuitSetLabel({ title: "電源調整", fromLabel: "V1", toLabel: "" }), "電源調整 · V1 → 待指定");
  assert.equal(circuitSetLabel({ title: "電源調整", fromLabel: "", toLabel: "" }), "電源調整");
});

test("what is still missing before review matches the server rule, and field limits match the server validator", () => {
  const content = { title: "", reason: "", description: "", refs: "", net: "", page: "", owner: "", images: [] };
  assert.equal(circuitChangeMissingForReview(content).join(), "標題,改善說明或改好後截圖");
  assert.equal(circuitChangeMissingForReview({ ...content, title: " R1 ", images: [{ side: "before" }] }).join(), "改善說明或改好後截圖");
  assert.equal(circuitChangeMissingForReview({ ...content, title: "R1", images: [{ side: "after" }] }).length, 0);
  assert.equal(circuitChangeMissingForReview({ ...content, title: "R1", description: "改值" }).length, 0);
  assert.equal(isUnsavedCircuitChange({ revision: 0 }), true); assert.equal(isUnsavedCircuitChange({ revision: 1 }), false); assert.equal(isUnsavedCircuitChange(null), false);
  const sql = require("node:fs").readFileSync("supabase/migrations/20261109042334_circuit_change_tracking.sql", "utf8");
  const limits = sql.match(/maximum := case field (.+?) else (\d+) end/);
  const server = Object.fromEntries([...limits[1].matchAll(/when '(\w+)' then (\d+)/g)].map(match => [match[1], Number(match[2])]));
  for (const [field, limit] of Object.entries(CIRCUIT_CHANGE_FIELD_LIMITS)) assert.equal(limit, server[field] ?? Number(limits[2]), `${field} must not accept more text than the server stores`);
});
