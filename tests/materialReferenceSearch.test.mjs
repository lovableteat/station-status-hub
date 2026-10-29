import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const { loader } = createRequire(import.meta.url)("./support/renderHarness.cjs");
const { matchesMaterialReference, isMaterialReferenceQuery } = loader()("src/components/material-requests/materialSearch.ts");

test("complete reference queries cannot become substring matches of another prefix or number", () => {
  assert.equal(matchesMaterialReference("PR1", "R1"), false);
  assert.equal(matchesMaterialReference("R10, R11", "R1"), false);
  assert.equal(matchesMaterialReference("R1, R2", "R1"), true);
  assert.equal(matchesMaterialReference("R1_C0P1", "r1"), true);
  assert.equal(matchesMaterialReference("PR1_C0P1", "r1"), false);
  assert.equal(matchesMaterialReference("LB48_C0P1", "LB48"), true);
  assert.equal(matchesMaterialReference("R1, R2", "R"), true);
  assert.equal(matchesMaterialReference("PR1", "R"), false);
  assert.equal(isMaterialReferenceQuery("Ｒ１"), true);
  assert.equal(matchesMaterialReference("RES 0402 PR1 R10", "R1"), false);
  assert.equal(matchesMaterialReference("MP5926 monolithic power", "MP5926"), true, "a complete MPN is still searchable in all columns");
});
