import assert from "node:assert/strict";
import test from "node:test";
import {
  bomRefTokens, buildBomDiffGroups, carryBomTracking, diffBomRecords, matchBomVendorLines, mergeBomTrackingHistories,
} from "../src/components/material-requests/bomDiff.ts";

let counter = 0;
const row = (overrides: Record<string, unknown> = {}) => ({
  id: `sheet-${++counter}`,
  sectionName: "Board",
  assemblyName: "Power",
  level: 2,
  name: "CAP 0.1uF 16V",
  qty: "2",
  refDes: "C101, C102",
  manufacturerPartNumber: "MPN-A",
  manufacturerPartNumberAlt: "",
  manufacturer: "Vendor A",
  sourcingStatus: "Approved",
  refGroup: "C101, C102",
  lv: "",
  remark: "",
  partNumber: "000-001",
  partName: "MLCC",
  partSpec: "0.1uF/16V",
  schematicPart: "CAP",
  pcbFootprint: "C0402",
  phaseOutStatus: "ACTIVE",
  partUsageStatus: "",
  ...overrides,
}) as never;

test("ref tokens are split, upper-cased, de-duplicated and numerically ordered", () => {
  assert.deepEqual(bomRefTokens("c10, C2,，c2 ; C1\nC1_C0P1"), ["C1", "C1_C0P1", "C2", "C10"]);
  assert.deepEqual(bomRefTokens("-"), []);
});

test("groups follow Ref Des, and rows without Ref Des fall back to part identity", () => {
  const groups = buildBomDiffGroups([
    row({ refDes: "C1" }), row({ refDes: "C1", manufacturer: "Vendor B", manufacturerPartNumber: "MPN-B", partNumber: "000-002" }),
    row({ refDes: "", refGroup: "", virtualAlternative: "VIRT-1" }), row({ refDes: "", refGroup: "", virtualAlternative: "", partNumber: "000-009" }),
  ]);
  assert.deepEqual(groups.map((group) => group.key), ["C1", "noref:virtual:VIRT-1", "noref:part:000-009"]);
  assert.equal(groups[0].rows.length, 2);
  assert.equal(groups[0].primary.manufacturer, "Vendor A");
});

test("vendor lines match by 實體料號 first, then 廠商+MPN, then MPN", () => {
  const before = [row({ partNumber: "000-001", manufacturerPartNumber: "OLD-MPN" }), row({ partNumber: "", manufacturer: "Vendor B", manufacturerPartNumber: "MPN-B" }), row({ partNumber: "", manufacturer: "Vendor C", manufacturerPartNumber: "MPN-C" })];
  const after = [row({ partNumber: "", manufacturer: "Vendor C (new name)", manufacturerPartNumber: "MPN-C" }), row({ partNumber: "000-001", manufacturerPartNumber: "NEW-MPN" }), row({ partNumber: "", manufacturer: "Vendor B", manufacturerPartNumber: "MPN-B" })];
  const matches = matchBomVendorLines(before, after);
  const pairs = matches.filter((match) => match.before && match.after).map((match) => [match.before!.manufacturerPartNumber, match.after!.manufacturerPartNumber]);
  assert.deepEqual(pairs.sort(), [["MPN-B", "MPN-B"], ["MPN-C", "MPN-C"], ["OLD-MPN", "NEW-MPN"]]);
});

test("re-ordered rows and inserted rows are not changes; a positional merge would have broken here", () => {
  const a = row({ refDes: "C1" });
  const b = row({ refDes: "R1", name: "RES 10K" });
  const c = row({ refDes: "U1", name: "IC" });
  const result = diffBomRecords([a, b, c], [row({ ...c }), row({ ...a }), row({ refDes: "D9", name: "LED", partNumber: "000-555" }), row({ ...b })]);
  assert.equal(result.summary.unchanged, 3);
  assert.equal(result.summary.added, 1);
  assert.equal(result.summary.removed, 0);
  assert.equal(result.summary.changed, 0);
  assert.deepEqual(result.entries.find((entry) => entry.kinds.includes("added"))?.displayRef, "D9");
});

test("Ref Des growth, qty, primary part, alternates, status and spec changes are classified with the right impact", () => {
  const before = [
    row({ refDes: "C101, C102", qty: "2" }),
    row({ refDes: "R1", name: "RES 10K", partNumber: "000-010", manufacturerPartNumber: "R-A", manufacturer: "Vendor A" }),
    row({ refDes: "R1", name: "RES 10K", partNumber: "000-011", manufacturerPartNumber: "R-B", manufacturer: "Vendor B" }),
    row({ refDes: "U5", name: "POWER IC", partNumber: "000-050", phaseOutStatus: "ACTIVE", partUsageStatus: "" }),
    row({ refDes: "J1", name: "CONN", partNumber: "000-070", partSpec: "2x5 2.0mm" }),
    row({ refDes: "L1", name: "IND", partNumber: "000-080", manufacturerPartNumber: "L-OLD" }),
  ];
  const after = [
    row({ refDes: "C101, C102, C103", qty: "3" }),
    row({ refDes: "R1", name: "RES 10K", partNumber: "000-011", manufacturerPartNumber: "R-B", manufacturer: "Vendor B" }),
    row({ refDes: "R1", name: "RES 10K", partNumber: "000-012", manufacturerPartNumber: "R-C", manufacturer: "Vendor C" }),
    row({ refDes: "U5", name: "POWER IC", partNumber: "000-050", phaseOutStatus: "PHASEOUT", partUsageStatus: "新設計產品不建議使用－EOL" }),
    row({ refDes: "J1", name: "CONN", partNumber: "000-070", partSpec: "2x5 2.54mm" }),
    row({ refDes: "L1", name: "IND", partNumber: "000-081", manufacturerPartNumber: "L-NEW" }),
  ];
  const result = diffBomRecords(before, after);
  const byRef = new Map(result.entries.map((entry) => [entry.displayRef, entry]));

  const cap = byRef.get("C101, C102, C103")!;
  assert.deepEqual(cap.kinds, ["refDes", "qty"]);
  assert.equal(cap.impact, "production");
  assert.deepEqual(cap.refAdded, ["C103"]);
  assert.deepEqual(cap.changes.map((change) => [change.field, change.before, change.after]), [["refDes", "C101, C102", "C101, C102, C103"], ["qty", "2", "3"]]);

  const res = byRef.get("R1")!;
  assert.ok(res.kinds.includes("primary"), "the former alternate became the primary line");
  assert.ok(res.kinds.includes("vendors"), "Vendor C was added");
  assert.equal(res.lines.filter((line) => line.kind === "removed").length, 1);
  assert.equal(res.lines.filter((line) => line.kind === "added").length, 1);

  const ic = byRef.get("U5")!;
  assert.deepEqual(ic.kinds, ["status"]);
  assert.equal(ic.impact, "status");
  assert.deepEqual(ic.changes.map((change) => change.field), ["phaseOutStatus", "partUsageStatus"]);

  const conn = byRef.get("J1")!;
  assert.deepEqual(conn.kinds, ["spec"]);
  assert.equal(conn.impact, "text");

  const ind = byRef.get("L1")!;
  assert.deepEqual(ind.kinds, ["primary"], "an unmatched single-vendor line swap is a primary part change");
  assert.equal(result.summary.changed, 5);
  assert.equal(result.summary.kinds.status, 1);
  assert.equal(result.summary.kinds.spec, 1);
});

test("numeric quantities compare by value and whitespace-only text differences are ignored", () => {
  const result = diffBomRecords([row({ qty: "2", name: "CAP  0.1uF" })], [row({ qty: "2.0", name: "CAP 0.1uF " })]);
  assert.equal(result.summary.unchanged, 1);
});

test("a split position keeps the tighter match and reports the rest as added", () => {
  const result = diffBomRecords([row({ refDes: "R1, R2" })], [row({ refDes: "R1" }), row({ refDes: "R2", name: "RES other" })]);
  assert.equal(result.summary.added, 1);
  assert.equal(result.summary.changed, 1);
  assert.deepEqual(result.entries.find((entry) => entry.kinds.includes("refDes"))?.refRemoved, ["R2"]);
});

test("tracking on removed vendor lines is reported as lost", () => {
  const tracked = row({ refDes: "U9", trackingStatus: "處理中", trackingHistory: [{ id: "tracking-1", status: "處理中", note: "申請中", createdAt: "2026-10-01T00:00:00.000Z" }] });
  const result = diffBomRecords([tracked, row({ refDes: "U8" })], [row({ refDes: "U8" })]);
  assert.equal(result.summary.trackingLost, 1);
  assert.equal(result.entries.find((entry) => entry.displayRef === "U9")?.trackingLost, 1);
});

test("carry-over moves tracking by content, keeps new imported entries first and reports orphans", () => {
  const previous = [
    row({ id: "old-1", refDes: "C1", trackingStatus: "處理中", requestTicket: "REQ-1", trackingHistory: [{ id: "tracking-a", status: "處理中", note: "RD 手動", createdAt: "2026-10-01T00:00:00.000Z" }], specDocument: { name: "spec.pdf", path: "x/spec.pdf", mimeType: "application/pdf", size: 1, uploadedAt: "2026-10-01T00:00:00.000Z" } }),
    row({ id: "old-2", refDes: "R7", trackingStatus: "已完成", trackingHistory: [{ id: "tracking-b", status: "已完成", createdAt: "2026-10-02T00:00:00.000Z" }] }),
    row({ id: "manual-123", refDes: "X1", name: "RD 手動新增" }),
    row({ id: "old-4", refDes: "Q1" }),
  ];
  const next = [
    row({ id: "new-0", refDes: "Q2", name: "inserted row shifts everything below" }),
    row({ id: "new-1", refDes: "C1", trackingHistory: [{ id: "imported-tracking-Sheet-2", status: "新增追蹤", note: "CE 匯入", createdAt: "2026-10-20T00:00:00.000Z" }], trackingStatus: "新增追蹤" }),
    row({ id: "new-2", refDes: "Q1" }),
  ];
  const carried = carryBomTracking(previous, next);
  assert.equal(carried.matched, 2);
  assert.equal(carried.manual, 1);
  assert.deepEqual(carried.orphaned.map((record) => record.refDes), ["R7"]);
  assert.equal(carried.records.length, 4);
  const c1 = carried.records.find((record) => record.refDes === "C1")!;
  assert.deepEqual(c1.trackingHistory!.map((entry) => entry.id), ["imported-tracking-Sheet-2", "tracking-a"]);
  assert.equal(c1.trackingStatus, "新增追蹤");
  assert.equal(c1.requestTicket, "REQ-1");
  assert.equal(c1.specDocument?.name, "spec.pdf");
  assert.equal(carried.records.at(-1)?.id, "manual-123");
  assert.equal(carried.records.find((record) => record.refDes === "Q1")?.trackingStatus, "");
});

test("history merge keeps previous manual entries and refreshes imported ones", () => {
  const merged = mergeBomTrackingHistories(
    [{ id: "imported-tracking-S-1", status: "舊匯入", createdAt: "" }, { id: "tracking-m", status: "處理中", createdAt: "" }],
    [{ id: "imported-tracking-S-1", status: "新匯入", createdAt: "" }],
  );
  assert.deepEqual(merged.map((entry) => [entry.id, entry.status]), [["imported-tracking-S-1", "新匯入"], ["tracking-m", "處理中"]]);
});

test("two 7,000-row versions compare in well under a second", () => {
  const make = (offset: number) => Array.from({ length: 7000 }, (_, index) => row({ id: `r-${index}`, refDes: `C${index + offset}`, partNumber: `000-${index}` }));
  const started = performance.now();
  const result = diffBomRecords(make(0), make(1));
  assert.ok(performance.now() - started < 1000);
  assert.equal(result.summary.added + result.summary.removed + result.summary.changed + result.summary.unchanged, result.entries.length);
});
