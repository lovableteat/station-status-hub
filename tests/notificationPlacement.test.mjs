import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("global notifications stay clear of the bottom-right chat dock", async () => {
  const [sonnerSource, radixToastSource] = await Promise.all([
    readSource("src/components/ui/sonner.tsx"),
    readSource("src/components/ui/toast.tsx"),
  ]);

  assert.match(sonnerSource, /position="top-right"/);
  assert.match(sonnerSource, /safe-area-inset-top/);
  assert.match(sonnerSource, /mobileOffset=/);

  assert.match(radixToastSource, /top-\[calc\(env\(safe-area-inset-top\)\+4\.5rem\)\]/);
  assert.doesNotMatch(radixToastSource, /sm:bottom-0/);
  assert.doesNotMatch(radixToastSource, /sm:slide-in-from-bottom-full/);
});
