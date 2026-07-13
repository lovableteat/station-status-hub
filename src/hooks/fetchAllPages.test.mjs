import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

let pagination = {};

try {
  const sourceUrl = new URL("./fetchAllPages.ts", import.meta.url);
  const source = await readFile(sourceUrl, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  pagination = await import(
    `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
  );
} catch {
  pagination = {};
}

test("fetchAllPages loads every row beyond the Supabase 1000-row response limit", async () => {
  assert.equal(typeof pagination.fetchAllPages, "function");
  const source = Array.from({ length: 2_505 }, (_, index) => ({ id: index + 1 }));
  const requestedRanges = [];

  const result = await pagination.fetchAllPages(async (from, to) => {
    requestedRanges.push([from, to]);
    return { data: source.slice(from, to + 1), error: null };
  });

  assert.equal(result.error, null);
  assert.equal(result.data.length, 2_505);
  assert.deepEqual(requestedRanges, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("fetchAllPages stops immediately and returns a page error", async () => {
  assert.equal(typeof pagination.fetchAllPages, "function");
  const expectedError = new Error("query failed");
  let requestCount = 0;

  const result = await pagination.fetchAllPages(async () => {
    requestCount += 1;
    return { data: null, error: expectedError };
  });

  assert.equal(result.error, expectedError);
  assert.deepEqual(result.data, []);
  assert.equal(requestCount, 1);
});
