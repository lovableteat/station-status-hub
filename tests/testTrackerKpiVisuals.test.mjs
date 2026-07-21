import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const trackerUrl = new URL("../src/components/test-tracker/TestTracker.tsx", import.meta.url);
const source = await readFile(trackerUrl, "utf8");

test("tracker KPI cards use distinct illuminated surfaces", () => {
  assert.match(source, /blue:\s*\{[\s\S]*?card:[\s\S]*?shadow-/);
  assert.match(source, /cyan:\s*\{[\s\S]*?card:[\s\S]*?shadow-/);
  assert.match(source, /emerald:\s*\{[\s\S]*?card:[\s\S]*?shadow-/);
  assert.match(source, /amber:\s*\{[\s\S]*?card:[\s\S]*?shadow-/);
  assert.match(source, /violet:\s*\{[\s\S]*?card:[\s\S]*?shadow-/);
  assert.match(source, /testId="tracker-kpi-overall"/);
});

test("machine total and active machine cards do not reuse the same tone", () => {
  const totalBlock = source.match(/icon=\{Boxes\}[\s\S]*?\/>/)?.[0] ?? "";
  const activeBlock = source.match(/icon=\{Activity\}[\s\S]*?\/>/)?.[0] ?? "";

  assert.match(totalBlock, /tone="cyan"/);
  assert.match(activeBlock, /tone="blue"/);
});
