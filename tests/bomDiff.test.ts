import assert from "node:assert/strict";
import test from "node:test";
import {
  bomDiffEntryPreview, bomRecordHasTracking, bomRecordHasWebsiteData, bomRefTokens, buildBomDiffGroups, carryBomTracking, describeBomWebsiteData, diffBomRecords,
  describeBomLineHistories, findRetainedApplications, linkBomVersions, matchBomVendorLines, mergeBomTrackingHistories, normalizeBomText, recarryBomTracking,
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

test("independent required selections carry to matching revisions and are not silently lost with removed lines", () => {
  const previous = row({ id: "required-old", refDes: "U1", applicationRequired: true });
  const next = row({ id: "required-new", refDes: "U1" });
  const carried = carryBomTracking([previous], [next]);
  assert.equal(carried.records[0].applicationRequired, true);
  assert.equal(carryBomTracking([previous], [row({ id: "cleared", refDes: "U1", applicationRequired: false })]).records[0].applicationRequired, false);
  assert.equal(carryBomTracking([previous], []).orphaned.length, 1);
});

test("carry-over moves tracking by content, keeps new imported entries first and reports orphans", () => {
  const previous = [
    row({ id: "old-1", refDes: "C1", trackingStatus: "處理中", requestTicket: "REQ-1", trackingHistory: [{ id: "tracking-a", status: "處理中", note: "RD 手動", createdAt: "2026-10-01T00:00:00.000Z" }], specDocument: { name: "spec.pdf", path: "x/spec.pdf", mimeType: "application/pdf", size: 1, uploadedAt: "2026-10-01T00:00:00.000Z" } }),
    row({ id: "old-2", refDes: "R7", partNumber: "000-007", manufacturerPartNumber: "MPN-R7", trackingStatus: "已完成", trackingHistory: [{ id: "tracking-b", status: "已完成", createdAt: "2026-10-02T00:00:00.000Z" }] }),
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
  assert.equal(carried.tracked, 1, "only C1 had website data; Q1 matched but carried nothing");
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

const spec = (name: string) => ({ name, path: `bom/spec/${name}`, mimeType: "application/pdf", size: 1, uploadedAt: "2026-10-01T00:00:00.000Z" });

test("a new upload keeps the website-only data of every matched line: Note, 負責人 and all SPEC files", () => {
  const previous = row({
    id: "old-u1", refDes: "U1", note: "共同筆記：等 RD 回覆", requestOwnerId: "user-7", requestOwnerName: "CE 王同學",
    specDocuments: [spec("a.pdf"), spec("b.step"), spec("c.dwg")], specDocument: spec("a.pdf"),
  });
  const next = row({ id: "new-u1", refDes: "U1" });
  const carried = carryBomTracking([previous], [next]);
  const u1 = carried.records[0];
  assert.equal(u1.note, "共同筆記：等 RD 回覆");
  assert.equal(u1.requestOwnerId, "user-7");
  assert.equal(u1.requestOwnerName, "CE 王同學");
  assert.deepEqual(u1.specDocuments!.map((document) => document.name), ["a.pdf", "b.step", "c.dwg"], "every attachment, not only the first");
  assert.equal(u1.specDocument?.name, "a.pdf");
  assert.equal(carried.tracked, 1);
  assert.equal(u1.id, "new-u1", "the row keeps the new workbook identity");
});

test("lines that only had a Note, a 負責人 or SPEC files are reported when the new version drops them", () => {
  for (const data of [{ note: "只有筆記" }, { requestOwnerName: "CE 李同學" }, { specDocuments: [spec("only.pdf")] }]) {
    const old = row({ refDes: "J9", ...data });
    const result = diffBomRecords([old, row({ refDes: "J1" })], [row({ refDes: "J1" })]);
    assert.equal(result.summary.trackingLost, 1, JSON.stringify(data));
    assert.equal(carryBomTracking([old], []).orphaned.length, 1, JSON.stringify(data));
    assert.ok(describeBomWebsiteData(old).length > 0, JSON.stringify(data));
  }
  assert.equal(bomRecordHasTracking(row({ refDes: "J2", remark: "CE 欄位的備註" })), false, "the workbook remark column is not website data");
  assert.deepEqual(describeBomWebsiteData(row({ trackingStatus: "已發信", requestOwnerName: "王", note: "N", specDocuments: [spec("x.pdf"), spec("y.pdf")] })), ["狀態 已發信", "負責人 王", "Note N", "SPEC 附件 2 個"]);
});

test("switching back to an older version: the version that was current wins over the target's stale tracking", () => {
  const v1 = row({ id: "v1-u1", refDes: "U1", trackingStatus: "已發信", trackingNote: "舊進度", trackingHistory: [{ id: "h1", status: "已發信", note: "舊進度", createdAt: "2026-10-01T00:00:00.000Z" }] });
  const v2 = row({
    id: "v2-u1", refDes: "U1", trackingStatus: "已完成", trackingNote: "最新進度", requestOwnerName: "CE 王同學",
    trackingHistory: [{ id: "h1", status: "已發信", note: "舊進度", createdAt: "2026-10-01T00:00:00.000Z" }, { id: "h2", status: "已完成", note: "最新進度", createdAt: "2026-11-01T00:00:00.000Z" }],
  });
  const asUpload = carryBomTracking([v2], [v1]).records[0];
  assert.equal(asUpload.trackingStatus, "已發信", "the upload rule treats the target's own status as freshly imported — wrong for a switch");
  const switched = carryBomTracking([v2], [v1], { from: "current" }).records[0];
  assert.equal(switched.trackingStatus, "已完成");
  assert.equal(switched.trackingNote, "最新進度");
  assert.equal(switched.requestOwnerName, "CE 王同學");
  assert.deepEqual(switched.trackingHistory!.map((entry) => entry.id), ["h1", "h2"], "no duplicate entries and the latest stays last");
  const olderOnly = row({ id: "v1-r1", refDes: "R1", trackingStatus: "處理中", trackingHistory: [{ id: "h-old", status: "處理中", createdAt: "2026-09-01T00:00:00.000Z" }] });
  const keptOld = carryBomTracking([row({ id: "v2-r1", refDes: "R1" })], [olderOnly], { from: "current" }).records[0];
  assert.equal(keptOld.trackingStatus, "處理中", "when the current version has no tracking at all, the target keeps its own");
  const noteOnly = carryBomTracking([row({ id: "v2-r1n", refDes: "R1", note: "只有筆記" })], [olderOnly], { from: "current" }).records[0];
  assert.equal(noteOnly.trackingStatus, "處理中", "a Note alone does not clear the target's status");
  assert.equal(noteOnly.note, "只有筆記");
});

test("switching back never brings back a Note, 負責人, SPEC file or 分類 that the current version cleared", () => {
  const target = row({ id: "v1-c1", refDes: "C1", note: "舊筆記", requestOwnerId: "user-1", requestOwnerName: "舊負責人", specDocuments: [spec("old.pdf")], specDocument: spec("old.pdf"), pendingCategory: "ic" });
  const cleared = row({ id: "v2-c1", refDes: "C1", note: "", trackingStatus: "已發信" });
  const switched = carryBomTracking([cleared], [target], { from: "current" }).records[0];
  assert.equal(switched.note, "");
  assert.equal(switched.requestOwnerId, undefined);
  assert.equal(switched.requestOwnerName, undefined);
  assert.equal(switched.specDocuments, undefined);
  assert.equal(switched.specDocument, undefined);
  assert.equal(switched.pendingCategory, undefined, "分類 back to automatic stays automatic");
  const renamed = carryBomTracking([row({ id: "v2-c1b", refDes: "C1", requestOwnerName: "新負責人" })], [target], { from: "current" }).records[0];
  assert.equal(renamed.requestOwnerName, "新負責人");
  assert.equal(renamed.requestOwnerId, undefined, "a 負責人 typed by name does not keep the old account id");
});

test("switching back and forth keeps history in date order and the status of the newest entry", () => {
  const h1 = { id: "h1", status: "已發信", createdAt: "2026-10-01T00:00:00.000Z" };
  const h2 = { id: "h2", status: "已完成", createdAt: "2026-11-01T00:00:00.000Z" };
  // V2 reached 已完成; V1 was made current without carrying, then V2 is made current again carrying from V1.
  const v2 = row({ id: "v2-u1", refDes: "U1", trackingStatus: "已完成", trackingHistory: [h1, h2] });
  const v1 = row({ id: "v1-u1", refDes: "U1", trackingStatus: "已發信", trackingHistory: [h1] });
  const back = carryBomTracking([v1], [v2], { from: "current" }).records[0];
  assert.deepEqual(back.trackingHistory!.map((entry) => entry.id), ["h1", "h2"]);
  assert.equal(back.trackingStatus, "已完成", "the status follows the newest entry instead of going back");
  const undated = { id: "h0", status: "未處理", createdAt: "" };
  const withUndated = carryBomTracking([v1], [row({ id: "v2-u1b", refDes: "U1", trackingHistory: [undated, h1, h2] })], { from: "current" }).records[0];
  assert.deepEqual(withUndated.trackingHistory!.map((entry) => entry.id), ["h0", "h1", "h2"]);
  assert.equal(withUndated.trackingHistory![0].createdAt, "", "an undated entry is never given a date");
});

test("switching back: a ticket cleared alongside the target's newer entries stays cleared", () => {
  const h1 = { id: "h1", status: "已發信", createdAt: "2026-10-01T00:00:00.000Z", requestTicket: "REQ-1" };
  const h2 = { id: "h2", status: "已完成", createdAt: "2026-11-01T00:00:00.000Z", requestTicket: "", requestUrl: "" };
  const current = row({ id: "v1-u2", refDes: "U2", trackingStatus: "已發信", requestTicket: "REQ-1", requestUrl: "https://old.example/req", trackingHistory: [h1] });
  const target = row({ id: "v2-u2", refDes: "U2", trackingStatus: "已完成", requestTicket: "", requestUrl: "", trackingHistory: [h1, h2] });
  const switched = carryBomTracking([current], [target], { from: "current" }).records[0];
  assert.equal(switched.trackingStatus, "已完成");
  assert.equal(switched.requestTicket, "");
  assert.equal(switched.requestUrl, "");
});

test("switching back: progress the current version keeps only on the record is not hidden behind the target's history", () => {
  const current = row({ id: "v2-u3", refDes: "U3", trackingStatus: "需申請", requestTicket: "REQ-9" });
  const target = row({ id: "v1-u3", refDes: "U3", trackingStatus: "已完成", trackingHistory: [{ id: "t1", status: "已完成", createdAt: "2026-09-01T00:00:00.000Z" }] });
  const switched = carryBomTracking([current], [target], { from: "current" }).records[0];
  assert.equal(switched.trackingStatus, "需申請");
  const last = switched.trackingHistory!.at(-1)!;
  assert.equal(last.status, "需申請", "the latest entry, which the page shows, is the current version's progress");
  assert.equal(last.requestTicket, "REQ-9");
  assert.equal(last.createdAt, "", "kept as an undated legacy entry, no date invented");
  assert.deepEqual(switched.trackingHistory!.map((entry) => entry.id), ["t1", "legacy-tracking-status"]);
  const collide = carryBomTracking([current], [row({ id: "v1-u3b", refDes: "U3", trackingHistory: [{ id: "legacy-tracking-status", status: "處理中", createdAt: "" }] })], { from: "current" }).records[0];
  assert.deepEqual(collide.trackingHistory!.map((entry) => entry.id), ["legacy-tracking-status", "legacy-tracking-status:v2-u3"], "the target's own legacy entry is kept too");
  // A carries to B, B is left without carrying back, then A carries to B again: the same legacy entry is not stored twice.
  const once = carryBomTracking([current], [target], { from: "current" }).records[0];
  const again = carryBomTracking([current], [once], { from: "current" }).records[0];
  assert.deepEqual(again.trackingHistory!.map((entry) => entry.id), ["t1", "legacy-tracking-status"]);
  assert.equal(again.trackingStatus, "需申請");
  let repeated = target;
  for (let round = 0; round < 10; round += 1) repeated = carryBomTracking([current], [repeated], { from: "current" }).records[0];
  assert.equal(repeated.trackingHistory!.length, 2, "ten round trips keep one legacy entry");
});

test("switching back keeps the workbook remark when the target has none, like an upload", () => {
  const switched = carryBomTracking([row({ id: "v2-r", refDes: "R5", remark: "CE 備註" })], [row({ id: "v1-r", refDes: "R5", remark: "" })], { from: "current" }).records[0];
  assert.equal(switched.remark, "CE 備註");
  const own = carryBomTracking([row({ id: "v2-r2", refDes: "R5", remark: "CE 備註" })], [row({ id: "v1-r2", refDes: "R5", remark: "舊版自己的" })], { from: "current" }).records[0];
  assert.equal(own.remark, "舊版自己的");
});

test("a line that only has a 待處理 分類 counts as carried and is reported when it is dropped", () => {
  const categorised = row({ refDes: "J7", pendingCategory: "connector" });
  assert.equal(carryBomTracking([categorised], [row({ refDes: "J7" })]).tracked, 1);
  assert.equal(carryBomTracking([categorised], [row({ refDes: "J7" })]).records[0].pendingCategory, "connector");
  assert.equal(carryBomTracking([categorised], []).orphaned.length, 1);
  assert.deepEqual(describeBomWebsiteData(categorised), ["待處理分類 CONNECTOR"]);
});

test("the 變更內容 preview names the vendor lines that came and went instead of counting them", () => {
  const before = [row({ refDes: "U1", manufacturer: "Vendor A", manufacturerPartNumber: "MPN-8", partNumber: "000-8" })];
  const after = [row({ refDes: "U1", manufacturer: "Vendor C", manufacturerPartNumber: "MPN-8B", partNumber: "000-8B" })];
  const entry = diffBomRecords(before, after).entries[0];
  assert.deepEqual(bomDiffEntryPreview(entry), ["移除廠商：Vendor A / MPN-8", "新增廠商：Vendor C / MPN-8B"]);
  const qty = diffBomRecords([row({ refDes: "R1", qty: "1" })], [row({ refDes: "R1", qty: "3" })]).entries[0];
  assert.deepEqual(bomDiffEntryPreview(qty), ["Qty：1 → 3"]);
  const added = diffBomRecords([], [row({ refDes: "D5" })]).entries[0];
  assert.deepEqual(bomDiffEntryPreview(added), ["新版新增 1 筆廠商明細"]);
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

// 2026-11-17 Baseboard: V2 left 64 of 68 tracked lines behind. Alternate vendor rows that the old Excel grouped
// under a short Ref_tmp, renumbered locations and MPNs typed without their dashes no longer lose their tracking.
const applying = (id: string, status = "料號申請中") => ({ trackingStatus: status, trackingHistory: [{ id, status, createdAt: "2026-11-01T00:00:00.000Z", createdBy: "RD" }] });

test("an alternate vendor row grouped under a short Ref_tmp in the old file keeps its application in the new file", () => {
  const previous = [
    row({ id: "v1-main", refDes: "PL30, PL32", refGroup: "PL30, PL32", partNumber: "000-100", manufacturerPartNumber: "MAIN-1", manufacturer: "CYNTEC" }),
    // Old CE file: the alternate row had no Ref Des of its own, only the Ref_tmp code (the first position).
    row({ id: "v1-alt", refDes: "", refGroup: "PL30", partNumber: "", manufacturerPartNumber: "CMMB051H-4R7MS", manufacturer: "CYNTEC", ...applying("tracking-pl30") }),
  ];
  const next = [
    row({ id: "v2-main", refDes: "PL30, PL32", refGroup: "PL30, PL32", partNumber: "000-100", manufacturerPartNumber: "MAIN-1", manufacturer: "CYNTEC" }),
    row({ id: "v2-alt", refDes: "PL30, PL32", refGroup: "PL30, PL32", partNumber: "", manufacturerPartNumber: "CMMB051H-4R7MS", manufacturer: "CYNTEC" }),
  ];
  const carried = carryBomTracking(previous, next);
  assert.equal(carried.orphaned.length, 0);
  assert.equal(carried.moved, 1);
  assert.equal(carried.tracked, 1);
  assert.equal(carried.records.find((record) => record.id === "v2-alt")?.trackingStatus, "料號申請中");
  const diff = diffBomRecords(previous, carried.records);
  assert.equal(diff.summary.trackingLost, 0, "the comparison agrees with the carry-over");
  const moved = diff.entries.flatMap((entry) => entry.lines).find((line) => line.movedTo);
  assert.equal(moved?.movedTo, "PL30, PL32");
});

test("a renumbered location and an MPN typed without dashes still carry the application", () => {
  const previous = [
    row({ id: "j5", refDes: "J5", name: "CONN", partNumber: "", manufacturerPartNumber: "GP420-50215", manufacturer: "AMPHENOL", ...applying("tracking-j5", "已發信") }),
    row({ id: "r1", refDes: "R1", name: "RES", partNumber: "", manufacturerPartNumber: "RC0402FR-0710KL", manufacturer: "YAGEO", ...applying("tracking-r1") }),
  ];
  const next = [
    row({ id: "j7", refDes: "J7", name: "CONN", partNumber: "", manufacturerPartNumber: "GP420-50215", manufacturer: "Amphenol Corp." }),
    row({ id: "r1n", refDes: "R1", name: "RES", partNumber: "", manufacturerPartNumber: "RC0402FR0710KL", manufacturer: "YAGEO" }),
  ];
  const carried = carryBomTracking(previous, next);
  assert.deepEqual(carried.orphaned.map((record) => record.id), []);
  assert.equal(carried.records.find((record) => record.id === "j7")?.trackingStatus, "已發信");
  assert.equal(carried.records.find((record) => record.id === "r1n")?.trackingStatus, "料號申請中");
});

test("a moved part prefers the new location that shares a Ref Des, and an old line no part matches is still reported", () => {
  const previous = [
    row({ id: "c1", refDes: "C1, C2", partNumber: "", manufacturerPartNumber: "CAP-X", ...applying("tracking-c1") }),
    row({ id: "gone", refDes: "U9", partNumber: "", manufacturerPartNumber: "ONLY-OLD", ...applying("tracking-u9") }),
  ];
  const next = [
    row({ id: "far", refDes: "C80", partNumber: "", manufacturerPartNumber: "CAP-X" }),
    row({ id: "near", refDes: "C2, C3", partNumber: "", manufacturerPartNumber: "CAP-X" }),
  ];
  const carried = carryBomTracking(previous, next);
  assert.equal(carried.records.find((record) => record.id === "near")?.trackingStatus, "料號申請中");
  assert.ok(!carried.records.find((record) => record.id === "far")?.trackingStatus, "the other location of the same part gets nothing");
  assert.deepEqual(carried.orphaned.map((record) => record.id), ["gone"]);
  assert.equal(diffBomRecords(previous, carried.records).summary.trackingLost, 1);
});

test("帶入舊版資料 fills only rows an earlier upload left without website data, and running it again changes nothing", () => {
  const previous = [
    row({ id: "a", refDes: "U1", partNumber: "", manufacturerPartNumber: "IC-1", ...applying("tracking-a"), requestOwnerName: "王工程師" }),
    row({ id: "b", refDes: "U2", partNumber: "", manufacturerPartNumber: "IC-2", ...applying("tracking-b") }),
    row({ id: "c", refDes: "U3", partNumber: "", manufacturerPartNumber: "IC-3", note: "舊 Note" }),
    row({ id: "d", refDes: "U4", partNumber: "", manufacturerPartNumber: "IC-GONE", ...applying("tracking-d") }),
    row({ id: "manual-1", refDes: "U5", partNumber: "", manufacturerPartNumber: "IC-MANUAL", ...applying("tracking-m") }),
  ];
  // As an older upload stored it: nothing carried, and U3 edited on the new version since.
  const current = [
    row({ id: "a2", refDes: "U1", partNumber: "", manufacturerPartNumber: "IC-1" }),
    row({ id: "b2", refDes: "U2, U12", partNumber: "", manufacturerPartNumber: "IC-2", trackingHistory: [{ id: "imported-tracking-S-3", status: "新增追蹤", note: "CE 匯入", createdAt: "2026-11-17T00:00:00.000Z" }], trackingStatus: "新增追蹤" }),
    row({ id: "c2", refDes: "U3", partNumber: "", manufacturerPartNumber: "IC-3", note: "新版已改的 Note" }),
  ];
  const before = diffBomRecords(previous, current).summary;
  assert.equal(before.recarry, 2, "U1 and U2 have their part in the new version but not their data");
  assert.equal(before.trackingLost, 4, "U1, U2 not carried; U4 and the manual row have no counterpart");
  const result = recarryBomTracking(previous, current);
  assert.deepEqual(result.filled.map((record) => record.id).sort(), ["a2", "b2"]);
  const a2 = result.records.find((record) => record.id === "a2")!;
  assert.equal(a2.trackingStatus, "料號申請中");
  assert.equal(a2.requestOwnerName, "王工程師");
  const b2 = result.records.find((record) => record.id === "b2")!;
  assert.deepEqual(b2.trackingHistory!.map((entry) => entry.id), ["imported-tracking-S-3", "tracking-b"], "the new file's own imported note stays first");
  assert.equal(result.records.find((record) => record.id === "c2")?.note, "新版已改的 Note", "data entered on the new version is never overwritten");
  assert.equal(result.records.length, 3, "a manual row deleted from the new version is not brought back");
  assert.equal(result.remaining, 2);
  assert.equal(recarryBomTracking(previous, result.records).filled.length, 0);
});

test("text read from the old Excel alone is not website data and is not reported as not carried", () => {
  const imported = row({ id: "imp", refDes: "Q1", trackingStatus: "不建議使用", trackingHistory: [{ id: "imported-tracking-S-9", status: "不建議使用", createdAt: "2026-10-01T00:00:00.000Z" }] });
  assert.equal(bomRecordHasTracking(imported), true);
  assert.equal(bomRecordHasWebsiteData(imported), false);
  assert.equal(bomRecordHasWebsiteData(row({ refDes: "Q1", trackingStatus: "已發信" })), true, "a status set before history existed is website data");
  assert.equal(bomRecordHasWebsiteData(row({ refDes: "Q1", trackingStatus: "未處理" })), false);
  assert.equal(diffBomRecords([imported], [row({ id: "imp2", refDes: "Q1" })]).summary.trackingLost, 0);
});

// Review of the first Baseboard fix: the board-wide search must not carry data to a different part.
const own = (id: string, status: string) => ({ id, status, note: "", createdAt: "2026-11-01T00:00:00Z", createdBy: "RD" });

test("across the board, dots stay part of the MPN and placeholders are never searched", () => {
  const tvs = carryBomTracking(
    [row({ id: "d10", refDes: "D10", partNumber: "", manufacturerPartNumber: "SMBJ5.0A", manufacturer: "Littelfuse", trackingStatus: "料號申請中", trackingHistory: [own("t-d10", "料號申請中")] })],
    [row({ id: "pd3", refDes: "PD3", partNumber: "", manufacturerPartNumber: "SMBJ50A", manufacturer: "Littelfuse" })],
  );
  assert.equal(tvs.moved, 0, "SMBJ5.0A and SMBJ50A are different diodes");
  assert.equal(tvs.orphaned.length, 1);
  const dash = carryBomTracking(
    [row({ id: "r10", refDes: "R10", partNumber: "", manufacturerPartNumber: "-", manufacturer: "", note: "等廠商", requestOwnerName: "A" })],
    [row({ id: "j5", refDes: "J5", name: "CONN", partNumber: "", manufacturerPartNumber: "-", manufacturer: "" })],
  );
  assert.equal(dash.moved, 0);
  assert.equal(dash.records[0].note ?? "", "");
});

test("without the vendor only an MPN that appears once on each side moves", () => {
  const previous = [
    row({ id: "a", refDes: "C11", partNumber: "", manufacturerPartNumber: "GRM155R71C104KA88D", manufacturer: "Murata", ...applying("t-a") }),
    row({ id: "b", refDes: "C12", partNumber: "", manufacturerPartNumber: "GRM155R71C104KA88D", manufacturer: "Murata", ...applying("t-b") }),
  ];
  const next = [row({ id: "n", refDes: "C80", partNumber: "", manufacturerPartNumber: "GRM155R71C104KA88D", manufacturer: "MURATA ELECTRONICS" })];
  assert.equal(carryBomTracking(previous, next).moved, 0, "two old rows want the one new row: nothing is guessed");
});

test("text read from the old Excel never takes the partner of a row with a website application", () => {
  const imported = { id: "imported-tracking-S-1", status: "處理中", note: "舊 Excel", createdAt: "" };
  const previous = [
    row({ id: "c5", refDes: "C5", partNumber: "", manufacturerPartNumber: "GRM1-0402", manufacturer: "Murata", trackingHistory: [imported], trackingStatus: "處理中" }),
    row({ id: "c9", refDes: "C9", partNumber: "", manufacturerPartNumber: "GRM1-0402", manufacturer: "Murata", trackingHistory: [own("t-c9", "料號申請中")], trackingStatus: "料號申請中" }),
  ];
  const carried = carryBomTracking(previous, [row({ id: "pc105", refDes: "PC105", partNumber: "", manufacturerPartNumber: "GRM1-0402", manufacturer: "Murata" })]);
  assert.equal(carried.records[0].trackingStatus, "料號申請中");
  assert.deepEqual(carried.orphaned.map((record) => record.id), ["c5"]);
});

test("a status the new Excel brings itself is not offered for 帶入 again and again", () => {
  const previous = [row({ id: "u1", refDes: "U1", partNumber: "", manufacturerPartNumber: "TPS1-A", trackingStatus: "已發信", trackingHistory: [] })];
  const imported = { id: "imported-tracking-S-3", status: "處理中", note: "等回覆", createdAt: "" };
  const current = carryBomTracking(previous, [row({ id: "u1n", refDes: "U1", partNumber: "", manufacturerPartNumber: "TPS1-A", trackingStatus: "處理中", trackingHistory: [imported], trackingNote: "等回覆" })]).records;
  assert.equal(diffBomRecords(previous, current).summary.recarry, 0);
  assert.equal(recarryBomTracking(previous, current).filled.length, 0);
});

test("switching back never lets a part found elsewhere wipe the target row's own Note, 負責人 or SPEC", () => {
  const current = [row({ id: "cur", refDes: "R50", partNumber: "", manufacturerPartNumber: "ERJ-2RKF1001X", manufacturer: "Panasonic", note: "目前版本的 Note", trackingHistory: [own("t-cur", "已發信")] })];
  const target = [row({ id: "tgt", refDes: "R12", partNumber: "", manufacturerPartNumber: "ERJ-2RKF1001X", manufacturer: "Panasonic", note: "keep me", requestOwnerName: "B", specDocuments: [spec("a.pdf")] })];
  const carried = carryBomTracking(current, target, { from: "current" });
  assert.equal(carried.records[0].note, "keep me");
  assert.equal(carried.records[0].requestOwnerName, "B");
  assert.equal(carried.records[0].specDocuments?.length, 1);
});

// 2026-11-17 Baseboard root cause: V1's applications sat on alternate vendor rows (RALEC, TFT, ROHM…) that the new
// Excel no longer has. The carry correctly finds no partner, and the applications vanished from V2's 待處理料, 週報 and
// 匯出 because only rows of the version on screen were listed. They must stay listed, read-only, from V1.
test("applications on vendor lines the new BOM dropped stay listed, once, from the newest version that had them", () => {
  const status = (id: string, value: string) => ({ trackingStatus: value, trackingHistory: [{ id, status: value, createdAt: "2026-11-05T00:00:00Z", createdBy: "RD" }] });
  const v1 = [
    row({ id: "pr11-tai", refDes: "PR11, PR12", manufacturer: "TAI", manufacturerPartNumber: "RMS04FT0", partNumber: "1022-0DK80AK" }),
    row({ id: "pr11-ralec", refDes: "PR11, PR12", manufacturer: "RALEC", manufacturerPartNumber: "RST020000FBTH", partNumber: "", ...status("tracking-ralec", "已發信") }),
    row({ id: "pl30", refDes: "PL30", manufacturer: "CYNTEC", manufacturerPartNumber: "CMMB051H-4R7MS", partNumber: "", ...status("tracking-pl30", "料號申請中") }),
    row({ id: "pr7", refDes: "PR7", manufacturer: "TFT", manufacturerPartNumber: "CSF1216S0M50F-T3", partNumber: "", note: "只有 Note，不是申請" }),
  ];
  // V2 as uploaded before the fix: RALEC dropped, PL30 kept but its application not carried.
  const v2 = [
    row({ id: "v2-pr11", refDes: "PR11, PR12", manufacturer: "TAI", manufacturerPartNumber: "RMS04FT0", partNumber: "" }),
    row({ id: "v2-pl30", refDes: "PL30", manufacturer: "CYNTEC", manufacturerPartNumber: "CMMB051H-4R7MS", partNumber: "" }),
    row({ id: "v2-pr7", refDes: "PR7", manufacturer: "TFT", manufacturerPartNumber: "CSF1216S0M50F-T3", partNumber: "" }),
  ];
  // V1 is not V2's recorded previous version here, so PL30 cannot be filled by 帶入舊版資料 and is listed.
  const { retained } = findRetainedApplications(v2, [{ workspaceId: "bom:v1", label: "V1", records: v1 }]);
  assert.deepEqual(retained.map((item) => [item.sourceRecordId, item.reason]), [["pr11-ralec", "gone"], ["pl30", "uncarried"]]);
  // When V1 is the version V2 was uploaded over, PL30 is filled by 帶入舊版資料 instead: counted, never listed twice.
  const fromPrevious = findRetainedApplications(v2, [{ workspaceId: "bom:v1", label: "V1", records: v1 }], "bom:v1");
  assert.deepEqual(fromPrevious.retained.map((item) => item.sourceRecordId), ["pr11-ralec"]);
  assert.equal(fromPrevious.recarry, 1);
  assert.equal(retained[0].record.id, "retained:bom:v1:pr11-ralec", "never the id of a row on screen");
  assert.equal(retained[0].record.trackingStatus, "已發信");
  assert.equal(retained[0].fromLabel, "V1");

  // Once PL30's application is carried, only the dropped RALEC line remains.
  const carried = carryBomTracking(v1, v2).records;
  assert.deepEqual(findRetainedApplications(carried, [{ workspaceId: "bom:v1", label: "V1", records: v1 }]).retained.map((item) => item.sourceRecordId), ["pr11-ralec"]);

  // V3 drops PL30 too: PL30 comes from V2's copy (newest), RALEC still from V1, nothing twice.
  const v2WithData = carried.map((record) => record.id === "v2-pl30" ? { ...record, trackingHistory: [...(record.trackingHistory ?? []), { id: "tracking-pl30-v2", status: "文件已收齊", createdAt: "2026-11-12T00:00:00Z" }], trackingStatus: "文件已收齊" } : record);
  const v3 = [row({ id: "v3-pr11", refDes: "PR11, PR12", manufacturer: "TAI", manufacturerPartNumber: "RMS04FT0", partNumber: "1022-0DK80AK" })];
  const chain = findRetainedApplications(v3, [{ workspaceId: "bom:v2", label: "V2", records: v2WithData }, { workspaceId: "bom:v1", label: "V1", records: v1 }]).retained;
  assert.deepEqual(chain.map((item) => [item.fromLabel, item.sourceRecordId, item.record.trackingStatus]), [["V2", "v2-pl30", "文件已收齊"], ["V1", "pr11-ralec", "已發信"]]);
});

test("invisible characters and look-alike dashes pair the same part, and the comparison still shows the text changed", () => {
  const diff = diffBomRecords([row({ id: "x1", refDes: "R9", manufacturerPartNumber: "RC0402FR‐-0710KL" })], [row({ id: "x2", refDes: "R9", manufacturerPartNumber: "RC0402FR-0710KL" })]);
  assert.equal(diff.summary.removed + diff.summary.added, 0, "the line pairs");
  assert.ok(diff.entries[0].changes.some((change) => change.field === "manufacturerPartNumber"), "the dash that changed is still reported");
  assert.equal(normalizeBomText("LM5066­H1PWPR"), "LM5066­H1PWPR", "display text is not rewritten");
  const carried = carryBomTracking(
    [row({ id: "a", refDes: "U5", partNumber: "", manufacturerPartNumber: "TPS−54A", ...applying("t-u5") })],
    [row({ id: "b", refDes: "U5", partNumber: "", manufacturerPartNumber: "TPS-54A" })],
  );
  assert.equal(carried.records[0].trackingStatus, "料號申請中");
});

// Review of the 舊版申請 change: a line carried through several versions is listed once, and an application whose copy in
// the next version still holds it never comes back from the older version.
test("an application carried V1 → V2 and dropped in V3 is listed once, from V2, even when V2 filled its 實體料號 or renumbered it", () => {
  const status = (id: string, value: string) => ({ trackingStatus: value, trackingHistory: [{ id, status: value, createdAt: "2026-11-05T00:00:00Z", createdBy: "RD" }] });
  const v1 = [row({ id: "v1-tft", refDes: "PR22", manufacturer: "TFT", manufacturerPartNumber: "CSF1216S0M50F-T3", partNumber: "", ...status("tracking-tft", "料號申請中") })];
  const v2 = carryBomTracking(v1, [row({ id: "v2-tft", refDes: "PR122", manufacturer: "TFT", manufacturerPartNumber: "CSF1216S0M50F-T3", partNumber: "1022-TFT-NEW" })]).records;
  assert.equal(v2[0].trackingStatus, "料號申請中");
  const v3 = [row({ id: "v3-tai", refDes: "PR122", manufacturer: "TAI", manufacturerPartNumber: "RMS10JT330", partNumber: "" })];
  const { retained } = findRetainedApplications(v3, [{ workspaceId: "bom:v2", label: "V2", records: v2 }, { workspaceId: "bom:v1", label: "V1", records: v1 }]);
  assert.deepEqual(retained.map((item) => [item.fromLabel, item.sourceRecordId]), [["V2", "v2-tft"]]);
});

test("an application already on screen is not listed again from an older version that pairs it elsewhere", () => {
  const status = (id: string, value: string) => ({ trackingStatus: value, trackingHistory: [{ id, status: value, createdAt: "2026-11-05T00:00:00Z", createdBy: "RD" }] });
  const v1 = [row({ id: "v1", refDes: "PR22", manufacturer: "TFT", manufacturerPartNumber: "CSF1216S0M50F-T3", partNumber: "", ...status("tracking-a", "料號申請中") })];
  const v2 = carryBomTracking(v1, [row({ id: "v2", refDes: "PR22", manufacturer: "TFT", manufacturerPartNumber: "CSF1216S0M50F-T3", partNumber: "" })]).records;
  const v3 = carryBomTracking(v2, [row({ id: "v3", refDes: "PR122", manufacturer: "TFT", manufacturerPartNumber: "CSF1216S0M50F-T3", partNumber: "" })]).records;
  assert.equal(v3[0].trackingStatus, "料號申請中");
  assert.deepEqual(findRetainedApplications(v3, [{ workspaceId: "bom:v2", label: "V2", records: v2 }, { workspaceId: "bom:v1", label: "V1", records: v1 }]).retained, []);
});

test("rows without Ref Des keep their name in the identity, and an Excel-typed status alone is not a website application", () => {
  const status = (id: string, value: string) => ({ trackingStatus: value, trackingHistory: [{ id, status: value, createdAt: "2026-11-05T00:00:00Z", createdBy: "RD" }] });
  const v1 = [
    row({ id: "screw", refDes: "", refGroup: "", name: "SCR PAN M2", manufacturer: "", manufacturerPartNumber: "", partNumber: "", ...status("tracking-s", "已發信") }),
    row({ id: "stand", refDes: "", refGroup: "", name: "STANDOFF M3", manufacturer: "", manufacturerPartNumber: "", partNumber: "", ...status("tracking-t", "已發信") }),
    row({ id: "excel", refDes: "U77", manufacturerPartNumber: "TPS-EXCEL", partNumber: "", trackingStatus: "需申請", trackingHistory: [{ id: "imported-tracking-S-7", status: "需申請", note: "CE", createdAt: "" }] }),
  ];
  const { retained } = findRetainedApplications([], [{ workspaceId: "bom:v1", label: "V1", records: v1 }]);
  assert.deepEqual(retained.map((item) => item.sourceRecordId), ["screw", "stand"]);
});

// 2026-11-18: the user wants the comparison from the parts — what a part gained, lost or where it moved.
test("parts view: added, removed and moved parts with the positions they gained and lost", async () => {
  const { buildBomPartChanges } = await import("../src/components/material-requests/bomDiff.ts");
  const before = [
    row({ id: "b1", refDes: "PL30, PL32, PL36", manufacturer: "CYNTEC", manufacturerPartNumber: "CMMB051H-4R7MS" }),
    row({ id: "b2", refDes: "PR11", manufacturer: "RALEC", manufacturerPartNumber: "RST020000FBTH", note: "申請中" }),
    row({ id: "b3", refDes: "U5", manufacturer: "TI", manufacturerPartNumber: "LM5066H1PWPR" }),
    row({ id: "b4", refDes: "C1", manufacturer: "MURATA", manufacturerPartNumber: "GRM155" }),
  ];
  const after = [
    row({ id: "a1", refDes: "PL30, PL32, PL38", manufacturer: "CYNTEC", manufacturerPartNumber: "CMMB051H-4R7MS" }),
    row({ id: "a3", refDes: "U5", manufacturer: "TI", manufacturerPartNumber: "LM5066H1A0PWPR" }),
    row({ id: "a4", refDes: "C1", manufacturer: "MURATA", manufacturerPartNumber: "GRM155" }),
  ];
  const result = buildBomPartChanges(before, after);
  assert.deepEqual(result.counts, { added: 1, removed: 2, moved: 1 });
  assert.equal(result.unchanged, 1);
  const moved = result.changes.find((change) => change.kind === "moved")!;
  assert.deepEqual([moved.mpn, moved.refAdded, moved.refRemoved], ["CMMB051H-4R7MS", ["PL38"], ["PL36"]]);
  const ralec = result.changes.find((change) => change.mpn === "RST020000FBTH")!;
  assert.equal(ralec.kind, "removed");
  assert.equal(ralec.hadWebsiteData, true);
  assert.deepEqual(result.changes.find((change) => change.kind === "added")?.afterRefs, ["U5"]);
  const added = result.changes.find((change) => change.kind === "added")!;
  assert.deepEqual(added.replaces, ["TI / LM5066H1PWPR"], "a part replaced at U5 names the part it replaced");
  assert.deepEqual(result.changes.find((change) => change.mpn === "LM5066H1PWPR")?.replacedBy, ["TI / LM5066H1A0PWPR"]);
});

// Review 2026-11-18: going forward again (V1 → V2) brings what was entered on V1 while it was current, without
// replacing V2's own values; old hand-added parts V2 deleted stay deleted.
test("going forward adds V1's updates made since it became current, fills blanks only, and appends parts added by hand in that time", async () => {
  const { fillForwardBomTracking } = await import("../src/components/material-requests/bomDiff.ts");
  const since = "2026-11-14T00:00:00.000Z";
  const old = { id: "t-old", status: "已發信", createdAt: "2026-11-10T00:00:00.000Z", createdBy: "RD" };
  const lost = { id: "t-lost", status: "未回應再次發信", createdAt: "2026-11-12T00:00:00.000Z", createdBy: "RD" };
  const fresh = { id: "t-fresh", status: "文件已收齊", note: "廠商已回", createdAt: "2026-11-16T00:00:00.000Z", createdBy: "RD" };
  const v1 = [
    row({ id: "v1-u5", refDes: "U5", partNumber: "", manufacturerPartNumber: "TPS-1", trackingStatus: "文件已收齊", trackingHistory: [old, lost, fresh], note: "V1 note", requestOwnerName: "Amy" }),
    row({ id: "v1-u6", refDes: "U6", partNumber: "", manufacturerPartNumber: "TPS-2", ...applying("t-u6") }),
    row({ id: `manual-${Date.parse("2026-11-15T00:00:00Z")}-abc123`, refDes: "X9", name: "V1 檢查時手動新增", partNumber: "", manufacturerPartNumber: "NEW-1" }),
    row({ id: `manual-${Date.parse("2026-11-01T00:00:00Z")}-def456`, refDes: "X8", name: "V2 刪掉的手動料", partNumber: "", manufacturerPartNumber: "OLD-1" }),
  ];
  const v2 = [
    row({ id: "v2-u5", refDes: "U5", partNumber: "", manufacturerPartNumber: "TPS-1", trackingStatus: "已發信", trackingHistory: [old], note: "V2 note" }),
    row({ id: "v2-u6", refDes: "U6", partNumber: "", manufacturerPartNumber: "TPS-2" }),
  ];
  const result = fillForwardBomTracking(v1, v2, since);
  const u5 = result.records.find((record) => record.id === "v2-u5")!;
  assert.deepEqual(u5.trackingHistory?.map((entry) => entry.id), ["t-old", "t-fresh"], "only entries made since V1 became current are added");
  assert.equal(u5.trackingStatus, "文件已收齊", "the status follows the newest entry");
  assert.equal(u5.note, "V2 note", "V2's own Note is not replaced");
  assert.equal(u5.requestOwnerName, "Amy", "a blank 負責人 is filled");
  assert.equal(result.records.find((record) => record.id === "v2-u6")?.trackingStatus, "料號申請中", "a row with nothing receives the line");
  assert.equal(result.filled, 2);
  assert.equal(result.manual, 1);
  assert.deepEqual(result.records.map((record) => record.id).filter((id) => id.startsWith("manual-")), [v1[2].id]);
  // Running it again adds nothing new.
  const again = fillForwardBomTracking(v1, result.records, since);
  assert.equal(again.manual, 0);
  assert.deepEqual(again.records.find((record) => record.id === "v2-u5")?.trackingHistory?.map((entry) => entry.id), ["t-old", "t-fresh"]);
});

test("parts added by hand are listed only from newer versions; one an older version has and this one lacks was deleted here", () => {
  const manualId = `manual-${Date.parse("2026-11-15T00:00:00Z")}-aaa111`;
  const manual = row({ id: manualId, refDes: "J9", name: "手動新增連接器", partNumber: "", manufacturerPartNumber: "CONN-9" });
  const base = [row({ id: "u1", refDes: "U1", partNumber: "" })];
  // On V1, V2's hand-added part shows.
  const onV1 = findRetainedApplications(base, [{ workspaceId: "bom:v2", label: "V2", records: [...base, manual], newer: true }]);
  assert.deepEqual(onV1.retained.map((item) => [item.fromLabel, item.reason, item.sourceRecordId]), [["V2", "manual", manualId]]);
  // On V2 after deleting it, V1's copy does not bring it back.
  const onV2 = findRetainedApplications(base, [{ workspaceId: "bom:v1", label: "V1", records: [...base, manual] }]);
  assert.deepEqual(onV2.retained, []);
  // Two hand-added rows at one position with the same text are both listed.
  const twin = { ...(manual as Record<string, unknown>), id: `${manualId}-twin` } as never;
  assert.equal(findRetainedApplications(base, [{ workspaceId: "bom:v2", label: "V2", records: [manual, twin], newer: true }]).retained.length, 2);
});

test("parts view: an MPN written with or without dashes is one part, and the same 實體料號 under a rewritten MPN is not a swap", async () => {
  const { buildBomPartChanges } = await import("../src/components/material-requests/bomDiff.ts");
  const before = [
    row({ id: "b1", refDes: "R9", manufacturer: "YAGEO", manufacturerPartNumber: "RC0402FR-0710KL", partNumber: "0402-0001" }),
    row({ id: "b2", refDes: "U7", manufacturer: "TI", manufacturerPartNumber: "TPS5430DDA", partNumber: "1022-TI-01" }),
    row({ id: "b3", refDes: "L1", manufacturer: "CYNTEC", manufacturerPartNumber: "VCHA042A-1R0", partNumber: "1022-CY-01" }),
    row({ id: "b4", refDes: "TP1", manufacturer: "", manufacturerPartNumber: "N/A", partNumber: "1022-TP-01" }),
  ];
  const after = [
    row({ id: "a1", refDes: "R9", manufacturer: "YAGEO", manufacturerPartNumber: "RC0402FR0710KL", partNumber: "0402-0001" }),
    row({ id: "a2", refDes: "U7", manufacturer: "TI", manufacturerPartNumber: "TPS5430DDAR", partNumber: "1022-TI-01" }),
    row({ id: "a3", refDes: "L1, L2", manufacturer: "CYNTEC", manufacturerPartNumber: "VCHA042A-1R0MS6", partNumber: "1022-CY-01" }),
    row({ id: "a4", refDes: "TP1", manufacturer: "", manufacturerPartNumber: "-", partNumber: "1022-TP-01" }),
  ];
  const result = buildBomPartChanges(before, after);
  assert.deepEqual(result.counts, { added: 0, removed: 0, moved: 1 }, result.changes.map((change) => `${change.kind}:${change.mpn}`).join(" | "));
  const moved = result.changes[0];
  assert.deepEqual([moved.mpn, moved.refAdded, moved.refRemoved, moved.replaces, moved.replacedBy], ["VCHA042A-1R0MS6", ["L2"], [], [], []]);
  assert.equal(result.unchanged, 3);
});

// Re-check 2026-11-18.
test("parts view: the same MPN from another maker is a swap, the maker written longer is the same part, and a rewritten MPN stays visible", async () => {
  const { buildBomPartChanges } = await import("../src/components/material-requests/bomDiff.ts");
  const result = buildBomPartChanges(
    [
      row({ id: "b1", refDes: "U1", manufacturer: "TI", manufacturerPartNumber: "LM358DR", partNumber: "" }),
      row({ id: "b2", refDes: "C1", manufacturer: "MURATA", manufacturerPartNumber: "GRM155R71C104KA88D", partNumber: "" }),
      row({ id: "b3", refDes: "L1", manufacturer: "CYNTEC", manufacturerPartNumber: "VCHA042A-1R0", partNumber: "1022-CY-01" }),
    ],
    [
      row({ id: "a1", refDes: "U1", manufacturer: "ONSEMI", manufacturerPartNumber: "LM358DR", partNumber: "" }),
      row({ id: "a2", refDes: "C1", manufacturer: "Murata Electronics", manufacturerPartNumber: "GRM155R71C104KA88D", partNumber: "" }),
      row({ id: "a3", refDes: "L1, L2", manufacturer: "CYNTEC", manufacturerPartNumber: "VCHA042A-1R0MS6", partNumber: "1022-CY-01" }),
    ],
  );
  assert.deepEqual(result.counts, { added: 1, removed: 1, moved: 1 }, result.changes.map((change) => `${change.kind}:${change.manufacturer}/${change.mpn}`).join(" | "));
  assert.deepEqual(result.changes.find((change) => change.kind === "added")?.replaces, ["TI / LM358DR"]);
  const moved = result.changes.find((change) => change.kind === "moved")!;
  assert.equal(moved.previousMpn, "VCHA042A-1R0");
  assert.ok(moved.searchText.includes("vcha042a-1r0 "), "the old MPN is searchable");
  assert.equal(result.unchanged, 1);
});

test("a part added by hand on V2 and deleted on V3 is not listed on V1, and the chain never links across the version on screen", () => {
  const manualId = `manual-${Date.parse("2026-11-15T00:00:00Z")}-bbb222`;
  const manual = row({ id: manualId, refDes: "J9", name: "手動新增連接器", partNumber: "", manufacturerPartNumber: "CONN-9" });
  const base = [row({ id: "u1", refDes: "U1", partNumber: "" })];
  const onV1 = findRetainedApplications(base, [
    { workspaceId: "bom:v3", label: "V3", records: base, newer: true },
    { workspaceId: "bom:v2", label: "V2", records: [...base, manual], newer: true },
  ]);
  assert.deepEqual(onV1.retained, []);
  // Viewing V2 with [V3, V1]: a V1 application V2 lacks is V1's (offered for 帶入 from the previous version), not V3's.
  const status = { trackingStatus: "料號申請中", trackingHistory: [{ id: "t-u7", status: "料號申請中", createdAt: "2026-11-05T00:00:00Z", createdBy: "RD" }] };
  const v1 = [row({ id: "v1-u7", refDes: "U7", partNumber: "", manufacturerPartNumber: "TPS-7", ...status })];
  const v3 = [row({ id: "v3-u7", refDes: "U7", partNumber: "", manufacturerPartNumber: "TPS-7", ...status })];
  const v2 = [row({ id: "v2-u7", refDes: "U7", partNumber: "", manufacturerPartNumber: "TPS-7" })];
  const onV2 = findRetainedApplications(v2, [{ workspaceId: "bom:v3", label: "V3", records: v3, newer: true }, { workspaceId: "bom:v1", label: "V1", records: v1 }], "bom:v1");
  assert.equal(onV2.recarry, 1, "V1's application is offered for 帶入");
  assert.deepEqual(onV2.retained.map((item) => item.fromLabel), ["V3"]);
});

// E1.s V16 (2026-11-23): 「我有些前一版改好的新增料了，但最新版全部沒看直接歸0」 — the CE had filled 料號, Schematic_Part
// and Footprint on V15 (website editor); V16's Excel left them blank and the upload wiped them, so finished parts were
// listed as needing an application again.
test("a new upload keeps CE columns the new Excel leaves blank; a value the new Excel writes wins; the part itself always comes from the new Excel", () => {
  const blank = { partNumber: "", virtualAlternative: "", partName: "", partSpec: "", schematicPart: "", pcbFootprint: "", sourcingStatus: "", phaseOutStatus: "", partUsageStatus: "" };
  const v15 = [
    row({ id: "u1", refDes: "U1", name: "PMIC", manufacturerPartNumber: "TPS1", manufacturer: "TI", partNumber: "071.12345.0001", virtualAlternative: "V-PMIC", partName: "PMIC TPS1", partSpec: "QFN16 5V", schematicPart: "TPS1_SYM", pcbFootprint: "QFN16", phaseOutStatus: "ACTIVE", partUsageStatus: "不建議使用", ...applying("tracking-u1", "已完成") }),
    row({ id: "r1", refDes: "R1", manufacturerPartNumber: "RC0402", manufacturer: "YAGEO", partNumber: "064.00001.0001", schematicPart: "RES" }),
    row({ id: "c1", refDes: "C1", manufacturerPartNumber: "GRM155", manufacturer: "MURATA", partNumber: "078.11111.0001" }),
  ];
  const v16Excel = [
    row({ id: "s-u1", refDes: "U1", name: "PMIC 5V", qty: "1", manufacturerPartNumber: "TPS1", manufacturer: "TI", ...blank }),
    row({ id: "s-r1", refDes: "R1", manufacturerPartNumber: "RC0402", manufacturer: "YAGEO", ...blank, partNumber: "TEMP-0001", schematicPart: "N/A" }),
    row({ id: "s-c1", refDes: "C1", manufacturerPartNumber: "GRM155", manufacturer: "MURATA", ...blank, partNumber: "078.22222.0002", pcbFootprint: "C0402" }),
  ];
  const carried = carryBomTracking(v15, v16Excel).records;
  const u1 = carried.find((record) => record.id === "s-u1")!;
  assert.deepEqual(
    [u1.partNumber, u1.virtualAlternative, u1.partName, u1.partSpec, u1.schematicPart, u1.pcbFootprint, u1.phaseOutStatus, u1.partUsageStatus],
    ["071.12345.0001", "V-PMIC", "PMIC TPS1", "QFN16 5V", "TPS1_SYM", "QFN16", "ACTIVE", "不建議使用"],
    "every CE column V16 left blank keeps V15's value",
  );
  assert.equal(u1.name, "PMIC 5V", "Name is the part itself: always the new Excel's");
  assert.equal(u1.trackingStatus, "已完成");
  const r1 = carried.find((record) => record.id === "s-r1")!;
  assert.equal(r1.partNumber, "064.00001.0001", "a TEMP- number gives way to the real 料號 the previous version holds");
  assert.equal(r1.schematicPart, "RES", "N/A is an empty cell written out");
  const c1 = carried.find((record) => record.id === "s-c1")!;
  assert.equal(c1.partNumber, "078.22222.0002", "a 料號 the new Excel writes wins");
  assert.equal(c1.pcbFootprint, "C0402");
  // A different part at the same position (new MPN) is not the same line: nothing of the old one is copied.
  const swapped = carryBomTracking(v15, [row({ id: "s-u1b", refDes: "U1", manufacturerPartNumber: "LT8000", manufacturer: "ADI", ...blank })]).records[0];
  assert.equal(swapped.partNumber, "");
  assert.equal(swapped.schematicPart, "");
});

test("帶入舊版資料 gives an already uploaded version its blank CE columns back, also on rows with data of their own, once", () => {
  const v15 = [
    row({ id: "u1", refDes: "U1", manufacturerPartNumber: "TPS1", partNumber: "071.12345.0001", schematicPart: "TPS1_SYM", pcbFootprint: "QFN16", ...applying("tracking-u1", "已完成") }),
    row({ id: "u2", refDes: "U2", manufacturerPartNumber: "TPS2", partNumber: "071.12345.0002", schematicPart: "TPS2_SYM" }),
  ];
  // V16 as the old upload stored it: application carried, CE columns wiped; U2 got a Note on V16 since.
  const v16 = [
    row({ id: "s-u1", refDes: "U1", manufacturerPartNumber: "TPS1", partNumber: "", schematicPart: "", pcbFootprint: "", ...applying("tracking-u1", "已完成") }),
    row({ id: "s-u2", refDes: "U2", manufacturerPartNumber: "TPS2", partNumber: "", schematicPart: "TPS2_NEW", note: "V16 的 Note" }),
  ];
  const before = diffBomRecords(v15, v16).summary;
  assert.equal(before.recarry, 2, "both rows are offered for 帶入");
  const retained = findRetainedApplications(v16, [{ workspaceId: "bom:v15", label: "V15", records: v15 }], "bom:v15");
  assert.equal(retained.recarryRows, 2);
  assert.equal(retained.fieldRows, 2);
  const result = recarryBomTracking(v15, v16);
  assert.deepEqual(result.filled.map((record) => record.id).sort(), ["s-u1", "s-u2"]);
  const u1 = result.records.find((record) => record.id === "s-u1")!;
  assert.deepEqual([u1.partNumber, u1.schematicPart, u1.pcbFootprint], ["071.12345.0001", "TPS1_SYM", "QFN16"]);
  const u2 = result.records.find((record) => record.id === "s-u2")!;
  assert.equal(u2.partNumber, "071.12345.0002");
  assert.equal(u2.schematicPart, "TPS2_NEW", "what V16 filled itself stays");
  assert.equal(u2.note, "V16 的 Note");
  assert.equal(diffBomRecords(v15, result.records).summary.recarry, 0);
  assert.equal(recarryBomTracking(v15, result.records).filled.length, 0, "running it again changes nothing");
  assert.equal(findRetainedApplications(result.records, [{ workspaceId: "bom:v15", label: "V15", records: v15 }], "bom:v15").recarryRows, 0);
});

test("待處理料 line history: added in this version, since which version without a gap, and what changed since the previous one", () => {
  const v14 = [row({ id: "v14-u1", refDes: "U1", manufacturerPartNumber: "TPS1" }), row({ id: "v14-r9", refDes: "R9", manufacturerPartNumber: "RES-9" })];
  const v15 = [row({ id: "v15-u1", refDes: "U1", manufacturerPartNumber: "TPS1" }), row({ id: "v15-c5", refDes: "C5", manufacturerPartNumber: "CAP-5" })];
  const v16 = [
    row({ id: "u1", refDes: "U1, U2", qty: "2", manufacturerPartNumber: "TPS1" }),
    row({ id: "c5", refDes: "C5", manufacturerPartNumber: "CAP-5" }),
    row({ id: "r9", refDes: "R9", manufacturerPartNumber: "RES-9" }),
    row({ id: "j1", refDes: "J1", manufacturerPartNumber: "CONN-1" }),
  ];
  const links = linkBomVersions(v16, [{ workspaceId: "bom:v15", label: "V15", records: v15 }, { workspaceId: "bom:v14", label: "V14", records: v14 }]);
  const histories = describeBomLineHistories(links, v16, "bom:v15");
  const u1 = histories.get("u1")!;
  assert.equal(u1.added, false);
  assert.equal(u1.since, "V14");
  assert.equal(u1.previousLabel, "V15");
  assert.deepEqual(u1.changes.map((change) => [change.label, change.before, change.after]), [["Ref Des", "U1", "U1, U2"]]);
  assert.deepEqual(histories.get("c5"), { added: false, since: "V15", previousLabel: "V15", changes: [] });
  assert.equal(histories.get("r9")!.added, true, "R9 left in V15 and came back: added again, not 自 V14");
  assert.equal(histories.get("r9")!.since, undefined);
  assert.equal(histories.get("j1")!.added, true);
  assert.equal(describeBomLineHistories([], v16).size, 0, "a board with no older version gets no note");
});
