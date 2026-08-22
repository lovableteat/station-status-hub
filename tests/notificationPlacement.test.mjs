import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("global notifications keep mobile header actions and the desktop chat dock reachable", async () => {
  const [sonnerSource, radixToastSource] = await Promise.all([
    readSource("src/components/ui/sonner.tsx"),
    readSource("src/components/ui/toast.tsx"),
  ]);

  assert.match(sonnerSource, /position="top-right"/);
  assert.match(sonnerSource, /safe-area-inset-top/);
  assert.match(sonnerSource, /mobileOffset=/);
  assert.match(sonnerSource, /max-sm:!left-2 max-sm:!right-2 max-sm:!w-auto/);
  assert.match(sonnerSource, /max-sm:!w-\[min\(250px,calc\(100vw-7\.5rem\)\)\]/);

  assert.match(radixToastSource, /left-2 right-auto top-\[max\(6px,env\(safe-area-inset-top\)\)\]/);
  assert.match(radixToastSource, /w-\[min\(250px,calc\(100%-7\.5rem\)\)\]/);
  assert.match(radixToastSource, /sm:left-auto sm:right-0/);
  assert.doesNotMatch(radixToastSource, /sm:bottom-0/);
  assert.doesNotMatch(radixToastSource, /sm:slide-in-from-bottom-full/);
});
