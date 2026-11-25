import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

// 2026-11-25: 「一路修到全部完成，我要百分之百正確」 — the rules found by reading the real E1.S pair (公版 E1.S_V16 against the
// user's own 1121y26) page by page as an answer key, each pinned here with the case it came from.
const { loader } = createRequire(import.meta.url)("../../../tests/support/renderHarness.cjs");
const load = loader();
const diffs = () => load("src/components/circuit-changes/circuitPdfLocalDiff.ts");
const reader = () => load("src/components/circuit-changes/circuitPdfLocalDiffReader.ts");
const item = (str, x, y, width = 0.03, height = 0.006) => ({ str, x, y, width, height });
const plain = value => JSON.parse(JSON.stringify(value));

test("a value written as a part code and as a value is one value; a different value is not", () => {
  const k = diffs();
  const same = [["10KR2F-2-GP", "10KOhm"], ["4K7R2F-GP", "4.7Kohm"], ["0R2J-25-GP", "0ohm"], ["D005R3F-11-GP", "5mohm"], ["1MR2F-GP", "1MOHM"], ["2K21R2F-7-GP", "2.21Kohm"],
    ["SCD1U16V2KX-1", "0.1uF/16V"], ["SC4D7U6D3V2MX-18-GP", "4.7uF/6.3V"], ["SC10P50V2JN-20-GP", "10PF/50V"], ["SC22U25V5MX-14-GP", "22uF/25V"],
    ["NOPOP", "NI"], ["XTAL-24MHZ-289-GP", "24MHZ"], ["TS3USB221RSER-GP-U1", "TS3USB221RSER"], ["MBR0530L-TP-GP", "MBR0530L-TP-HF"], ["BSS123W-7-F-1-GP", "BSS123W-7-F"]];
  for (const [code, value] of same) assert.equal(k.circuitLabelKey(code), k.circuitLabelKey(value), `${code} = ${value}`);
  assert.notEqual(k.circuitLabelKey("9K1R2F-1-GP"), k.circuitLabelKey("4.7Kohm"));
  assert.notEqual(k.circuitLabelKey("SC1U25V2KX-10-GP"), k.circuitLabelKey("1uF/16V"), "the voltage is part of the value");
  assert.equal(k.circuitLabelKey("P3V3_UART"), "P3V3_UART", "names stay as written");
  assert.deepEqual(["R:2210", "C:100000/16V", "R:0.005", "DNP"].map(k.describeCircuitValue), ["2.21KΩ", "0.1µF/16V", "5mΩ", "不上件（NOPOP／NI）"]);
});

test("a label rewritten in place is no change, part-number lines only count when both drawings print them, a new value does", () => {
  const k = diffs();
  const before = [item("SC22U25V5MX-14-GP", 0.3, 0.3), item("032-1700-000", 0.3, 0.31), item("9K1R2F-1-GP", 0.5, 0.5), item("PCA6408AHKX-GP", 0.7, 0.2)];
  const after = [item("22uF/25V", 0.3, 0.3), item("4.7Kohm", 0.5, 0.5), item("PCA6408AHK", 0.7, 0.2)];
  const { changes } = k.diffCircuitPageTexts(before, after);
  assert.deepEqual(plain(changes.map(change => [change.kind, change.before?.str, change.after?.str])), [["changed", "9K1R2F-1-GP", "4.7Kohm"]]);
});

test("values are compared part by part, a label between two parts is left out, and fitted or not needs a sure answer", () => {
  const k = diffs();
  const part = (name, x, y) => item(name, x, y, 0.011, 0.005);
  const label = (text, x, y) => item(text, x, y + 0.006, 0.03, 0.005);
  const before = [part("R3410", 0.1, 0.1), label("2K21R2F-7-GP", 0.1, 0.1), part("C3402", 0.3, 0.1), label("SC1U25V2KX-10-GP", 0.3, 0.1),
    part("R2701", 0.5, 0.1), label("10KR2F-2-GP", 0.5, 0.1), item("NOPOP", 0.5, 0.118, 0.012, 0.005), part("R4111", 0.7, 0.1), label("10KR2F-2-GP", 0.7, 0.1)];
  const after = [part("R3410", 0.1, 0.1), label("100KOHM", 0.1, 0.1), part("C3402", 0.3, 0.1), label("1uF/16V", 0.3, 0.1),
    // The redraw prints NI right under the value, nearer to the transistor below than to the resistor: it belongs to the
    // value above it, so R2701 did not change.
    part("R2701", 0.5, 0.1), label("10KOhm", 0.5, 0.1), part("Q2701", 0.5, 0.128), item("NI", 0.5, 0.1175, 0.006, 0.005),
    part("R4111", 0.7, 0.1), label("10Kohm", 0.7, 0.1), item("NI", 0.7, 0.118, 0.006, 0.005)];
  const changes = k.diffCircuitPartValues(before, after).filter(change => !change.unsure);
  assert.deepEqual(plain(changes.map(change => [change.refdes, change.before, change.after])), [["C3402", ["C:1000000/25V"], ["C:1000000/16V"]], ["R3410", ["R:2210"], ["R:100000"]], ["R4111", [], ["DNP"]]]);
  assert.equal(changes[2].fitted, "work", "R4111 is marked not fitted only in the redraw");
  // The value of a part printed under the next one is not taken for it (C4602 was given its neighbour's 100nF).
  const crowded = [part("C4602", 0.2, 0.5), item("SC10U6D3V2MX-40-GP", 0.203, 0.507, 0.004, 0.06), part("C4603", 0.18, 0.455), item("SCD1U16V2KX-28-GP", 0.183, 0.462, 0.004, 0.056)];
  assert.deepEqual(plain(k.diffCircuitPartValues(crowded, [part("C4602", 0.2, 0.5), label("10uF/6.3V", 0.2, 0.5), part("C4603", 0.18, 0.455), label("0.1uF/16V", 0.18, 0.455)])), []);
});

test("how many more not-fitted marks one side prints is how many parts differ, with the likely parts named", () => {
  const k = diffs();
  const page = { textComparable: true, graphicsComparable: true, sizeChanged: false, textChanges: [], regions: [], valueChanges: [{ refdes: "R1418、R1419", before: ["DNP", "DNP"], after: [], fitted: "base", unsure: true }], valueCounts: [{ side: "base", token: "DNP", type: "other", count: 2, value: true }] };
  const summary = k.summarizeCircuitLocalDiff(page);
  assert.deepEqual(plain(summary.findings.map(finding => finding.title)), ["2 顆零件的上件狀態不一樣：基準版多 2 個不上件標示（NOPOP／NI），可能是 R1418、R1419"]);
  assert.equal(summary.own, 1);
});

test("a clean swap of values no part explains is counted with how many parts; anything else is for reference", () => {
  const k = diffs();
  const page = (valueChanges, valueCounts) => ({ textComparable: true, graphicsComparable: true, sizeChanged: false, textChanges: [], regions: [], valueChanges, valueCounts });
  const swap = k.summarizeCircuitLocalDiff(page(
    [{ refdes: "R2104", before: ["R:9100"], after: ["R:4700"] }, { refdes: "R2107", before: ["R:9100"], after: ["R:4700"] }],
    [{ side: "base", token: "R:9100", type: "other", count: 3, value: true }, { side: "work", token: "R:4700", type: "other", count: 3, value: true }]));
  assert.deepEqual(plain(swap.findings.map(finding => finding.title)), ["R2104 的數值不一樣：9.1KΩ → 4.7KΩ", "R2107 的數值不一樣：9.1KΩ → 4.7KΩ", "1 顆電阻的數值不一樣：9.1KΩ → 4.7KΩ（標示離零件編號太遠，沒有逐顆對到）"]);
  assert.equal(swap.own, 3);
  // Beads and chokes printed as part codes on one side and as values on the other are not values that changed.
  const unread = k.summarizeCircuitLocalDiff(page([], [{ side: "work", token: "R:120", type: "other", count: 7, value: true }, { side: "work", token: "R:90", type: "other", count: 4, value: true }]));
  assert.equal(unread.own, 0);
  assert.match(unread.findings[0].title, /^參考：電阻的標示數量不一樣/);
});

test("marks someone drew, a frame the content moved against, a symbol a little off, moved text and pin names are never counted", () => {
  const k = diffs();
  const region = (kind, x) => ({ box: { x, y: 0.4, width: 0.1, height: 0.1 }, base: false, work: true, ...(kind ? { kind } : {}) });
  const summary = k.summarizeCircuitLocalDiff({ textComparable: true, graphicsComparable: true, sizeChanged: false,
    textChanges: [{ kind: "moved", before: item("Power Map", 0.1, 0.03), after: item("Power Map", 0.11, 0.035) }, { kind: "added", after: item("IO", 0.5, 0.6, 0.01) }, { kind: "added", after: item("GND", 0.52, 0.6, 0.01) }],
    regions: [region("annotation", 0.1), region("frame", 0.3), region("nudged", 0.5), region(undefined, 0.7), region(undefined, 0.72)] });
  const titles = plain(summary.findings.map(finding => finding.title));
  assert.equal(summary.own, 1, titles.join(" | "));
  assert.ok(titles.includes("這一塊的線或符號不一樣（2 處）"), "two drawing differences side by side are one place to look at");
  for (const words of ["不算錯：比對版多了彩色的框線或註記 1 處", "不算錯：整頁內容和圖框的相對位置不一樣", "參考：1 處符號或線只差一點點位置", "參考：3 段字一樣，只是換了位置或是符號上的腳位名稱"]) assert.ok(titles.some(title => title.startsWith(words)), `${words} in ${titles.join(" | ")}`);
});

test("drawn again sharp: a speck is gone, a junction dot stays, a box or a dashed line around what is there is a mark", () => {
  const r = reader();
  const width = 120, height = 80, margin = 4, baseWidth = width + 2 * margin;
  const blank = () => new Uint8Array(width * height), blankBase = () => new Uint8Array(baseWidth * (height + 2 * margin));
  const put = (mask, w, x, y) => { mask[y * w + x] = 1; };
  const wire = (mask, w, offset = 0) => { for (let x = 10; x < 110; x++) for (let t = 0; t < 2; t++) put(mask, w, x + offset, 40 + t + offset); };
  const base = blankBase(), work = blank();
  wire(base, baseWidth, margin); wire(work, width);
  assert.equal(r.cropDifference(base, baseWidth, margin, work, width, height, 2, [{ dx: 0, dy: 0 }]).count, 0, "the same wire");
  const dotted = blank(); wire(dotted, width);
  for (let y = 35; y < 47; y++) for (let x = 55; x < 67; x++) if ((x - 61) ** 2 + (y - 41) ** 2 <= 30) put(dotted, width, x, y);
  assert.ok(r.cropDifference(base, baseWidth, margin, dotted, width, height, 2, [{ dx: 0, dy: 0 }]).count >= 12, "a junction dot is not a speck");
  // A box around the wire, solid or dashed.
  const boxed = blank(), dashed = blank();
  for (let x = 5; x < 115; x++) for (const y of [5, 6, 74, 75]) { put(boxed, width, x, y); if (x % 8 < 5) put(dashed, width, x, y); }
  for (let y = 5; y < 76; y++) for (const x of [5, 6, 113, 114]) { put(boxed, width, x, y); if (y % 8 < 5) put(dashed, width, x, y); }
  assert.equal(r.onlyAnOutline(boxed, width, height), true);
  assert.equal(r.onlyDashedLines(dashed, width, height), true);
  // A new solid wire is neither.
  const newWire = blank(); for (let x = 10; x < 110; x++) put(newWire, width, x, 20);
  assert.equal(r.onlyDashedLines(newWire, width, height), false);
  assert.equal(r.onlyAnOutline(newWire, width, height), false);
  // The same symbol (an L) two pixels off is found where it moved to.
  const corner = (mask, w, offset) => { for (let x = 30; x < 60; x++) put(mask, w, x + offset, 20 + offset); for (let y = 20; y < 50; y++) put(mask, w, 30 + offset, y + offset); };
  const lBase = blankBase(), lWork = blank(); corner(lBase, baseWidth, margin); corner(lWork, width, 2);
  const left = r.cropDifference(lBase, baseWidth, margin, lWork, width, height, 0, [{ dx: 0, dy: 0 }]).unmatched;
  assert.deepEqual(plain(r.bestAlignment(lBase, baseWidth, margin, lWork, width, height, 4, left)), { dx: 2, dy: 2 });
  assert.equal(r.cropDifference(lBase, baseWidth, margin, lWork, width, height, 0, [{ dx: 0, dy: 0 }, { dx: 2, dy: 2 }]).count, 0);
});

// 2026-11-25: 「明明上一頁同一的地方有標但下一頁卻沒掃出來」 — sheet 21 marked its four 9.1K → 4.7K pull-ups, sheet 22 (the same
// circuit) marked one and only counted the other three. Every case below is the geometry of the real E1.S pair.
test("a stack of parts with each value in its own row pairs up row by row, however near the next row is (sheets 21 and 22)", () => {
  const k = diffs();
  const part = (name, x, y) => item(name, x, y, 0.0114, 0.0054);
  // The reference: Ref Des above, value right under it.
  const pulls = [["R2201", 0.6563, 0.0179, "4K7R2F-GP"], ["R2202", 0.6777, 0.03, "4K7R2F-GP"], ["R2203", 0.6991, 0.0421, "9K1R2F-1-GP"], ["R2204", 0.7248, 0.0542, "4K7R2F-GP"]]
    .flatMap(([name, x, y, value]) => [part(name, x, y), item(value, x - 0.0086, y + 0.0061, 0.0245, 0.0054)]);
  const caps = (value, down, width) => Array.from({ length: 9 }, (_, index) => [part(`C22${10 + index}`, 0.1 + index * 0.05, 0.5), item(value, 0.1 + index * 0.05, 0.5 + down, width, 0.0054)]).flat();
  // The redraw: four pull-ups stacked 0.65 % apart, each value 2.85 % to the right in its own row, farther than two and a
  // half times the usual gap of the sheet (the capacitors print theirs 1.1 % under the Ref Des).
  const redraw = [0.0288, 0.0355, 0.0421, 0.0482].flatMap((y, index) => [part(`R220${index + 1}`, 0.6717, y), item("4.7Kohm", 0.7116, y, 0.0155, 0.0054)]);
  const result = k.matchCircuitPartValues([...pulls, ...caps("SCD1U16V2KX-1", 0.0061, 0.03)], [...redraw, ...caps("0.1uF/16V", 0.0166, 0.0197)]);
  assert.deepEqual(plain(result.changes.map(change => [change.refdes, change.before, change.after, change.baseItem.str, change.workItem.y])), [["R2203", ["R:9100"], ["R:4700"], "9K1R2F-1-GP", 0.0421]]);
  assert.deepEqual(plain(result.leftovers), { base: [], work: [] }, "every label has its part");
});

test("a not-fitted mark under a tall symbol, in line with its Ref Des, is that part's and not the resistor's below it (sheets 35, 36 and 45)", () => {
  const k = diffs();
  const part = (name, x, y) => item(name, x, y, 0.0114, 0.0054), mark = (x, y) => item("NOPOP", x, y, 0.0137, 0.0054), ni = (x, y) => item("NI", x, y, 0.0038, 0.0054);
  // The reference prints NOPOP under the choke symbol, 5.5 % below its Ref Des; the resistor under it is 1.4 % away.
  const chokes = [part("L3609", 0.3977, 0.0361), mark(0.3977, 0.0966), part("R3634", 0.3805, 0.1147), item("0R2F-1-GP", 0.4169, 0.1147, 0.0198, 0.0054),
    part("L3611", 0.3977, 0.154), mark(0.3977, 0.2145), part("R3632", 0.3784, 0.2326), item("0R2F-1-GP", 0.4148, 0.2326, 0.0198, 0.0054)];
  const pulls = [0.4231, 0.4866, 0.5531].flatMap((y, index) => [part(`R36${18 + index * 2}`, 0.7183, y), mark(0.7333, y)]);
  const redraw = [part("L3609", 0.3908, 0.0482), item("90ohm", 0.3908, 0.0554, 0.0125, 0.0054), part("R3634", 0.3929, 0.1177), item("0ohm", 0.44, 0.1177, 0.01, 0.0054),
    part("L3611", 0.3912, 0.18), item("90ohm", 0.3912, 0.1872, 0.0125, 0.0054), part("R3632", 0.3917, 0.2496), item("0ohm", 0.44, 0.2496, 0.01, 0.0054),
    ...[0.4231, 0.4866, 0.5531].flatMap((y, index) => [part(`R36${18 + index * 2}`, 0.7183, y), ni(0.7213, y + 0.0157)])];
  const changes = k.diffCircuitPartValues([...chokes, ...pulls], redraw);
  assert.deepEqual(plain(changes.map(change => [change.refdes, change.fitted, Boolean(change.unsure), change.baseItem.str, change.workItem.str])), [["L3609", "base", false, "NOPOP", "L3609"], ["L3611", "base", false, "NOPOP", "L3611"]]);
  // The only mark of a sheet (sheet 35): nothing to learn from, the Ref Des above it is still the part.
  assert.deepEqual(plain(k.diffCircuitPartValues(chokes.slice(0, 4), redraw.slice(0, 4)).map(change => [change.refdes, change.fitted])), [["L3609", "base"]]);
  // The redraw marks the chokes too, right under their Ref Des (sheet 45): the same parts, nothing changed.
  assert.deepEqual(plain(k.diffCircuitPartValues([...chokes, ...pulls], [...redraw, ni(0.3942, 0.0626), ni(0.3946, 0.1944)]).filter(change => !change.unsure)), []);
});

test("a mark that overlaps the next part's upright value still belongs to the Ref Des it lies under (sheets 23 to 26)", () => {
  const k = diffs();
  const part = (name, x, y) => item(name, x, y, 0.0114, 0.0054);
  const before = [part("R2304", 0.5623, 0.2115), item("4K7R2F-GP", 0.5767, 0.2056, 0.0038, 0.0298), item("NOPOP", 0.5537, 0.2236, 0.0137, 0.0054),
    part("R2305", 0.5837, 0.2175), item("4K7R2F-GP", 0.5981, 0.2056, 0.0038, 0.0298), item("NOPOP", 0.5794, 0.2236, 0.0137, 0.0054),
    part("R2306", 0.605, 0.2175), item("4K7R2F-GP", 0.6195, 0.2056, 0.0038, 0.0298)];
  const after = [part("R2304", 0.5648, 0.1988), item("4.7Kohm", 0.5648, 0.206, 0.0155, 0.0054), item("NI", 0.5678, 0.2145, 0.0038, 0.0054),
    part("R2305", 0.5901, 0.2), item("4.7Kohm", 0.5901, 0.2072, 0.0155, 0.0054), item("NI", 0.5931, 0.2157, 0.0038, 0.0054),
    part("R2306", 0.8663, 0.2072), item("4.7Kohm", 0.8663, 0.2144, 0.0155, 0.0054)];
  const result = k.matchCircuitPartValues(before, after);
  assert.deepEqual(plain(result.changes.filter(change => !change.unsure)), [], "R2304 and R2305 are marked on both sides");
  assert.deepEqual(plain(result.leftovers), { base: [], work: [] });
});

test("every value or fitted difference is marked on the drawing, and one named part never hides another label", () => {
  const k = diffs();
  const page = extra => ({ textComparable: true, graphicsComparable: true, sizeChanged: false, textChanges: [], regions: [], valueChanges: [], valueLeftovers: { base: [], work: [] }, ...extra });
  const old = item("9K1R2F-1-GP", 0.5, 0.5), now = item("4.7Kohm", 0.5, 0.5), old2 = item("9K1R2F-1-GP", 0.7, 0.5), now2 = item("4.7Kohm", 0.7, 0.5);
  // Two values rewritten in place and one part named: the other keeps its own finding, and is not counted a second time.
  const named = k.summarizeCircuitLocalDiff(page({ textChanges: [{ kind: "changed", before: old, after: now }, { kind: "changed", before: old2, after: now2 }],
    valueChanges: [{ refdes: "R1", before: ["R:9100"], after: ["R:4700"], baseItem: old, workItem: now }], valueLeftovers: { base: [{ key: "R:9100", item: old2 }], work: [{ key: "R:4700", item: now2 }] } }));
  assert.deepEqual(plain(named.findings.map(finding => finding.title)), ["字改了：9K1R2F-1-GP → 4.7Kohm", "R1 的數值不一樣：9.1KΩ → 4.7KΩ"]);
  assert.equal(named.own, 2);
  assert.equal(named.findings[0].workingBox.x > 0.6, true, "the finding that stays is the label nobody named");
  // Marks no part explains: one finding per mark, each boxed where it is.
  const marks = k.summarizeCircuitLocalDiff(page({ valueLeftovers: { base: [{ key: "DNP", item: item("NOPOP", 0.2, 0.2) }, { key: "DNP", item: item("NOPOP", 0.4, 0.6) }], work: [] } }));
  assert.equal(marks.own, 2);
  assert.ok(marks.findings.every(finding => finding.title.startsWith("1 顆零件的上件狀態不一樣：基準版這裡多 1 個不上件標示") && finding.officialBox && !finding.workingBox));
  // A swap no part explains: one finding per pair of labels, in the order they lie on the sheet.
  const swap = k.summarizeCircuitLocalDiff(page({ valueLeftovers: { base: [{ key: "R:9100", item: old2 }, { key: "R:9100", item: old }], work: [{ key: "R:4700", item: now }, { key: "R:4700", item: now2 }] } }));
  assert.deepEqual(plain(swap.findings.map(finding => [finding.title, finding.officialBox.x < 0.6, finding.workingBox.x < 0.6])),
    [["1 顆電阻的數值不一樣：9.1KΩ → 4.7KΩ（旁邊對不到零件編號）", true, true], ["1 顆電阻的數值不一樣：9.1KΩ → 4.7KΩ（旁邊對不到零件編號）", false, false]]);
  // The same part marked on both sides, the marks placed differently: one line for reference, never counted.
  const placed = k.summarizeCircuitLocalDiff(page({ valueChanges: [{ refdes: "R2701", before: ["DNP"], after: ["DNP"], fitted: "base", unsure: true, baseItem: item("NOPOP", 0.5, 0.118), workItem: item("NI", 0.5, 0.1175) }] }));
  assert.equal(placed.own, 0);
  assert.match(placed.findings[0].title, /^參考：1 個不上件標示（NOPOP／NI）放的位置和另一版不一樣，應該是同一顆：R2701/);
});
