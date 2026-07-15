import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL(
  "../src/components/test-tracker/TestProgressTable.tsx",
  import.meta.url
);
const presentationUrl = new URL(
  "../src/components/test-tracker/testTrackerPresentation.ts",
  import.meta.url
);

test("test progress rows expose editing as a primary action", async () => {
  const [source, presentation] = await Promise.all([
    readFile(sourceUrl, "utf8"),
    readFile(presentationUrl, "utf8"),
  ]);

  assert.match(source, /data-testid={`edit-progress-\${system\.id}`}/);
  assert.match(source, /aria-label={`編輯 \${system\.system_name} 的測試進度`}/);
  assert.match(source, />\s*編輯進度\s*</);
  assert.match(
    source,
    /testId="progress-actions-header"[\s\S]*?className="[^"]*sticky[^"]*right-0[^"]*"/
  );
  assert.match(
    source,
    /data-testid={`progress-actions-\${system\.id}`}[\s\S]*?className=\{cn\(\s*"[^"]*sticky[^"]*right-0[^"]*"/
  );

  const popoverStart = source.indexOf("<PopoverContent");
  const popoverEnd = source.indexOf("</PopoverContent>", popoverStart);
  const popoverSource = source.slice(popoverStart, popoverEnd);
  assert.doesNotMatch(popoverSource, /編輯測試進度|編輯進度/);
  assert.match(
    presentation,
    /actions:\s*\{\s*defaultWidth:\s*168,\s*minWidth:\s*148,\s*maxWidth:\s*240\s*\}/
  );
});
