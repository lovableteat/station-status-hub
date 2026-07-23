import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/components/api-management/ApiChatConsole.tsx", import.meta.url),
  "utf8",
);

test("shared prompt cards keep a compact, consistent row height", () => {
  assert.match(
    source,
    /className="group flex h-20 items-stretch/,
    "prompt cards should use the same fixed row height",
  );
  assert.match(
    source,
    /className="mt-1 block truncate text-sm leading-5 text-slate-300"/,
    "long prompt summaries should stay on one line",
  );
});

test("shared prompt preview opens at the upper-right without leaving the viewport", () => {
  assert.match(source, /data-testid="prompt-hover-preview"/);
  assert.match(source, /side="right"/);
  assert.match(source, /align="start"/);
  assert.match(source, /collisionPadding=\{16\}/);
  assert.match(source, /max-h-\[min\(320px,58vh\)\]/);
});
