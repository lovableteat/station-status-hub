import test from "node:test";
import assert from "node:assert/strict";
import { filterTrackingRows, readComparisonFilters } from "../../src/components/comparison/filters.ts";

const row = (key: string, severity = "WARN", status = "NEW", page = 1) => ({ key, gid: key, category: "CONN", rule: "PIN_MOVED", severity, status, page, page_title: "Power", refdes: [key], pins: [`${key}.1`], nets: ["P3V3"], title: "接腳移動", detail: "舊版 GND / 新版 P3V3", related: [], dest: key });
const rows = [row("U1"), row("C2", "INFO", "EXISTING", 2), row("R3", "ERROR", "CHANGE")];
const replies = { U1: { disp: "修改", owner: "陳工程師", target_rev: "PVT", note: "下版修正", filled: "2026-10-12" } };

test("filters actual tracking keys, review disposition and owner together", () => {
  const filters = readComparisonFilters("?compareSearch=p3v3&compareStatus=filled&compareOwner=陳工程師&compareSeverity=WARN");
  assert.deepEqual(filterTrackingRows(rows, replies, filters).map(row => row.key), ["U1"]);
});

test("unfilled includes absent replies and combines with original revision status", () => {
  assert.deepEqual(filterTrackingRows(rows, replies, readComparisonFilters("?compareStatus=unfilled")).map(row => row.key), ["C2", "R3"]);
  assert.deepEqual(filterTrackingRows(rows, replies, readComparisonFilters("?compareStatus=CHANGE&comparePage=1")).map(row => row.key), ["R3"]);
});

test("invalid enum URL values cannot create an invisible condition", () => {
  const filters = readComparisonFilters("?workspace=comparison&compareSeverity=invalid&compareStatus=bogus&comparisonTab=bad");
  assert.equal(filters.severity, "all");
  assert.equal(filters.status, "all");
  assert.equal(filters.tab, "compare");
  assert.equal(filterTrackingRows(rows, replies, filters).length, 3);
});
