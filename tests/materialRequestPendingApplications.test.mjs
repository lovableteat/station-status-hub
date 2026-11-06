import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const presentationSource = await readFile(new URL("../src/components/material-requests/materialRequestPresentation.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(presentationSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace('"./materialTrackingStatus.ts"', JSON.stringify(new URL("../src/components/material-requests/materialTrackingStatus.ts", import.meta.url).href));
const { buildPendingApplications, groupPendingMaterials } = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

const record = (id, mpn, needsApplication, extra = {}) => ({ id, manufacturer: `Vendor ${id}`, manufacturerPartNumber: mpn, needsApplication, name: "", ...extra });
const group = (key, displayRef, records, extra = {}) => ({ key, displayRef, name: `Part ${key}`, searchText: displayRef.toLowerCase(), primaryRecord: records[0], records, ...extra });

test("completed applications reappear from existing history even after numbers are filled, without adding ordinary BOM rows", () => {
  const progress = [
    { id: "tracking-1793085268476-qu0bxe", status: "處理中", createdAt: "2026-10-27T07:14:28.476Z" },
    { id: "tracking-first-completion", status: "已完成", createdAt: "2026-11-02T02:30:10.207Z" },
    { id: "tracking-required", status: "需申請", createdAt: "2026-11-02T07:58:37.333Z" },
    { id: "tracking-final-completion", status: "已完成", createdAt: "2026-11-02T08:24:13.739Z" },
  ];
  const completed = record("recovered", "WFCP06125L000FE66", false, { partNumber: "10Z2-01BL0ZY", trackingStatus: "已完成", trackingHistory: progress });
  const before = structuredClone(completed);
  const normal = record("ordinary", "NORMAL", false, { trackingStatus: "已完成", trackingHistory: [{ id: "imported-tracking-normal", status: "已完成" }] });
  const untracked = record("untracked", "READY", false, { trackingStatus: "已完成" });
  for (const options of [undefined, { includeAlternates: true }]) {
    const items = buildPendingApplications([group("g", "RS50", [normal, completed]), group("ready", "R1", [untracked])], options);
    assert.deepEqual(items.map(item => item.key), ["g::recovered"]);
    assert.equal(items[0].record, completed);
    assert.match(items[0].searchText, /已完成/);
  }
  assert.deepEqual(completed, before, "recovery only changes visibility; stored history remains intact");
});

test("a recorded application stays in the same board and vendor row through every stage including completion and reopening", () => {
  const statuses = ["需申請", "已發信", "文件已收齊", "料號申請中", "已取得料號待CIS申請", "已完成", "申請料被退回"];
  let current = record("vendor-a", "MPN-A", true, { trackingHistory: [] });
  for (const status of statuses) {
    current = { ...current, needsApplication: false, partNumber: "000-REAL", trackingStatus: status, trackingHistory: [...current.trackingHistory, { id: `tracking-${status}`, status }] };
    for (const options of [undefined, { includeAlternates: true }]) {
      const items = buildPendingApplications([group("board-1-location", "U1", [record("ready-vendor", "MPN-B", false), current])], options);
      assert.deepEqual(items.map(item => [item.key, item.record.trackingStatus]), [["board-1-location::vendor-a", status]]);
    }
  }
});

test("older manual completion entries and application stages stay visible, while ME exemptions still apply", () => {
  const completed = record("completed", "OLD", false, { trackingStatus: "已完成", trackingHistory: [{ id: "tracking-1793085199180-aya11v", status: "處理中" }, { id: "tracking-done", status: "已完成" }] });
  const direct = record("direct", "DIRECT", false, { trackingStatus: "已完成", trackingHistory: [{ id: "tracking-done-only", status: "已完成" }] });
  const exempt = { ...completed, id: "me", applicationExempt: true };
  assert.deepEqual(buildPendingApplications([group("g", "U370", [completed, direct, exempt])]).map(item => item.record.id), ["completed", "direct"]);
});

test("manual SYMBOL applications with an existing part number remain visible and searchable by their assignee", () => {
  const symbol = record("symbol", "0000123", false, {trackingStatus:"SYMBOL申請中", requestOwnerName:"CE 王同學"});
  const normal = record("normal", "0000456", false, {schematicPart:"", symbolStatus:"missing"});
  const items = buildPendingApplications([group("U1","U1",[symbol]),group("U2","U2",[normal])]);
  assert.equal(items.length,1);
  assert.equal(items[0].record.id,"symbol");
  assert.match(items[0].searchText,/ce 王同學/);
});

test("an explicitly required application remains pending with existing numbers in both views and is searchable", () => {
  const required = record("required", "MPN-REQUIRED", false, { partNumber: "REAL-REQUIRED", virtualAlternative: "VIRTUAL-REQUIRED", trackingStatus: "已發信", applicationRequired: true });
  const g = group("required-group", "J200", [record("normal", "MPN-NORMAL", false), required]);
  for (const options of [undefined, { includeAlternates: true }]) {
    const applications = buildPendingApplications([g], options);
    assert.equal(applications.length, 1);
    assert.equal(applications[0].record, required);
    assert.match(applications[0].searchText, /需申請/);
    assert.equal(applications[0].record.trackingStatus, "已發信");
    assert.equal(buildPendingApplications([{ ...g, records: g.records.map(row => ({ ...row, applicationRequired: false })) }], options).length, 0);
  }
});

test("follow-up, supplier communication and returned requests stay pending even with an existing part number", () => {
  for (const status of ["未回應再次發信", "與廠商溝通中", "申請料被退回"]) {
    const active = record("request", "MPN-1", false, { trackingStatus: status, partNumber: "REAL-1" });
    const done = record("done", "MPN-2", false, { trackingStatus: "已完成", partNumber: "REAL-2" });
    const items = buildPendingApplications([group("active", "U1", [active]), group("done", "U2", [done])]);
    assert.equal(items.length, 1);
    assert.equal(items[0].record.trackingStatus, status);
    assert.ok(items[0].searchText.includes(status));
    assert.equal(buildPendingApplications([group("active", "U1", [active])], { includeAlternates: true }).length, 1);
  }
});

test("by default only locations with no number on any vendor row are listed, once each", () => {
  const c291 = group("g1", "C291_C1", [record("a", "C1608", true), record("b", "AMK107", false), record("c", "C0603", true)]);
  const empty = group("g2", "C5", [record("d", "X", true), record("e", "Y", true)]);
  const done = group("g3", "R5", [record("f", "RC0402", false)]);
  assert.deepEqual(buildPendingApplications([c291, empty, done]).map((item) => [item.key, item.record.manufacturerPartNumber]), [["g2::d", "X"]]);
});

test("with alternates, one line per vendor row still to apply for, in location order, never merged across locations", () => {
  const c291 = group("g1", "C291_C1", [
    record("a", "C1608X6S226MBTS", true),
    record("b", "AMK107BC6226MA-T", false),
    record("c", "C0603S226M004T", true),
  ]);
  const u1 = group("g2", "U1_C0P1", [record("d", "RAA228942", true)]);
  const u2 = group("g3", "U1_C0P2", [record("e", "RAA228942", true)]);
  const done = group("g4", "R5", [record("f", "RC0402", false)]);
  const applications = buildPendingApplications([c291, u1, u2, done], { includeAlternates: true });
  assert.deepEqual(applications.map((item) => [item.key, item.displayRef, item.record.manufacturerPartNumber]), [
    ["g1::a", "C291_C1", "C1608X6S226MBTS"],
    ["g1::c", "C291_C1", "C0603S226M004T"],
    ["g2::d", "U1_C0P1", "RAA228942"],
    ["g3::e", "U1_C0P2", "RAA228942"],
  ]);
  assert.equal(applications[0].group, c291);
  assert.equal(applications[0].name, "Part g1", "falls back to the location's name");
  assert.match(applications[1].searchText, /c0603s226m004t/);
  assert.match(applications[1].searchText, /vendor c/);
});

test("the primary row is not listed twice and lines keep their location's category", () => {
  const primary = record("p", "X1", true);
  const g = group("g", "J7", [primary, primary, record("q", "X2", true)], { primaryRecord: primary });
  const applications = buildPendingApplications([g], { includeAlternates: true });
  assert.deepEqual(applications.map((item) => item.key), ["g::p", "g::q"]);
  assert.deepEqual(buildPendingApplications([g]).map((item) => item.key), ["g::p"], "the default view lists the location once");
  const categories = groupPendingMaterials(applications);
  assert.deepEqual(categories.map((category) => [category.key, category.groups.length]), [["connector", 2]]);
});

test("a numbered part waiting for CIS stays pending in both location and vendor views", () => {
  const cis = record("cis", "000-MPN-CIS", false, { partNumber: "000-REAL", trackingStatus: "已取得料號待CIS申請" });
  const g = group("cis-group", "J100", [cis]);
  for (const options of [undefined, { includeAlternates: true }]) {
    const applications = buildPendingApplications([g], options);
    assert.equal(applications.length, 1);
    assert.equal(applications[0].record, cis);
  }
});

test("a manually added numbered alternate appears in Other even if its primary has a different manual category", () => {
  const primary = record("primary", "MAIN-MPN", false, { trackingStatus: "需申請", pendingCategory: "ic" });
  const alternate = record("alternate", "ALT-MPN", false, { trackingStatus: "需申請", pendingCategory: "other" });
  const location = group("group", "U777", [primary, alternate]);
  const categories = groupPendingMaterials(buildPendingApplications([location]));
  assert.deepEqual(categories.map(category => [category.key, category.groups.map(application => application.record.id)]), [["ic", ["primary"]], ["other", ["alternate"]]]);
});
