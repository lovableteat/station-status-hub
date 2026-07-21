import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const headerSourceUrl = new URL(
  "../src/components/layout/MainWorkspaceHeader.tsx",
  import.meta.url,
);
const indicatorSourceUrl = new URL(
  "../src/components/common/OnlineUsersIndicator.tsx",
  import.meta.url,
);
const indexSourceUrl = new URL("../src/pages/Index.tsx", import.meta.url);

test("online users indicator is rendered inside the workspace header", async () => {
  const [headerSource, indexSource] = await Promise.all([
    readFile(headerSourceUrl, "utf8"),
    readFile(indexSourceUrl, "utf8"),
  ]);

  assert.match(headerSource, /<OnlineUsersIndicator\s*\/>/);
  assert.doesNotMatch(indexSource, /<OnlineUsersIndicator\s*\/>/);
});

test("online users control stays aligned with the fixed header control height", async () => {
  const [headerSource, indicatorSource] = await Promise.all([
    readFile(headerSourceUrl, "utf8"),
    readFile(indicatorSourceUrl, "utf8"),
  ]);

  assert.doesNotMatch(indicatorSource, /fixed bottom-4 right-4/);
  assert.match(indicatorSource, /h-12 w-\[140px\]/);
  assert.match(headerSource, /h-12 w-12/);
  assert.match(headerSource, /h-12 w-\[140px\]/);
});
