import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSystemSeriesNames,
  parseSystemSequence,
} from "../src/components/test-tracker/systemClone.mjs";

test("continues the trailing machine number", () => {
  const sequence = parseSystemSequence("Golden3");

  assert.deepEqual(sequence, {
    count: 5,
    padding: 0,
    prefix: "Golden",
    startNumber: 4,
  });
  assert.deepEqual(buildSystemSeriesNames(sequence), [
    "Golden4",
    "Golden5",
    "Golden6",
    "Golden7",
    "Golden8",
  ]);
});

test("preserves explicit leading zero padding", () => {
  const sequence = parseSystemSequence("MFG System003");

  assert.equal(sequence.padding, 3);
  assert.equal(sequence.startNumber, 4);
  assert.equal(buildSystemSeriesNames({ ...sequence, count: 2 })[0], "MFG System004");
});

test("starts a numbered series when the source has no suffix", () => {
  const sequence = parseSystemSequence("Test Rack");

  assert.equal(sequence.prefix, "Test Rack-");
  assert.equal(sequence.startNumber, 1);
  assert.equal(buildSystemSeriesNames({ ...sequence, count: 2 }).join(","), "Test Rack-1,Test Rack-2");
});

test("rejects invalid batch sizes and duplicate rendered names", () => {
  assert.throws(
    () => buildSystemSeriesNames({ prefix: "Rack", startNumber: 1, count: 0, padding: 0 }),
    /1.*100/
  );
  assert.throws(
    () => buildSystemSeriesNames({ prefix: "Rack", startNumber: 1, count: 101, padding: 0 }),
    /1.*100/
  );
});
