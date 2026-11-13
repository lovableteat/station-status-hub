import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { loader } = createRequire(import.meta.url)("../../../tests/support/renderHarness.cjs");
const align = loader()("src/components/circuit-changes/circuitPdfAlign.ts");
const plain = value => JSON.parse(JSON.stringify(value));

// A synthetic schematic: every sheet carries the same title block and grid letters, plus its own title, nets and parts.
const block = ["NVIDIA", "CORPORATION", "SIZE", "REV", "B00", "DATE", "SHEET", "OF", "A", "B", "C", "D", "1", "2", "3", "4"];
const sheet = (name, extra = []) => [...block, `${name}_TITLE`, `${name}_NET1`, `${name}_NET2`, `${name}_NET3`, `R${name}01`, `C${name}02`, ...extra];
const names = Array.from({ length: 20 }, (_, index) => `S${String(index + 1).padStart(2, "0")}`);
const doc = list => list.map(entry => align.circuitPdfPageTokens(Array.isArray(entry) ? entry : sheet(entry)));

test("words are upper-cased once per page and punctuation-only marks are dropped", () => {
  assert.deepEqual(plain(align.circuitPdfPageTokens(["r101  R101 -", "P12V_EN ／ (x)"])), ["R101", "P12V_EN", "(X)"]);
});

test("identical versions keep the same page numbers", () => {
  assert.deepEqual(plain(align.alignCircuitPdfPages(doc(names), doc(names))), names.map((_, index) => index + 1));
});

test("an inserted sheet shifts every later page and is reported as a sheet only the new version has", () => {
  const work = [...names.slice(0, 7), "NEW", ...names.slice(7)];
  const map = align.alignCircuitPdfPages(doc(names), doc(work));
  assert.deepEqual(plain(map), [1, 2, 3, 4, 5, 6, 7, null, ...names.slice(7).map((_, index) => index + 8)]);
  assert.deepEqual(plain(align.circuitAlignOffsets(map)).slice(5, 10), [0, 0, null, -1, -1]);
});

test("a removed sheet shifts later pages the other way", () => {
  const work = [...names.slice(0, 4), ...names.slice(5)];
  assert.deepEqual(plain(align.alignCircuitPdfPages(doc(names), doc(work))), [1, 2, 3, 4, ...names.slice(5).map((_, index) => index + 6)]);
});

test("a redrawn sheet between two matched sheets still pairs with its old page", () => {
  const work = [...names];
  work[9] = sheet("REDRAWN"); // nothing of S10 is left on the page except the title block
  const map = align.alignCircuitPdfPages(doc(names), doc(work));
  assert.equal(map[9], 10);
  // Repeated sheets that differ only in one connector name still pair in order.
  const repeated = ["P1", "P2", "P3", "P4"].map(name => [...block, "CONN_HD", "CONNECTOR", "SSD0", "SSD1", `${name}_ONLY`]);
  const base = doc([...names.slice(0, 3), ...repeated, ...names.slice(3, 8)]);
  const shifted = doc([...names.slice(0, 3), "INSERTED", ...repeated, ...names.slice(3, 8)]);
  assert.deepEqual(plain(align.alignCircuitPdfPages(base, shifted)).slice(3, 8), [null, 4, 5, 6, 7]);
});

test("without readable text nothing is guessed", () => {
  const blank = Array.from({ length: 6 }, () => []);
  assert.equal(align.alignCircuitPdfPages(blank, doc(names.slice(0, 6))), null);
  assert.equal(align.alignCircuitPdfPages([], []), null);
  // Two unrelated drawings: too few pages match, so the same numbers stay.
  const other = Array.from({ length: 20 }, (_, index) => [`X${index}A`, `X${index}B`, `X${index}C`, `X${index}D`]);
  assert.equal(align.alignCircuitPdfPages(doc(names), doc(other)), null);
});

test("pins hold from their page until the next pin or the next change of the automatic step", () => {
  const auto = [0, 0, 0, 0, 0, -1, -1, -1, null, -1];
  const at = (page, pins = []) => plain(align.resolveCircuitComparePage(page, 30, auto, pins));
  assert.deepEqual(at(3), { page: 3, offset: 0, source: "same" });
  assert.deepEqual(at(7), { page: 6, offset: -1, source: "auto" });
  assert.deepEqual(at(9), { page: 0, offset: null, source: "new" });
  const pins = align.setCircuitAlignPin([], 2, 3);
  assert.deepEqual(at(1, pins), { page: 1, offset: 0, source: "same" }, "pages before a pin are not moved");
  assert.deepEqual(at(4, pins), { page: 7, offset: 3, source: "pin" });
  assert.deepEqual(at(6, pins), { page: 5, offset: -1, source: "auto" }, "the automatic step change after the pin takes over");
  // Without automatic offsets a pin holds to the end; the page beyond the baseline is 0, never clamped.
  assert.deepEqual(plain(align.resolveCircuitComparePage(29, 30, null, pins)), { page: 0, offset: 3, source: "pin" });
  assert.deepEqual(plain(align.resolveCircuitComparePage(12, 30, null, pins)), { page: 15, offset: 3, source: "pin" });
  assert.deepEqual(plain(align.clearCircuitAlignPin(pins, 12)), []);
});

test("pins replace each other per page, survive storage and turn around when the versions swap", () => {
  let pins = align.setCircuitAlignPin([], 7, -2);
  pins = align.setCircuitAlignPin(pins, 3, 1);
  pins = align.setCircuitAlignPin(pins, 7, -1);
  assert.deepEqual(plain(pins), [{ from: 3, offset: 1 }, { from: 7, offset: -1 }]);
  assert.deepEqual(plain(align.invertCircuitAlignPins(pins)), [{ from: 4, offset: -1 }, { from: 6, offset: 1 }]);
  assert.deepEqual(plain(align.normalizeCircuitAlignPins([{ from: 2, offset: 1 }, { from: 0, offset: 1 }, { from: 2.5, offset: 1 }, null, { from: 5, offset: "x" }, { from: 2, offset: 4 }])), [{ from: 2, offset: 4 }]);
  assert.deepEqual(plain(align.normalizeCircuitAlignPins("broken")), []);
});

test("page words are read one page at a time and reading stops when asked", async () => {
  const pdf = { numPages: 3, getPage: async page => ({ getTextContent: async () => ({ items: [{ str: `sheet ${page}` }, { str: "R10" }, {}] }) }) };
  assert.deepEqual(plain(await align.readCircuitPdfPageTokens(pdf, new AbortController().signal)), [["SHEET", "1", "R10"], ["SHEET", "2", "R10"], ["SHEET", "3", "R10"]]);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(align.readCircuitPdfPageTokens(pdf, controller.signal), /aborted/);
});
