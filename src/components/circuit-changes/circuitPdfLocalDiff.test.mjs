import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { loader } = createRequire(import.meta.url)("../../../tests/support/renderHarness.cjs");
const service = () => loader()("src/components/circuit-changes/circuitPdfLocalDiff.ts");
const item = (str, x, y, width = 0.05, height = 0.012) => ({ str, x, y, width, height });
const plain = value => JSON.parse(JSON.stringify(value));

test("the same strings at the same places are no change, however often a string repeats", () => {
  const k = service();
  const page = [item("GND", 0.1, 0.1), item("GND", 0.5, 0.5), item("USB_DP", 0.3, 0.2), item("R12", 0.31, 0.24)];
  assert.deepEqual(plain(k.diffCircuitPageTexts(page, page.map(entry => ({ ...entry }))).changes), []);
});

test("a rewritten string is one change, a string only on one side is removed or added, and a far twin is not a move", () => {
  const k = service();
  const before = [item("USB_DP", 0.3, 0.2), item("R12", 0.31, 0.24), item("TP7", 0.7, 0.7), item("GND", 0.1, 0.1), item("C5", 0.5, 0.5)];
  const after = [item("USB_D_P", 0.301, 0.2), item("R12", 0.31, 0.24), item("GND", 0.1, 0.1), item("GND", 0.8, 0.3), item("C5", 0.52, 0.5)];
  const { changes } = k.diffCircuitPageTexts(before, after);
  const summary = changes.map(change => [change.kind, change.before?.str ?? "", change.after?.str ?? ""]);
  assert.deepEqual(plain(summary).sort(), [["added", "", "GND"], ["changed", "USB_DP", "USB_D_P"], ["moved", "C5", "C5"], ["removed", "TP7", ""]].sort());
});

test("a whole sheet nudged by the export is not reported as every text moved", () => {
  const k = service();
  const before = Array.from({ length: 20 }, (_, index) => item(`NET_${index}`, 0.05 + index * 0.04, 0.1 + (index % 5) * 0.15));
  const after = before.map(entry => ({ ...entry, x: entry.x + 0.01, y: entry.y + 0.006 }));
  after[3] = { ...after[3], str: "NET_3_FIXED" };
  const { changes, shift } = k.diffCircuitPageTexts(before, after);
  assert.ok(Math.abs(shift.dx - 0.01) < 1e-9 && Math.abs(shift.dy - 0.006) < 1e-9);
  assert.deepEqual(plain(changes.map(change => [change.kind, change.before?.str, change.after?.str])), [["changed", "NET_3", "NET_3_FIXED"]]);
});

const sheet = (width, height) => lines => { const mask = new Uint8Array(width * height); for (const [x0, y0, x1, y1] of lines) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) mask[y * width + x] = 1; return mask; };

test("drawings laid over each other report where one has ink the other lacks", () => {
  const k = service(), width = 400, height = 300, draw = sheet(width, height);
  const base = draw([[20, 50, 300, 51], [100, 20, 101, 200]]);
  assert.deepEqual(plain(k.diffCircuitInkMasks(base, base.slice(), width, height)), [], "the same drawing is no difference");
  const regions = k.diffCircuitInkMasks(base, draw([[20, 50, 300, 51], [100, 20, 101, 200], [320, 220, 380, 222]]), width, height);
  assert.equal(regions.length, 1);
  assert.deepEqual([regions[0].base, regions[0].work, regions[0].faint ?? false], [false, true, false]);
  const box = regions[0].box;
  assert.ok(box.x <= 320 / width && box.x + box.width >= 380 / width && box.y <= 220 / height && box.y + box.height >= 222 / height, JSON.stringify(box));
  const removed = k.diffCircuitInkMasks(base, draw([[20, 50, 300, 51]]), width, height);
  assert.deepEqual(plain(removed.map(region => [region.base, region.work])), [[true, false]]);
  // The baseline nudged three pixels right is the same drawing once the shift is applied.
  assert.deepEqual(plain(k.diffCircuitInkMasks(draw([[17, 50, 297, 51], [97, 20, 98, 200]]), base, width, height, { dx: 3, dy: 0 })), []);
});

// Review 2026-11-19: a page that differs must never come out the same.
test("a junction dot on a crossing, a wire a few pixels longer and a one-pixel move are all reported, never swallowed", () => {
  const k = service(), width = 400, height = 300, draw = sheet(width, height);
  const cross = [[20, 100, 300, 100], [150, 20, 150, 200]];
  const dot = k.diffCircuitInkMasks(draw(cross), draw([...cross, [148, 98, 152, 102]]), width, height);
  assert.equal(dot.length, 1, "a 5 px junction dot added where two wires cross");
  assert.deepEqual([dot[0].base, dot[0].work], [false, true]);
  assert.ok(dot[0].box.x <= 148 / width && dot[0].box.x + dot[0].box.width >= 152 / width);
  const longer = k.diffCircuitInkMasks(draw(cross), draw([[20, 100, 305, 100], [150, 20, 150, 200]]), width, height);
  assert.equal(longer.length, 1, "a wire five pixels longer");
  const tiny = k.diffCircuitInkMasks(draw(cross), draw([[20, 100, 301, 100], [150, 20, 150, 200]]), width, height);
  assert.equal(tiny.length, 1, "one pixel longer is inside the tolerance, and still not the same drawing");
  assert.equal(tiny[0].faint, true);
  const moved = k.diffCircuitInkMasks(draw(cross), draw([[20, 101, 300, 101], [150, 20, 150, 200]]), width, height);
  assert.ok(moved.length >= 1 && moved.every(region => region.faint), "a line moved by a rounding step is reported as a faint difference");
});

test("only the letters of changed text are left out of the drawing comparison: a wire redrawn beside a renamed label is still found", () => {
  const k = service(), width = 400, height = 300, draw = sheet(width, height);
  const label = [[100, 60, 139, 66]], changedLabel = [[100, 60, 159, 66]];
  const changes = [{ kind: "changed", before: item("USB_DP", 100 / width, 60 / height, 40 / width, 7 / height), after: item("USB_D_P", 100 / width, 60 / height, 60 / width, 7 / height) }];
  const boxes = k.circuitTextChangeBoxes(changes);
  assert.equal(boxes.length, 2);
  assert.deepEqual(plain(k.diffCircuitInkMasks(draw(label), draw(changedLabel), width, height, { dx: 0, dy: 0 }, boxes)), [], "the letters themselves are the text change");
  const withWire = k.diffCircuitInkMasks(draw([...label, [100, 72, 160, 72]]), draw([...changedLabel, [100, 80, 160, 80]]), width, height, { dx: 0, dy: 0 }, boxes);
  assert.ok(withWire.length >= 1, "the wire under the label moved: that is a drawing change of its own");
  assert.ok(withWire.some(region => region.base) && withWire.some(region => region.work));
});

test("text placed off the sheet gets no box instead of one outside the page, and control characters never reach a finding", () => {
  const k = service();
  const diff = { textComparable: true, graphicsComparable: true, sizeChanged: false, regions: [],
    textChanges: [{ kind: "added", after: item("OFF_SHEET", 1.02, 0.5) }, { kind: "added", after: item("EDGE", 0.99, -0.01, 0.05, 0.02) }] };
  const { findings } = k.summarizeCircuitLocalDiff(diff);
  assert.equal(findings[0].workingBox ?? findings[1].workingBox, findings.find(finding => finding.title.includes("EDGE")).workingBox);
  assert.equal(findings.find(finding => finding.title.includes("OFF_SHEET")).workingBox, null);
  for (const finding of findings) for (const box of [finding.officialBox, finding.workingBox]) if (box) assert.ok(box.x >= 0 && box.y >= 0 && box.x < 1 && box.y < 1 && box.width > 0 && box.height > 0 && box.x + box.width <= 1 && box.y + box.height <= 1, JSON.stringify(box));
  const { changes } = k.diffCircuitPageTexts([item("NET\u0000A\ud800", 0.2, 0.2)], [item("NET_B", 0.2, 0.2)]);
  assert.equal(changes[0].before.str, "NET A\ufffd");
});

test("the findings of a page say what changed and where, most telling first, with the exact boxes of both versions", () => {
  const k = service();
  const diff = { textComparable: true, graphicsComparable: true, sizeChanged: false,
    textChanges: [{ kind: "moved", before: item("C5", 0.5, 0.5), after: item("C5", 0.52, 0.5) }, { kind: "changed", before: item("USB_DP", 0.3, 0.2), after: item("USB_D_P", 0.3, 0.2) },
      { kind: "removed", before: item("TP7", 0.7, 0.7) }, { kind: "added", after: item("R99", 0.8, 0.1) }],
    regions: [{ box: { x: 0.6, y: 0.6, width: 0.1, height: 0.02 }, base: false, work: true }] };
  const summary = k.summarizeCircuitLocalDiff(diff);
  assert.deepEqual(plain(summary.findings.map(finding => finding.title)), ["文字改了：USB_DP → USB_D_P", "文字移除：TP7", "文字新增：R99", "圖形改了（線條、接點或符號）", "文字移位：C5"]);
  assert.deepEqual(plain(summary.findings.map(finding => finding.category)), ["net-name", "label-name", "label-name", "connectivity", "label-name"]);
  assert.deepEqual(plain(summary.counts), { changed: 1, removed: 1, added: 1, moved: 1, graphic: 1 });
  assert.equal(summary.findings[0].location, "左上（橫 33%、直 21%）");
  assert.equal(summary.findings[1].workingBox, null);
  assert.equal(summary.findings[2].officialBox, null);
  for (const finding of summary.findings) for (const box of [finding.officialBox, finding.workingBox]) if (box) assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1 && box.y + box.height <= 1 && box.width > 0 && box.height > 0);
  assert.equal(k.isCircuitPageIdentical(diff), false);
  assert.equal(k.isCircuitPageIdentical({ ...diff, textChanges: [], regions: [] }), true);
});

test("a full list keeps a finding of every kind and counts what it left out", () => {
  const k = service();
  const textChanges = Array.from({ length: 50 }, (_, index) => ({ kind: "changed", before: item(`NET_A${index}`, 0.01 + (index % 10) * 0.09, 0.05 + Math.floor(index / 10) * 0.1), after: item(`NET_B${index}`, 0.01 + (index % 10) * 0.09, 0.05 + Math.floor(index / 10) * 0.1) }));
  const diff = { textComparable: true, graphicsComparable: true, sizeChanged: false, textChanges, regions: [{ box: { x: 0.6, y: 0.9, width: 0.1, height: 0.02 }, base: true, work: false }] };
  const summary = k.summarizeCircuitLocalDiff(diff, null, 40);
  assert.equal(summary.findings.length, 40);
  assert.equal(summary.omitted, 11);
  assert.ok(summary.findings.some(finding => finding.category === "connectivity"), "the drawing change is not hidden by the text changes");
});

test("the same frame spot changing on most sheets is the title block: listed last and marked, never hidden, and not a reason for AI", () => {
  const k = service();
  const title = page => ({ kind: "changed", before: item(`SHEET ${page} OF 20`, 0.8, 0.95), after: item(`SHEET ${page + 1} OF 21`, 0.8, 0.95) });
  const pages = Array.from({ length: 12 }, (_, index) => index === 4 ? [title(index), { kind: "changed", before: item("USB_DP", 0.3, 0.2), after: item("USB_D_P", 0.3, 0.2) }] : [title(index)]);
  const common = k.findCircuitCommonChanges(pages);
  assert.equal(common.pages, 12);
  assert.ok(common.examples[0].includes("SHEET 0 OF 20"));
  const diff = changes => ({ textComparable: true, graphicsComparable: true, sizeChanged: false, textChanges: changes, regions: [] });
  const shared = k.summarizeCircuitLocalDiff(diff(pages[0]), common);
  assert.deepEqual(plain(shared.findings.map(finding => [finding.title, finding.priority])), [["多頁共通：文字改了：SHEET 0 OF 20 → SHEET 1 OF 21", "low"]]);
  assert.deepEqual([shared.common, shared.own], [1, 0], "nothing of this page's own, so no AI is needed");
  assert.equal(k.isCircuitPageIdentical(diff(pages[0])), false, "a page with a change is never called the same");
  const mixed = k.summarizeCircuitLocalDiff(diff(pages[4]), common);
  assert.deepEqual(plain(mixed.findings.map(finding => finding.title)), ["文字改了：USB_DP → USB_D_P", "多頁共通：文字改了：SHEET 4 OF 20 → SHEET 5 OF 21"]);
  assert.deepEqual([mixed.common, mixed.own], [1, 1]);
  // A few sheets changing the same spot is not "every sheet": four of eight is a real change on each of them.
  assert.equal(k.findCircuitCommonChanges(pages.slice(0, 3)).spots.size, 0);
  const port = Array.from({ length: 8 }, (_, index) => index < 4 ? [{ kind: "changed", before: item("PORT_A", 0.955, 0.4), after: item("PORT_B", 0.955, 0.4) }] : []);
  assert.equal(k.findCircuitCommonChanges(port).spots.size, 0);
  // The same place inside the drawing changing on every sheet is a real change on each of them.
  const rail = Array.from({ length: 12 }, () => [{ kind: "changed", before: item("P3V3", 0.4, 0.5), after: item("P3V3_AUX", 0.4, 0.5) }]);
  assert.equal(k.findCircuitCommonChanges(rail).spots.size, 0);
  assert.equal(k.summarizeCircuitLocalDiff(diff(rail[0]), k.findCircuitCommonChanges(rail)).own, 1);
});

test("a sheet whose drawings could not be laid over each other is never called the same", () => {
  const k = service();
  assert.equal(k.isCircuitPageIdentical({ textComparable: true, graphicsComparable: false, sizeChanged: true, textChanges: [], regions: [] }), false);
  assert.equal(k.isCircuitPageIdentical({ textComparable: false, graphicsComparable: true, sizeChanged: false, textChanges: [], regions: [] }), true, "scanned sheets that are pixel for pixel the same");
});

test("reference designators, pins and values are labels; everything else is a net name", () => {
  const k = service();
  for (const value of ["R12", "C101", "U5A", "TP12", "A1", "24", "10K", "0.1uF", "33R", "1%"]) assert.equal(k.classifyCircuitDiffText(value), "label-name", value);
  for (const value of ["USB_DP", "GND", "P3V3_AUX", "PCIE_RX_P", "3V3", "RESET#"]) assert.equal(k.classifyCircuitDiffText(value), "net-name", value);
});

test("the areas shown enlarged give each difference room, merge neighbours and stay inside the page", () => {
  const k = service();
  const near = [{ x: 0.30, y: 0.20, width: 0.05, height: 0.01 }, { x: 0.36, y: 0.24, width: 0.04, height: 0.01 }];
  const far = { x: 0.95, y: 0.96, width: 0.04, height: 0.02 };
  const { windows, dropped } = k.circuitDiffWindows([...near, far]);
  assert.equal(windows.length, 2);
  assert.equal(dropped, 0);
  for (const box of windows) assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1 + 1e-9 && box.y + box.height <= 1 + 1e-9 && box.width >= 0.24 && box.height >= 0.24, JSON.stringify(box));
  assert.ok(windows[0].x <= 0.30 && windows[0].x + windows[0].width >= 0.40, "both neighbours are inside one area");
  const spread = Array.from({ length: 6 }, (_, index) => ({ x: 0.02 + (index % 3) * 0.37, y: 0.02 + Math.floor(index / 3) * 0.6, width: 0.02, height: 0.02 }));
  const limited = k.circuitDiffWindows(spread, 4);
  assert.equal(limited.windows.length, 4);
  assert.equal(limited.dropped, 2);
});

test("a net renamed to a longer name is one change: it keeps the end it is anchored at", () => {
  const k = service();
  const left = k.diffCircuitPageTexts([{ str: "NET_2", x: 0.13, y: 0.30, width: 0.06, height: 0.02 }], [{ str: "NET_2_NEW", x: 0.13, y: 0.30, width: 0.12, height: 0.02 }]);
  assert.deepEqual(plain(left.changes.map(change => [change.kind, change.before.str, change.after.str])), [["changed", "NET_2", "NET_2_NEW"]]);
  const right = k.diffCircuitPageTexts([{ str: "VCC", x: 0.80, y: 0.30, width: 0.03, height: 0.02 }], [{ str: "VCC_3V3_AUX", x: 0.72, y: 0.30, width: 0.11, height: 0.02 }]);
  assert.deepEqual(plain(right.changes.map(change => change.kind)), ["changed"], "right-aligned text keeps its right end");
  const apart = k.diffCircuitPageTexts([{ str: "TP1", x: 0.10, y: 0.10, width: 0.03, height: 0.02 }], [{ str: "TP9", x: 0.60, y: 0.70, width: 0.03, height: 0.02 }]);
  assert.deepEqual(plain(apart.changes.map(change => change.kind)).sort(), ["added", "removed"]);
});
