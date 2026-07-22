import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../src/components/material-requests/materialBomPerformance.ts", import.meta.url);

test("remote BOM rows are split into parallel-safe 1000-row ranges", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const performance = await import(
    `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
  );

  assert.deepEqual(performance.createBomRecordFetchRanges(3377), [
    { from: 0, to: 999 },
    { from: 1000, to: 1999 },
    { from: 2000, to: 2999 },
    { from: 3000, to: 3999 },
  ]);
  assert.deepEqual(performance.createBomRecordFetchRanges(0), []);
  assert.deepEqual(
    performance.chunkBomRecordFetchRanges(
      performance.createBomRecordFetchRanges(6000),
      4,
    ).map((wave) => wave.length),
    [4, 2],
  );
});

test("unchanged cached BOM payload keeps its reference after remote metadata sync", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const performance = await import(
    `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`
  );
  const records = [{ id: "record-1" }];
  const current = {
    generatedAt: "2026-07-22T00:00:00.000Z",
    recordCount: 1,
    records,
    sheetName: "BOM",
    sourceFile: "bom.xlsx",
  };
  const incoming = { ...current, records };

  assert.equal(performance.canReuseBomPayloadReference(current, incoming), true);
  assert.equal(
    performance.canReuseBomPayloadReference(current, { ...incoming, recordCount: 2 }),
    false,
  );
});
