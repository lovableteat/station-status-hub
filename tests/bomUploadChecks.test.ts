import assert from "node:assert/strict";
import test from "node:test";
import { checkBomUploadRows } from "../src/components/material-requests/bomUploadChecks.ts";

let n = 0;
const row = (overrides: Record<string, unknown> = {}) => ({
  id: `r-${++n}`, sourceRow: 5 + n, sectionName: "", assemblyName: "", level: 2, name: "PART", qty: 1, refDes: "R1", manufacturer: "YAGEO",
  manufacturerPartNumber: "AF0402FR-0710KL", manufacturerPartNumberAlt: "", sourcingStatus: "", refGroup: "", lv: "", remark: "", partNumber: "",
  virtualAlternative: "", partName: "", partSpec: "", schematicPart: "", pcbFootprint: "", ...overrides,
}) as never;

test("upload checks name the row, the column and the reason for each problem the Baseboard files had", () => {
  const issues = checkBomUploadRows([
    row({ refDes: "U18128, U18133", qty: 2, manufacturer: "NEXPERIA", manufacturerPartNumber: "74LVC2G17GW" }),
    row({ refDes: "U18128, U18133", qty: 2, manufacturer: "NEXPERIA", manufacturerPartNumber: "125" }),
    row({ refDes: "J1", manufacturer: "ACES", manufacturerPartNumber: "52451-0037C-003", partNumber: "TEMP-000000002868694" }),
    row({ refDes: "C1", manufacturer: "MURATA", manufacturerPartNumber: "GRM155", partNumber: "1A20-01", virtualAlternative: "1A20-01" }),
    row({ refDes: "R2, R3, R4", qty: 2 }),
    row({ refDes: "R2, R3, R4", qty: 3, manufacturer: "TAI", manufacturerPartNumber: "YAGEO" }),
    row({ refDes: "", refGroup: "", manufacturerPartNumber: "X1-1" }),
    row({ refDes: "R10-R15", qty: 1 }),
  ]);
  const by = (column: string) => issues.filter((issue) => issue.column === column).map((issue) => issue.reason);
  assert.ok(by("Manufacturer Part Number").some((reason) => reason.includes("「74LVC2G17GW,125」被逗號拆成兩列")), by("Manufacturer Part Number").join(" | "));
  assert.ok(by("實體料號").some((reason) => reason.includes("暫時料號")));
  assert.ok(by("虛擬料號").some((reason) => reason.includes("實體料號不能當虛擬料號填")));
  assert.ok(by("Qty").some((reason) => reason.includes("數量是 2，但位號有 3 個")));
  assert.ok(by("Manufacturer Part Number").some((reason) => reason.includes("這是廠商名稱")));
  assert.ok(by("Ref Des").some((reason) => reason.includes("沒有位號")));
  assert.ok(by("Ref Des").some((reason) => reason.includes("範圍寫法")));
  assert.ok(issues.every((issue) => issue.row && issue.source === "rule"));
});

test("a clean file has no findings", () => {
  assert.deepEqual(checkBomUploadRows([row({ refDes: "R1, R2", qty: 2 }), row({ refDes: "R1, R2", qty: 2, manufacturer: "TAI", manufacturerPartNumber: "RMS04FT1002" })]), []);
});

// Review 2026-11-18: real parts and placeholders that must not be flagged.
test("short numeric MPNs, placeholder makers, maker names with a digit and pin-style Ref Des are not flagged", () => {
  const issues = checkBomUploadRows([
    row({ refDes: "TP1", manufacturer: "KEYSTONE", manufacturerPartNumber: "5001" }),
    row({ refDes: "TP2", manufacturer: "N/A", manufacturerPartNumber: "TP-SMD" }),
    row({ refDes: "TP3", manufacturer: "TBD", manufacturerPartNumber: "N/A" }),
    row({ refDes: "U3", manufacturer: "O2MICRO", manufacturerPartNumber: "OZ8681LN" }),
    row({ refDes: "U4", manufacturer: "O2MICRO2", manufacturerPartNumber: "PENDING" }),
    row({ refDes: "J1-1", manufacturer: "ACES", manufacturerPartNumber: "50224-0080N-001" }),
  ]);
  assert.deepEqual(issues.map((issue) => `${issue.column}: ${issue.reason}`), []);
});

test("a maker column holding an MPN is caught, and only real ranges are reported as ranges", () => {
  const issues = checkBomUploadRows([
    row({ refDes: "R1", manufacturer: "RC0402FR-0710KL", manufacturerPartNumber: "YAGEO" }),
    row({ refDes: "C5~C9", qty: 1 }),
    row({ refDes: "R20-R25", qty: 1 }),
  ]);
  assert.ok(issues.some((issue) => issue.column === "Manufacturer" && issue.reason.includes("RC0402FR-0710KL") && issue.level === "error"));
  assert.deepEqual(issues.filter((issue) => issue.reason.includes("範圍寫法")).map((issue) => issue.refDes), ["C5~C9", "R20-R25"]);
});
