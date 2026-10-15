import assert from "node:assert/strict";
import test from "node:test";
import { diagramHistory, editDiagram, redoDiagram, undoDiagram } from "../../src/components/comparison/diagramHistory.ts";
import type { DiagramDocument } from "../../src/components/comparison/diagramModel.ts";

const initial = { title: "original", nodes: [], edges: [] } as unknown as DiagramDocument;
test("undo and redo preserve complete graph edits, and editing after undo drops the old future", () => {
  const changed = { ...initial, title: "changed" };
  const history = editDiagram(diagramHistory(initial), changed);
  assert.equal(undoDiagram(history).present, initial);
  assert.equal(redoDiagram(undoDiagram(history)).present, changed);
  const branched = editDiagram(undoDiagram(history), { ...initial, title: "new branch" });
  assert.equal(branched.future.length, 0);
  assert.equal(redoDiagram(branched), branched);
});
test("a drag is one undo step, even if its intermediate positions rendered many times", () => {
  const before = { ...initial, nodes: [{ id: "n", x: 0, y: 0 }] } as DiagramDocument;
  const after = { ...before, nodes: [{ ...before.nodes[0], x: 240, y: 80 }] };
  const transient = { ...diagramHistory(before), present: { ...before, nodes: [{ ...before.nodes[0], x: 120, y: 40 }] } };
  const finished = editDiagram(transient, after, before);
  assert.deepEqual(undoDiagram(finished).present.nodes, before.nodes);
  assert.equal(finished.past.length, 1);
});
test("history is bounded, no-op edits and unavailable undo do not create steps", () => {
  let history = diagramHistory(initial);
  assert.equal(undoDiagram(history), history);
  assert.equal(editDiagram(history, { ...initial }).past.length, 0);
  for (let i = 0; i < 100; i++) history = editDiagram(history, { ...initial, title: String(i) });
  assert.equal(history.past.length, 50);
});
