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
  assert.deepEqual(plain(summary.findings.map(finding => finding.title)), ["字改了：USB_DP → USB_D_P", "比對版少了：TP7", "比對版多了：R99", "這裡的線或符號不一樣", "換了位置：C5"]);
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
  assert.deepEqual(plain(shared.findings.map(finding => [finding.title, finding.priority])), [["不算錯：標題欄不一樣（公司、作者、日期等 1 處）", "low"]]);
  assert.deepEqual([shared.common, shared.own], [1, 0], "nothing of this page's own, so no AI is needed");
  assert.equal(k.isCircuitPageIdentical(diff(pages[0])), false, "a page with a change is never called the same");
  const mixed = k.summarizeCircuitLocalDiff(diff(pages[4]), common);
  assert.deepEqual(plain(mixed.findings.map(finding => finding.title)), ["字改了：USB_DP → USB_D_P", "不算錯：標題欄不一樣（公司、作者、日期等 1 處）"]);
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

// 2026-11-24: 「600多項不同每頁都這樣子」 — 公版 against one's own redrawn sheet was compared place by place and line by line.
const grid = (names, offset = 0, scale = 1) => names.map((name, index) => item(name, 0.1 + ((index % 8) * 0.1 + offset) * scale, 0.15 + (Math.floor(index / 8) * 0.12 + offset) * scale));
const sheetNames = Array.from({ length: 24 }, (_, index) => index % 3 === 0 ? `R${index + 1}` : index % 3 === 1 ? `NET_${index}` : `C${index + 1}`);

test("a sheet laid out again is told apart from a sheet nudged by the export or one with a few edits", () => {
  const k = service();
  const before = grid(sheetNames);
  const redrawn = k.diffCircuitPageTexts(before, grid(sheetNames, 0.013, 0.97));
  assert.equal(redrawn.totals.before, 24); assert.equal(redrawn.totals.after, 24);
  assert.ok(redrawn.unchanged < 12, "almost every string sits somewhere else");
  assert.equal(k.isCircuitLayoutRedrawn(redrawn), true);
  const nudged = k.diffCircuitPageTexts(before, before.map(entry => ({ ...entry, x: entry.x + 0.01, y: entry.y + 0.006 })));
  assert.equal(nudged.unchanged, 24); assert.equal(k.isCircuitLayoutRedrawn(nudged), false, "the whole sheet moved together is not a redraw");
  const edited = before.map((entry, index) => index < 5 ? { ...entry, str: `${entry.str}_X` } : entry);
  assert.equal(k.isCircuitLayoutRedrawn(k.diffCircuitPageTexts(before, edited)), false, "five strings rewritten is an edit");
  const sparse = grid(sheetNames.slice(0, 10));
  assert.equal(k.isCircuitLayoutRedrawn(k.diffCircuitPageTexts(sparse, grid(sheetNames.slice(0, 10), 0.013, 0.97))), false, "too few strings to tell");
});

test("words are parts, nets or other words: values and pin numbers never pass for a part", () => {
  const k = service();
  assert.deepEqual(["R12", "C5", "U1A", "CON2", "TP7"].map(k.circuitTokenType), ["refdes", "refdes", "refdes", "refdes", "refdes"]);
  assert.deepEqual(["USB_DP", "+3V3", "P3V3_AUX", "VCC", "GND", "12V"].map(k.circuitTokenType), ["net", "net", "net", "net", "net", "net"]);
  assert.deepEqual(["10K", "SDA", "NC"].map(k.circuitTokenType), ["other", "other", "other"]);
  assert.deepEqual(["1", "0.1", "A", ""].map(k.circuitTokenType), [null, null, null, null]);
});

test("a redrawn sheet is compared by what is on it: a missing part and a new net are named, wherever they were drawn", () => {
  const k = service();
  const before = [...grid(sheetNames), item("R99", 0.5, 0.5), item("10K", 0.52, 0.5)];
  const after = [...grid(sheetNames, 0.02, 0.95), item("NEW_NET", 0.3, 0.7), item("4.7K", 0.4, 0.4), item("REV B", 0.9, 0.95)];
  const { changes, contents } = k.diffCircuitPageContents(before, after);
  const plainChanges = plain(changes.map(change => [change.side, change.type, change.token, change.count, Boolean(change.frame)]));
  assert.deepEqual(plainChanges, [["base", "refdes", "R99", 1, false], ["work", "net", "NEW_NET", 1, false], ["base", "other", "10K", 1, false], ["work", "other", "4.7K", 1, false], ["work", "other", "REV", 1, true]]);
  assert.ok(contents.base.includes("R99") && !contents.work.includes("R99"));
  assert.ok(!contents.work.includes("REV"), "frame words are no part of what a sheet holds");

  const diff = { textComparable: true, graphicsComparable: false, sizeChanged: false, textChanges: [], regions: [], redrawn: "layout", contentChanges: changes, pages: { base: 4, work: 4 }, contents };
  const summary = k.summarizeCircuitLocalDiff(diff);
  assert.deepEqual(plain(summary.findings.map(finding => [finding.priority, finding.title])), [
    ["high", "基準版有、比對版沒有的零件編號：R99"], ["medium", "比對版多出來的線路名稱：NEW_NET"],
    ["low", "參考：其他字不一樣 2 個（數值、腳位名稱或備註）"], ["low", "不算錯：標題欄或圖框的字不一樣 1 個（公司、作者、日期等）"]]);
  assert.equal(summary.own, 2, "values and the title block are listed but are not this sheet's own differences");
  assert.deepEqual(plain(summary.counts), { changed: 0, removed: 1, added: 1, moved: 0, graphic: 0 });
  assert.ok(summary.findings[0].officialBox && !summary.findings[0].workingBox, "the part is boxed where it is, on the side that has it");
});

test("a part the redraw put on another sheet is listed as drawn there, not as missing", () => {
  const k = service();
  const page = (base, work, baseNames, workNames) => ({ textComparable: true, graphicsComparable: false, sizeChanged: false, textChanges: [], regions: [], redrawn: "layout", pages: { base, work }, contents: { base: baseNames, work: workNames } });
  const cross = k.indexCircuitPageContents([page(4, 4, ["R99", "R1"], ["R1"]), page(5, 6, ["R2"], ["R2", "R99"])]);
  assert.deepEqual(plain(cross.work.get("R99")), [6]);
  const { changes, contents } = k.diffCircuitPageContents([...grid(sheetNames), item("R99", 0.5, 0.5)], grid(sheetNames, 0.02, 0.95));
  const summary = k.summarizeCircuitLocalDiff({ ...page(4, 4, contents.base, contents.work), contentChanges: changes }, null, 40, cross);
  assert.deepEqual(plain(summary.findings.map(finding => [finding.priority, finding.title])), [["low", "參考：R99 畫到比對版第 6 頁了"]]);
  assert.equal(summary.own, 0); assert.equal(summary.counts.removed, 0);
});

test("lines drawn another way all over the sheet are measured as such; a single changed wire is not", () => {
  const k = service(), width = 200, height = 100, draw = sheet(width, height);
  const lines = Array.from({ length: 8 }, (_, index) => [10, 10 + index * 10, 190, 10 + index * 10]);
  const base = draw(lines);
  assert.equal(k.circuitInkDifferenceShare(base, base.slice(), width, height), 0);
  const restyled = draw(lines.map(([x0, y0, x1, y1]) => [x0, y0 + 4, x1, y1 + 5]));
  assert.ok(k.circuitInkDifferenceShare(base, restyled, width, height) > k.REDRAW_STYLE_SHARE, "every line elsewhere");
  const oneWire = draw([...lines, [100, 5, 101, 95]]);
  assert.ok(k.circuitInkDifferenceShare(base, oneWire, width, height) < k.REDRAW_STYLE_SHARE, "one wire added is a real, small difference");
});

// 2026-11-24, the user's MCU1 sheet: one MCU1G block redrawn higher up put 40 marks on top of each other.
function movedBlockPage({ dropPart = true } = {}) {
  const fixed = Array.from({ length: 60 }, (_, index) => item(`C${1100 + index}`, 0.06 + (index % 10) * 0.04, 0.2 + Math.floor(index / 10) * 0.1, 0.03));
  const pins = Array.from({ length: 14 }, (_, index) => `PIO1_${index}`);
  const before = [...fixed, item("C1306", 0.2, 0.86, 0.03), ...pins.map((pin, index) => item(pin, 0.78, 0.2 + index * 0.012)), ...(dropPart ? [item("U7", 0.8, 0.19, 0.02)] : [])];
  const after = [...fixed, item("C1316", 0.2, 0.86, 0.03), ...pins.map((pin, index) => item(pin, 0.71, 0.06 + index * 0.012))];
  return { before, after };
}
function pageDiff(k, before, after, regions = []) {
  return { textComparable: true, graphicsComparable: true, sizeChanged: false, textChanges: k.diffCircuitPageTexts(before, after).changes, regions,
    contents: k.diffCircuitPageContents(before, after).contents, pages: { base: 13, work: 13 } };
}

test("a block moved or redrawn as a whole is one finding; a part it lost and a rename elsewhere stay findings of their own", () => {
  const k = service();
  const { before, after } = movedBlockPage();
  const diff = pageDiff(k, before, after, [{ box: { x: 0.68, y: 0.05, width: 0.16, height: 0.4 }, base: true, work: true }]);
  assert.equal(k.isCircuitLayoutRedrawn(k.diffCircuitPageTexts(before, after)), false, "most of the sheet stayed in place");
  assert.ok(diff.textChanges.length >= 28, "every pin of the block counts as a change");
  const summary = k.summarizeCircuitLocalDiff(diff);
  const titles = summary.findings.map(finding => finding.title);
  assert.equal(summary.areas, 1);
  assert.equal(summary.findings.length, 3, titles.join(" | "));
  assert.ok(titles.includes("字改了：C1306 → C1316"), titles.join(" | "));
  assert.ok(titles.includes("基準版有、比對版沒有的零件編號：U7"), titles.join(" | "));
  const block = summary.findings.find(finding => finding.title.startsWith("這一塊整個搬走或重畫了"));
  assert.match(block.title, /29 段字的位置不一樣，有 1 個零件或線路名稱只在一邊（另外列出）/);
  assert.equal(block.certainty, "unclear");
  // Each side is boxed where the block is drawn on that side, the changed lines of the redraw included.
  assert.ok(block.officialBox.y < 0.06 && block.officialBox.y + block.officialBox.height > 0.36, JSON.stringify(block.officialBox));
  assert.ok(block.workingBox.y < 0.06 && block.workingBox.x < 0.7, JSON.stringify(block.workingBox));
  assert.equal(titles.some(title => title.startsWith("這裡的線")), false, "the redraw's lines are the block's, not a finding of their own");
  // Nothing missing: the block alone, saying its parts and nets match.
  const same = movedBlockPage({ dropPart: false });
  const clean = k.summarizeCircuitLocalDiff(pageDiff(k, same.before, same.after));
  assert.deepEqual(plain(clean.findings.map(finding => finding.title)), ["字改了：C1306 → C1316", "這一塊整個搬走或重畫了：28 段字的位置不一樣，零件和線路名稱都一樣"]);
});

test("edits spread over the sheet, or only a few close together, stay one finding each", () => {
  const k = service();
  const fixed = Array.from({ length: 40 }, (_, index) => item(`R${200 + index}`, 0.06 + (index % 8) * 0.1, 0.15 + Math.floor(index / 8) * 0.15, 0.03));
  const spread = [[0.1, 0.12], [0.5, 0.12], [0.85, 0.5], [0.3, 0.8], [0.7, 0.85]];
  const before = [...fixed, ...spread.map(([x, y], index) => item(`NET_A${index}`, x, y))];
  const after = [...fixed, ...spread.map(([x, y], index) => item(`NET_B${index}`, x, y))];
  const apart = k.summarizeCircuitLocalDiff(pageDiff(k, before, after));
  assert.equal(apart.areas, undefined); assert.equal(apart.findings.length, 5);
  const close = Array.from({ length: 7 }, (_, index) => index);
  const few = k.summarizeCircuitLocalDiff(pageDiff(k, [...fixed, ...close.map(index => item(`OLD_${index}`, 0.5, 0.5 + index * 0.012))], [...fixed, ...close.map(index => item(`NEW_${index}`, 0.5, 0.5 + index * 0.012))]));
  assert.equal(few.areas, undefined); assert.equal(few.findings.length, 7);
});

// 2026-11-24 「右下角的我要換成我們公司跟我這個作者，但他也報錯?」: positions taken from the real E1.S MCU1 sheet.
test("a new company and author in the title block are one line that is not an error; the circuit beside it still counts", () => {
  const k = service();
  const block = company => [item("Title", 0.85, 0.955), item("Size", 0.85, 0.972), item("Document Number", 0.86, 0.972), item("Rev", 0.985, 0.972), item("Date:", 0.85, 0.99), item("Sheet", 0.93, 0.99), item(company, 0.93, 0.935)];
  const circuit = [item("R1312", 0.75, 0.925, 0.03), item("U1301", 0.55, 0.86, 0.03)];
  const zone = k.findCircuitTitleBlock(block("NVIDIA Corporation"));
  assert.ok(zone && zone.x > 0.8 && zone.x < 0.85 && zone.y > 0.88 && zone.y < 0.92, JSON.stringify(zone));
  assert.equal(k.findCircuitTitleBlock(circuit), null, "parts and nets are never taken for a title block");
  const before = [...block("NVIDIA Corporation"), item("Author: Jensen", 0.93, 0.955), ...circuit];
  const after = [...block("PEGATRON Corp."), item("Author: 劉", 0.93, 0.955), item("R1313", 0.75, 0.925, 0.03), circuit[1]];
  const diff = { textComparable: true, graphicsComparable: true, sizeChanged: false, textChanges: k.diffCircuitPageTexts(before, after).changes,
    regions: [{ box: { x: 0.86, y: 0.93, width: 0.05, height: 0.03 }, base: true, work: true }], titleBlock: { base: k.findCircuitTitleBlock(before), work: k.findCircuitTitleBlock(after) } };
  const summary = k.summarizeCircuitLocalDiff(diff);
  const titles = summary.findings.map(finding => finding.title);
  assert.deepEqual(plain(titles), ["字改了：R1312 → R1313", "不算錯：標題欄不一樣（公司、作者、日期等 3 處）"]);
  const title = summary.findings[1];
  assert.equal(k.isCircuitReferenceFinding(title), true);
  assert.match(title.officialEvidence, /NVIDIA Corporation/); assert.match(title.workingEvidence, /PEGATRON Corp\./); assert.match(title.workingEvidence, /標誌或線也不一樣/);
  assert.match(title.suggestion, /不是線路/);
  assert.deepEqual([summary.common, summary.own], [1, 1], "the title block is not a difference of the page; the renamed resistor is");
  // Chinese field names count too, and with nothing else changed nothing is sent to the AI.
  const zh = text => [item("標題", 0.8, 0.95), item("圖號", 0.8, 0.97), item("日期", 0.9, 0.97), item(text, 0.9, 0.95)];
  const only = k.summarizeCircuitLocalDiff({ textComparable: true, graphicsComparable: true, sizeChanged: false, textChanges: k.diffCircuitPageTexts(zh("作者 王"), zh("作者 劉")).changes, regions: [],
    titleBlock: { base: k.findCircuitTitleBlock(zh("作者 王")), work: k.findCircuitTitleBlock(zh("作者 劉")) } });
  assert.deepEqual([only.findings.length, only.own, only.common], [1, 0, 1]);
});

// 2026-11-24, the real E1.S redraw (公版 V16 against 1121y26): the names were the same, written another way.
test("pin names, buses and standards are never parts, however much they look like a Ref Des", () => {
  const k = service();
  assert.deepEqual(["GPIO0", "GPIO15", "PCIE5", "I2C", "ADC3"].map(k.circuitTokenType), ["other", "other", "other", "other", "other"]);
  assert.deepEqual(["VDD1", "GND2", "VCC3"].map(k.circuitTokenType), ["net", "net", "net"]);
  // Pin and part names a library writes like nets: two functions, a note, a pin number in front, no-connects, the pad, a body.
  assert.deepEqual(["GND/PG", "OE3#/SMB_CLK", "VDDD(I2C-BUS)", "9_THM", "NC_1", "NC#35", "THERMAL_PAD", "WAFER_HD_2P"].map(k.circuitTokenType), ["other", "other", "other", "other", "other", "other", "other", "other"]);
  assert.deepEqual(["P3V3_UART", "BF_POW_EXT_S", "N1_USB_2_DP", "3V3_STBY", "+12V"].map(k.circuitTokenType), ["net", "net", "net", "net", "net"]);
  assert.deepEqual(["R4410", "U4401A", "Q4603B", "CN1401", "TP7", "LED1", "FB1"].map(k.circuitTokenType), ["refdes", "refdes", "refdes", "refdes", "refdes", "refdes", "refdes"]);
  assert.deepEqual(plain(["U4401A", "^OE3#/SMB_CLK", "vZOUT_SEL", "^vCLKIN_SEL_tri/SMB_DATA", "VCC"].map(word => k.circuitNameKey(word).key)), ["U4401", "OE3#/SMB_CLK", "ZOUT_SEL", "CLKIN_SEL_TRI/SMB_DATA", "VCC"]);
});

test("a part drawn in sections, numbered repeated pins and pull marks are the same names; a renumbered part is still found", () => {
  const k = service();
  const before = [...grid(sheetNames), item("U4401", 0.3, 0.3), item("R4410", 0.32, 0.36), item("GND", 0.34, 0.4), item("GND", 0.5, 0.4), item("GND", 0.6, 0.4), item("VSS", 0.4, 0.45),
    item("OE3#/SMB_CLK", 0.4, 0.5), item("ZOUT_SEL", 0.4, 0.55), ...Array.from({ length: 4 }, (_, index) => item(`GPIO${index}`, 0.7, 0.3 + index * 0.02))];
  const after = [...grid(sheetNames, 0.02, 0.95), item("U4401A", 0.2, 0.3), item("U4401B", 0.6, 0.3), item("R5416", 0.22, 0.36), item("GND", 0.24, 0.4), item("GND_1", 0.25, 0.42), item("GND_2", 0.25, 0.44),
    item("VSS_1", 0.3, 0.45), item("VSS_2", 0.3, 0.47), item("^OE3#/SMB_CLK", 0.3, 0.5), item("vZOUT_SEL", 0.3, 0.55)];
  const { changes, contents } = k.diffCircuitPageContents(before, after);
  const summary = k.summarizeCircuitLocalDiff({ textComparable: true, graphicsComparable: false, sizeChanged: false, textChanges: [], regions: [], redrawn: "layout", contentChanges: changes, pages: { base: 44, work: 44 }, contents });
  const titles = plain(summary.findings.map(finding => finding.title));
  assert.deepEqual(titles.filter(title => !/^(不算錯|參考)：/.test(title)), ["基準版有、比對版沒有的零件編號：R4410", "比對版多出來的零件編號：R5416"], "only the renumbered part is a difference");
  const same = summary.findings.find(finding => finding.title.startsWith("不算錯：寫法不一樣"));
  assert.ok(same, "the names written another way are listed once");
  assert.ok(!titles.some(title => title.includes("OE3#")), "a pin with two functions, a pull mark in front, is the same pin");
  for (const pair of ["U4401 ↔ U4401A、U4401B", "GND ↔ GND_1", "VSS ↔ VSS_1", "ZOUT_SEL ↔ VZOUT_SEL"]) assert.ok(same.suggestion.includes(pair), `${pair} in ${same.suggestion}`);
  assert.equal(summary.own, 2);
  assert.ok(!titles.some(title => title.includes("GPIO")), "pin names are other words, never missing parts");
  assert.ok(!titles.some(title => /GND(?! ↔)/.test(title) && !title.startsWith("不算錯")), "a GND drawn three times against once is not a difference");
});
