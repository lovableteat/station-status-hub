import assert from "node:assert/strict";
import test from "node:test";
import { applyReplyPatches, pdfTarget, readPdfLocations, rootCauseView } from "../../src/components/comparison/reviewTools.ts";
import { filterTrackingRows, readComparisonFilters } from "../../src/components/comparison/filters.ts";
import { parseSessionSnapshot } from "../../src/components/comparison/storage.ts";
import { exportBackup, importBackup } from "../../src/components/comparison/backup.ts";
import { inspectRevision, NETLIST_ROLES, readRevision, validateRevision } from "../../src/components/comparison/files.ts";
import type { ComparisonSession, TrackRow } from "../../src/components/comparison/types.ts";

const row = (key: string, parent = "", severity = "WARN"): TrackRow => ({ key, parent, gid: key, category: "DRC", rule: "NET_SHORTED", severity, status: "NEW", page: 1, page_title: "POWER", refdes: ["U1"], pins: ["U1.1"], nets: ["P3V3"], title: key, detail: key, related: [], dest: key });
const rows = [row("parent", "", "INFO"), row("child", "parent"), row("boxed-child", "parent", "ERROR"), row("independent")];
rows[0].children = ["child", "boxed-child"];
function session(): ComparisonSession {
  return { version: 1, projectName: "TEST", id: JSON.stringify(["TEST", "A", "B"]), savedAt: "2026-11-04T01:00:00.000Z", replies: {}, history: [], result: { meta: { tool_version: "0.2.0", generated: "2026-11-04", a: { label: "A", sources: [] }, b: { label: "B", sources: [] } }, rows, findings: [], overview: [], capRows: [], railTodo: [], railDomain: [], powerTree: {}, powerTreeA: {}, i2cMap: {}, i2cMapA: {}, inputIssues: [], warnings: [], library: [], artifacts: [] } };
}

test("root-cause folding includes filtered-out parents but never hides boxed or unverified child rows", () => {
  const locations = new Map([["child", { page: 2, centre: null, boxed: false }], ["boxed-child", { page: 2, centre: null, boxed: true }]]);
  assert.deepEqual(rootCauseView(rows, rows.slice(1, 3), true, locations).map(item => item.key), ["parent", "boxed-child"]);
  assert.deepEqual(rootCauseView(rows, rows.slice(1, 3), false, locations).map(item => item.key), ["parent", "child", "boxed-child"]);
  assert.deepEqual(rootCauseView(rows, rows.slice(1, 3), true, locations, "child").map(item => item.key), ["parent", "child", "boxed-child"]);
  assert.deepEqual(rootCauseView(rows, rows.slice(1, 3), true, new Map()).map(item => item.key), ["parent", "child", "boxed-child"]);
});

test("PDF targeting uses physical annotation pages and the native 300 percent centred jump formula", () => {
  const artifacts = [{ key: "annotations", name: "B.annotations.json", mime: "application/json", bytes: new TextEncoder().encode(JSON.stringify({ rows: { parent: { pdf_page: 4, centre_top: [600, 450], boxed: true }, child: { pdf_page: null, boxed: false }, broken: { pdf_page: -1, centre_top: ["bad", null] } } })).buffer }];
  const locations = readPdfLocations(artifacts, "b");
  assert.equal(locations.get("parent")?.page, 4);
  assert.equal(locations.get("child")?.page, null);
  assert.equal(locations.get("broken")?.centre, null);
  assert.equal(readPdfLocations(artifacts, "a").size, 0);
  assert.equal(pdfTarget("blob:local", rows[0], locations.get("parent"), 300, 600, 740), "blob:local#page=4&zoom=300,700,486");
  assert.equal(pdfTarget("blob:local", rows[0], undefined, 300, 600, 740), "blob:local#nameddest=parent");
  assert.equal(pdfTarget("blob:local", rows[0], locations.get("parent"), 0, 600, 740), "blob:local#page=4");
  assert.equal(readPdfLocations([{ ...artifacts[0], bytes: new TextEncoder().encode("broken").buffer }], "b").size, 0);
});

test("batch edits update only touched cells, preserve other reviewers and export through the normal backup", async () => {
  const original = session();
  original.replies.parent = { disp: "自由文字舊處置", owner: "Original RD", target_rev: "C", note: "Original note", filled: "2026-11-03" };
  const first = applyReplyPatches(original, { parent: { owner: " New RD " }, child: { note: " batch note ", disp: "修改" } }, new Date("2026-11-03T17:00:00Z"));
  assert.equal(first.replies.parent.note, "Original note");
  assert.equal(first.replies.parent.disp, "自由文字舊處置");
  assert.equal(first.replies.parent.owner, "New RD");
  assert.equal(first.replies.child.filled, "2026-11-04");
  assert.equal(first.history.length, 3);
  assert.equal(original.history.length, 0);
  const second = applyReplyPatches(first, { parent: { target_rev: "D" } });
  assert.equal(second.replies.parent.owner, "New RD");
  assert.equal(second.replies.child.note, "batch note");
  assert.equal(applyReplyPatches(first, { child: { disp: "修改" } }), first, "no-op must not create history");
  assert.throws(() => applyReplyPatches(first, { missing: { note: "cannot write" } }), /找不到/);
  assert.throws(() => applyReplyPatches(first, { child: { owner: "x".repeat(121) } }), /長度/);
  second.lastReviewKey = "child";
  assert.equal(parseSessionSnapshot(second).lastReviewKey, "child");
  const blob = await exportBackup(second);
  const restored = await importBackup(new File([blob], "backup.autocheck.zip"));
  assert.deepEqual(restored.replies, second.replies);
  assert.deepEqual(restored.history, second.history);
  assert.equal(restored.lastReviewKey, "child");
});

test("native combinations of severity, revision state, rule and disposition filter the same rows", () => {
  const filters = readComparisonFilters("?compareSeverity=ERROR,WARN&compareRevisionStatus=NEW,CHANGE&compareRule=NET_SHORTED,PIN_ISOLATED&compareDisposition=修改");
  const replies = { child: { disp: "修改", owner: "RD", target_rev: "", note: "", filled: "" } };
  assert.deepEqual(filterTrackingRows(rows, replies, filters).map(item => item.key), ["child"]);
  assert.equal(readComparisonFilters("?compareRevisionStatus=bad").revisionStatus, "all");
});

test("single board requires only the three netlist files, OrCAD BOM text remains selectable, and backups retain mode", async () => {
  const files = ["pstxnet.dat", "pstxprt.dat", "pstchip.dat"].map(name => new File(["test"], name));
  assert.equal(validateRevision(inspectRevision(files), {}, NETLIST_ROLES).length, 0);
  assert.ok(validateRevision(inspectRevision(files)).length >= 2);
  assert.equal((await readRevision(inspectRevision(files), {}, NETLIST_ROLES)).length, 3);
  assert.equal(inspectRevision([new File(["Capture Bill of Materials"], "board.BOM")]).roles.bom.length, 1);
  const saved = session(); saved.result.mode = "single"; saved.result.rows = []; saved.result.bomCheck = { BOARD: { stats: {} } };
  const blob = await exportBackup(saved);
  const restored = await importBackup(new File([blob], "single.autocheck.zip"));
  assert.equal(restored.result.mode, "single");
  assert.deepEqual(restored.result.bomCheck, saved.result.bomCheck);
});
