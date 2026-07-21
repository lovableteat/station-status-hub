import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("AI chat header renders one consolidated model control", async () => {
  const source = await read("../src/components/api-management/ApiChatConsole.tsx");

  assert.equal(source.match(/data-testid="ai-model-control"/g)?.length, 1);
  assert.doesNotMatch(source, /sm:grid-cols-\[minmax\(280px,1fr\)_280px\]/);
  assert.match(source, /aria-label="選擇 API 金鑰與模型"/);
});
