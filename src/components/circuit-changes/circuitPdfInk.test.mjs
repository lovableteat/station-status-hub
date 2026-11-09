import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { loader } = require("../../../tests/support/renderHarness.cjs");
const ink = loader()("src/components/circuit-changes/circuitPdfInk.ts");
const same = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected));
const stroke = (id, extra = {}) => ({ id, documentId: "d1", page: 2, points: [{ x: 0, y: 1 }, { x: .2, y: .3 }], color: "#ef4444", width: .002,
  at: "2026-11-10T00:00:00.000Z", by: "u1", byName: "甲", ...extra });

test("stored arrays and versioned rows retain valid strokes and drop only malformed entries", () => {
  const good = stroke("good"), removed = stroke("removed", { removedAt: "2026-11-10T01:00:00.000Z", removedBy: "u2", removedByName: "乙" });
  const malformed = [null, {}, stroke("", {}), stroke("nan", { points: [{ x: NaN, y: .2 }] }), stroke("outside", { points: [{ x: 1.1, y: 0 }] }),
    stroke("empty", { points: [] }), stroke("wide", { width: .031 }), stroke("thin", { width: .00001 }), stroke("infinite", { width: Infinity }),
    stroke("color", { color: "url(example)" }), stroke("date", { at: "never" }), stroke("removed-date", { removedAt: "never" }), stroke("point-text", { points: [{ x: ".2", y: 0 }] })];
  same(ink.normalizeCircuitPdfInk({ version: 1, strokes: [good, ...malformed, removed] }, "d1", 2), [good, removed]);
  same(ink.normalizeCircuitPdfInk([good], "d1", 2), [good]);
  same(ink.normalizeCircuitPdfInk(null, "d1", 2), []);
});

test("strokes are isolated by the exact PDF document and page", () => {
  const rows = [stroke("mine"), stroke("another-pdf", { documentId: "d2" }), stroke("another-page", { page: 3 }), stroke("text-page", { page: "2" })];
  same(ink.normalizeCircuitPdfInk(rows, "d1", 2).map(row => row.id), ["mine"]);
  for (const page of [0, -1, 1.5, NaN, 3001]) same(ink.normalizeCircuitPdfInk(rows, "d1", page), []);
  same(ink.normalizeCircuitPdfInk(rows, "", 2), []);
});

test("point bounds reject an oversized stroke without truncating valid stored stroke history", () => {
  assert.equal(ink.CIRCUIT_PDF_INK_MAX_POINTS, 4096);
  assert.equal(ink.CIRCUIT_PDF_INK_MAX_STROKES, 1000);
  const points = Array.from({ length: 4096 }, () => ({ x: .1, y: .2 }));
  assert.equal(ink.normalizeCircuitPdfInk([stroke("max", { points })], "d1", 2)[0].points.length, 4096);
  same(ink.normalizeCircuitPdfInk([stroke("too-big", { points: [...points, { x: 0, y: 0 }] }), stroke("valid")], "d1", 2).map(row => row.id), ["valid"]);
  const stored = Array.from({ length: 1001 }, (_, index) => stroke(String(index)));
  assert.equal(ink.normalizeCircuitPdfInk(stored, "d1", 2).length, 1001, "old history is never silently cut to the new-add limit");
});

test("concurrent independent strokes are kept once and source arrays are unchanged", () => {
  const base = [stroke("a")], incoming = [stroke("a"), stroke("b", { by: "u2" })];
  const before = JSON.stringify([base, incoming]);
  same(ink.mergeCircuitPdfInk(base, incoming).map(row => row.id), ["a", "b"]);
  assert.equal(JSON.stringify([base, incoming]), before);
});

test("a tombstone always beats an active stroke, including a newer stale client copy", () => {
  const removed = stroke("a", { removedAt: "2026-11-10T01:00:00.000Z", removedBy: "u2", removedByName: "乙" });
  const stale = stroke("a", { at: "2026-11-11T00:00:00.000Z" });
  same(ink.mergeCircuitPdfInk([removed], [stale]), [removed]);
  same(ink.mergeCircuitPdfInk([stale], [removed]), [removed]);
  same(ink.normalizeCircuitPdfInk([stale, removed, stale], "d1", 2), [removed]);
});

test("same-time conflicts and two deletions resolve the same way in either merge direction", () => {
  const first = stroke("a"), second = stroke("a", { color: "#00ff00", by: "u2" });
  same(ink.mergeCircuitPdfInk([first], [second]), ink.mergeCircuitPdfInk([second], [first]));
  const older = stroke("a", { removedAt: "2026-11-10T01:00:00.000Z", removedBy: "u1" });
  const newer = stroke("a", { removedAt: "2026-11-10T02:00:00.000Z", removedBy: "u2" });
  same(ink.mergeCircuitPdfInk([older], [newer]), [newer]);
  same(ink.mergeCircuitPdfInk([newer], [older]), [newer]);
});
