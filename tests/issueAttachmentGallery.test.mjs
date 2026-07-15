import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("issue attachment preview navigates every image in the current issue", async () => {
  const source = await read("../src/components/issues/IssueTracker.tsx");

  assert.match(source, /const \[previewImageIndex, setPreviewImageIndex\]/);
  assert.match(source, /const imageAttachments = useMemo/);
  assert.match(source, /isImageAttachment/);
  assert.match(source, /showPreviousImage/);
  assert.match(source, /showNextImage/);
  assert.match(source, /event\.key === "ArrowLeft"/);
  assert.match(source, /event\.key === "ArrowRight"/);
  assert.match(source, /上一張/);
  assert.match(source, /下一張/);
  assert.match(source, /第 \{previewImageIndex \+ 1\} \/ \{imageAttachments\.length\} 張/);
  assert.match(source, /aria-current=\{index === previewImageIndex \? "true" : undefined\}/);
});
