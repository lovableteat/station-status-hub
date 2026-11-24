import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { loader } = createRequire(import.meta.url)("../../../tests/support/renderHarness.cjs");
const service = () => loader()("src/components/circuit-changes/circuitPdfMarkTags.ts");

// The tag box as the CSS draws it, moved by the offset.
function tagBox(k, mark, offsets, width, height) {
  const offset = offsets.get(mark.id) ?? { dx: 0, dy: 0 };
  return { x: mark.rect.x * width - 5 + offset.dx, y: mark.rect.y * height - 24 + offset.dy, width: k.circuitMarkTagWidth(mark.id), height: 18 };
}
const clash = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("tags of marks drawn on top of each other step aside instead of piling up (2026-11-24, F9 under F11 under F10)", () => {
  const k = service(), width = 900, height = 640;
  const marks = ["F5", "F7", "F9", "F10", "F11", "F26", "F39"].map((id, index) => ({ id, rect: { x: 0.78 + (index % 2) * 0.004, y: 0.3 + index * 0.006, width: 0.02, height: 0.01 } }));
  const offsets = k.placeCircuitMarkTags(marks, width, height);
  const boxes = marks.map(mark => tagBox(k, mark, offsets, width, height));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.equal(clash(boxes[i], boxes[j]), false, `${marks[i].id} and ${marks[j].id} overlap`);
  assert.equal(offsets.has("F5"), false, "the first tag keeps its usual place");
  for (const box of boxes) assert.ok(box.y >= 0 && box.x >= -5 && box.x + box.width <= width + 5);
  // Nor on another mark's area, which is what the reader has to see.
  for (const [index, box] of boxes.entries()) for (const [other, mark] of marks.entries()) {
    if (other === index) continue;
    const area = { x: mark.rect.x * width - 5, y: mark.rect.y * height - 5, width: mark.rect.width * width + 10, height: mark.rect.height * height + 10 };
    assert.equal(clash(box, area), false, `${marks[index].id} lies on ${mark.id}`);
  }
});

test("a mark at the top edge puts its tag beside the box; a lone mark keeps the usual place", () => {
  const k = service();
  const top = k.placeCircuitMarkTags([{ id: "F1", rect: { x: 0.4, y: 0.005, width: 0.1, height: 0.05 } }], 800, 600);
  assert.deepEqual({ ...top.get("F1") }, { dx: 0.1 * 800 + 17, dy: 24 }, "level with the top of the box, just right of it");
  assert.equal(k.placeCircuitMarkTags([{ id: "F2", rect: { x: 0.4, y: 0.4, width: 0.1, height: 0.05 } }], 800, 600).size, 0);
  assert.deepEqual({ ...k.circuitMarkTagStyle({ dx: 33, dy: -18 }) }, { "--tag-dx": "33px", "--tag-dy": "-18px" });
});
