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

  // Desktop keeps the toast top-right, below the header and clear of the chat dock.
  assert.match(sonnerSource, /position=\{compact \? "bottom-right" : "top-right"\}/);
  assert.match(sonnerSource, /offset=\{20\}/);
  assert.match(sonnerSource, /lg:!right-5 lg:!top-\[calc\(env\(safe-area-inset-top\)\+5rem\)\]/);
  // Phones and tablets: index.css places the list above the dock, so nothing here may pin its top edge on those widths.
  assert.match(sonnerSource, /const compact = useIsCompactLayout\(\)/);
  assert.doesNotMatch(sonnerSource, /(?<!lg:)!top-\[/);
  assert.doesNotMatch(sonnerSource, /mobileOffset=/);
  assert.match(sonnerSource, /max-sm:!w-\[min\(250px,calc\(100vw-7\.5rem\)\)\]/);

  assert.match(radixToastSource, /left-2 right-auto top-\[max\(6px,env\(safe-area-inset-top\)\)\]/);
  assert.match(radixToastSource, /w-\[min\(250px,calc\(100%-7\.5rem\)\)\]/);
  assert.match(radixToastSource, /lg:left-auto lg:right-0 lg:top-\[calc\(env\(safe-area-inset-top\)\+5rem\)\]/);
  assert.doesNotMatch(radixToastSource, /\bsm:(?:left-auto|right-0|top-\[)/, "the desktop viewport placement must not start below the compact breakpoint");
  assert.doesNotMatch(radixToastSource, /sm:bottom-0/);
  assert.doesNotMatch(radixToastSource, /sm:slide-in-from-bottom-full/);
});
