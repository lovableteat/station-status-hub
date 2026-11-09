import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loader } = require("../../../tests/support/renderHarness.cjs");
const pdf = loader()("src/components/circuit-changes/circuitPdf.ts");
// Values made inside the loader belong to another realm, so they are compared as JSON.
const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);

const doc = (id, date, extra = {}) => ({ id, name: `${id}.pdf`, date, label: "", path: `circuit-pdf/k/${id}.pdf`, localOnly: false, size: 10, pages: 50,
  uploadedAt: `${date}T01:00:00.000Z`, uploadedBy: "u1", uploadedByName: "甲", updatedAt: `${date}T01:00:00.000Z`, ...extra });
const mark = (checked, at, documentId = "d1", by = "u1") => ({ checked, at, by, byName: by, documentId });

test("a stored document keeps valid versions, page marks and positions and drops malformed entries", () => {
  const value = pdf.normalizeCircuitPdfRegistry({ documents: [doc("d1", "2026-11-08"), { id: "bad", name: "x.pdf", date: "11/08", pages: 3, size: 1, path: "p" }, doc("d1", "2026-11-09"),
    { ...doc("d2", "2026-11-09"), path: "", localOnly: true }, { ...doc("d3", "2026-11-09"), path: "" }],
    pages: { 3: mark(true, "2026-11-08T02:00:00.000Z"), 0: mark(true, "2026-11-08T02:00:00.000Z"), x: mark(true, "2026-11-08T02:00:00.000Z"), 4: { checked: true, at: "never" } },
    positions: { u1: { documentId: "d1", page: 12, at: "2026-11-08T03:00:00.000Z" }, u2: { documentId: "d1", page: 0, at: "2026-11-08T03:00:00.000Z" } } });
  same(value.documents.map(row => row.id), ["d1", "d2"], "a duplicate id, a bad date and a cloud PDF without a path are dropped");
  assert.equal(value.documents[0].date, "2026-11-08", "the first copy of a duplicated id is kept");
  assert.equal(value.documents[1].localOnly, true);
  same(Object.keys(value.pages), ["3"]);
  same(Object.keys(value.positions), ["u1"]);
  same(pdf.normalizeCircuitPdfRegistry(null), pdf.emptyCircuitPdfRegistry());
});

test("two people saving at once keep both of their changes: the newer entry wins one by one", () => {
  const stored = { version: 1, documents: [doc("d1", "2026-11-08"), doc("d2", "2026-11-09")],
    pages: { 1: mark(true, "2026-11-09T05:00:00.000Z", "d1", "u2"), 2: mark(true, "2026-11-09T01:00:00.000Z") },
    positions: { u2: { documentId: "d2", page: 30, at: "2026-11-09T05:00:00.000Z" } } };
  const mine = { version: 1, documents: [doc("d1", "2026-11-08", { label: "改名", updatedAt: "2026-11-09T06:00:00.000Z" }), doc("d3", "2026-11-10")],
    pages: { 1: mark(false, "2026-11-09T04:00:00.000Z"), 2: mark(false, "2026-11-09T06:00:00.000Z"), 9: mark(true, "2026-11-09T06:00:00.000Z") },
    positions: { u1: { documentId: "d1", page: 9, at: "2026-11-09T06:00:00.000Z" } } };
  const merged = pdf.mergeCircuitPdfRegistry(stored, mine);
  same(merged.documents.map(row => row.id).sort(), ["d1", "d2", "d3"], "a version uploaded by someone else is not lost");
  assert.equal(merged.documents.find(row => row.id === "d1").label, "改名");
  assert.equal(merged.pages[1].checked, true, "an older unmark does not undo a colleague's newer check");
  assert.equal(merged.pages[2].checked, false, "a newer unmark wins");
  assert.equal(merged.pages[9].checked, true);
  same(Object.keys(merged.positions).sort(), ["u1", "u2"]);
  const removed = pdf.mergeCircuitPdfRegistry(merged, { version: 1, documents: [doc("d2", "2026-11-09", { removedAt: "2026-11-09T07:00:00.000Z", updatedAt: "2026-11-09T07:00:00.000Z" })], pages: {}, positions: {} });
  same(pdf.visibleCircuitPdfDocuments(removed).map(row => row.id), ["d3", "d1"], "a removed version is not offered and the newest date comes first");
  const stale = pdf.mergeCircuitPdfRegistry(removed, { version: 1, documents: [doc("d2", "2026-11-09")], pages: {}, positions: {} });
  assert.ok(stale.documents.find(row => row.id === "d2").removedAt, "an old copy of a removed version does not bring it back");
});

test("the drawing date comes from the file name first, then from when the file was saved (Taipei)", () => {
  assert.equal(pdf.circuitPdfDateFromFile({ name: "Vera_SCH_20261109.pdf", lastModified: 0 }), "2026-11-09");
  assert.equal(pdf.circuitPdfDateFromFile({ name: "Vera 2026-11-07 rev2.pdf" }), "2026-11-07");
  assert.equal(pdf.circuitPdfDateFromFile({ name: "Vera_2026_11_06.pdf" }), "2026-11-06");
  assert.equal(pdf.circuitPdfDateFromFile({ name: "Vera_20261131.pdf", lastModified: Date.parse("2026-11-05T20:00:00Z") }), "2026-11-06", "an impossible date in the name is ignored; 20:00 UTC is the next day in Taipei");
  assert.equal(pdf.circuitPdfDateFromFile({ name: "P120261109X.pdf", lastModified: Date.parse("2026-11-01T01:00:00Z") }), "2026-11-01", "digits glued to other digits are not a date");
  assert.equal(pdf.circuitPdfDateFromFile({ name: "schematic.pdf" }, Date.parse("2026-11-09T16:30:00Z")), "2026-11-10");
});

test("page progress counts pages gone through on this PDF and on earlier PDFs of the board", () => {
  const registry = { version: 1, documents: [], positions: {}, pages: { 1: mark(true, "2026-11-08T01:00:00.000Z", "old"), 2: mark(true, "2026-11-09T01:00:00.000Z", "new"), 3: mark(false, "2026-11-09T02:00:00.000Z", "new"), 5: mark(true, "2026-11-09T01:00:00.000Z", "new") } };
  assert.equal(pdf.circuitPdfPageState(registry, "new", 1), "older");
  assert.equal(pdf.circuitPdfPageState(registry, "new", 2), "here");
  assert.equal(pdf.circuitPdfPageState(registry, "new", 3), "none");
  same(pdf.circuitPdfProgress(registry, "new", 6), { checked: 3, here: 2, older: 1, total: 6, firstOpen: 3 });
  assert.equal(pdf.circuitPdfProgress(registry, "new", 4).checked, 2, "marks beyond the PDF's last page are not counted");
});

test("a new day's PDF opens where this person stopped, otherwise at the first page nobody has gone through", () => {
  const registry = { version: 1, documents: [], pages: { 1: mark(true, "2026-11-08T01:00:00.000Z"), 2: mark(true, "2026-11-08T01:00:00.000Z") },
    positions: { u1: { documentId: "yesterday", page: 121, at: "2026-11-08T09:00:00.000Z" } } };
  assert.equal(pdf.circuitPdfResumePage(registry, "u1", "today", 356), 121);
  assert.equal(pdf.circuitPdfResumePage(registry, "u1", "today", 100), 100, "a shorter PDF opens at its last page");
  assert.equal(pdf.circuitPdfResumePage(registry, "u2", "today", 356), 3);
  assert.equal(pdf.circuitPdfResumePage(pdf.emptyCircuitPdfRegistry(), "u2", "today", 356), 1);
});

test("page numbers are read from the free-text 頁碼 field", () => {
  same(pdf.parseCircuitPageNumbers("P12, 14-16，第 20 頁"), [12, 14, 15, 16, 20]);
  same(pdf.parseCircuitPageNumbers("12～13"), [12, 13]);
  same(pdf.parseCircuitPageNumbers("5-1"), [5], "a reversed range keeps its first page");
  same(pdf.parseCircuitPageNumbers("1-9999", 50), [1], "a typo range does not mark the whole PDF");
  same(pdf.parseCircuitPageNumbers("0, 60", 50), []);
  same(pdf.parseCircuitPageNumbers(""), []);
});

test("a crop is normalised whichever way it was dragged, clamped to the page, and refused when it is a click", () => {
  same(pdf.normalizeCropRect({ x: .6, y: .7 }, { x: .2, y: .1 }), { x: .2, y: .1, width: .39999999999999997, height: .6 });
  const clamped = pdf.normalizeCropRect({ x: -.2, y: .5 }, { x: .3, y: 1.4 });
  assert.equal(clamped.x, 0); assert.equal(clamped.y, .5); assert.equal(clamped.height, .5);
  assert.equal(pdf.normalizeCropRect({ x: .5, y: .5 }, { x: .501, y: .9 }), null);
});

test("crop output is sharp for small areas and bounded for large ones", () => {
  const small = pdf.circuitCropOutputSize(1190, 842, { x: 0, y: 0, width: .1, height: .1 });
  assert.equal(small.width, 952, "a small area is enlarged at most 8 times");
  const wide = pdf.circuitCropOutputSize(1190, 842, { x: 0, y: 0, width: 1, height: .5 });
  assert.equal(wide.width, 2400);
  const huge = pdf.circuitCropOutputSize(14400, 14400, { x: 0, y: 0, width: 1, height: 1 }, 6000);
  assert.ok(huge.width * huge.height <= 16_000_000 + 8000, "the pixel count stays under the limit");
});

test("names and captions say which dated PDF and page a crop came from", () => {
  const row = { name: "Vera/SCH.pdf", date: "2026-11-09", label: "V2" };
  assert.equal(pdf.circuitPdfImageName(row, 12, "修改前"), "第12頁-修改前-2026-11-09-V2.png");
  assert.equal(pdf.circuitPdfCaption(row, 12), "2026-11-09 V2 版 PDF「Vera/SCH.pdf」第 12 頁");
  assert.equal(pdf.circuitPdfVersionLabel({ date: "2026-11-09", label: "" }), "11/09 版");
});
