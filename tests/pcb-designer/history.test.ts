import test from "node:test";
import assert from "node:assert/strict";
import {
  createHistoryState,
  pushHistory,
  redoHistory,
  undoHistory,
} from "../../src/components/pcb-designer/core/history.ts";

test("push snapshots and undo/redo restore isolated document states", () => {
  const initial = { name: "initial", nested: { count: 0 } };
  const pushed = pushHistory(createHistoryState(initial), { name: "edited", nested: { count: 1 } });
  initial.nested.count = 99;

  const undone = undoHistory(pushed);
  assert.deepEqual(undone.current, { name: "initial", nested: { count: 0 } });
  const redone = redoHistory(undone);
  assert.deepEqual(redone.current, { name: "edited", nested: { count: 1 } });

  const returnedToInitial = undoHistory(redone);
  redone.current.nested.count = 7;
  assert.equal(redoHistory(returnedToInitial).current.nested.count, 1);
});

test("pushing after undo clears redo history", () => {
  const state = undoHistory(pushHistory(pushHistory(createHistoryState("A"), "B"), "C"));
  const next = pushHistory(state, "D");

  assert.equal(next.current, "D");
  assert.equal(next.redo.length, 0);
  assert.equal(redoHistory(next).current, "D");
});

test("pushing isolates existing undo snapshots from the predecessor state", () => {
  const predecessor = pushHistory(
    createHistoryState({ name: "initial", nested: { count: 0 } }),
    { name: "first edit", nested: { count: 1 } },
  );
  const successor = pushHistory(predecessor, { name: "second edit", nested: { count: 2 } });

  predecessor.undo[0].nested.count = 99;

  assert.equal(successor.undo[0].nested.count, 0);
});

test("history retains at most 100 undo transactions", () => {
  let state = createHistoryState(0);
  for (let value = 1; value <= 101; value += 1) state = pushHistory(state, value);

  assert.equal(state.undo.length, 100);
  assert.equal(state.undo[0], 1);
  assert.equal(state.current, 101);
});
