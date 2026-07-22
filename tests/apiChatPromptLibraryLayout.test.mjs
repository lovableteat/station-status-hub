import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/components/api-management/ApiChatConsole.tsx", import.meta.url),
  "utf8",
);

test("shared prompt rows stay compact while full content remains available on hover", () => {
  assert.match(
    source,
    /className="group flex h-20 items-stretch[^"\n]*overflow-hidden/,
    "prompt rows should keep a fixed height and hide overflowing content",
  );
  assert.match(
    source,
    /className="mt-1 block line-clamp-1 truncate text-sm leading-5 text-slate-300"/,
    "long prompt summaries should remain on one line",
  );
  assert.match(
    source,
    /<HoverCard[\s\S]*?<HoverCardTrigger asChild>[\s\S]*?<HoverCardContent[\s\S]*?\{item\.content\}/,
    "the complete prompt content should remain available in an accessible hover card",
  );
});

test("shared prompt hover preview opens at the upper-right with structured content", () => {
  const hoverPreview = source.match(
    /<HoverCardContent[\s\S]*?data-testid="prompt-hover-preview"[\s\S]*?<\/HoverCardContent>/,
  )?.[0] ?? "";

  assert.match(hoverPreview, /side="right"/);
  assert.match(hoverPreview, /align="start"/);
  assert.match(hoverPreview, /z-\[60\]/);
  assert.match(hoverPreview, /完整提示詞/);
  assert.match(hoverPreview, /點選原列立即套用/);
  assert.doesNotMatch(hoverPreview, /shadow-none/);
});
