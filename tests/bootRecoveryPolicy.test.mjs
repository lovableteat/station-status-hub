import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [indexSource, appSource, boundarySource] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(
    new URL("../src/components/common/AppRuntimeBoundary.tsx", import.meta.url),
    "utf8",
  ),
]);

test("slow mobile startup never triggers a cache-busting reload loop", () => {
  assert.doesNotMatch(indexSource, /station-status-hub:html-revalidated/);
  assert.doesNotMatch(indexSource, /empty-root-after-load/);
  assert.doesNotMatch(indexSource, /retryBoot\("runtime-error-before-mount"\)/);
  assert.doesNotMatch(indexSource, /retryBoot\("unhandled-rejection-before-mount"\)/);
  assert.match(indexSource, /retryBoot\("asset-load-error", target\.src\)/);
  assert.match(indexSource, /renderFallbackMessage\(true\)/);
});

test("automatic recovery retries each deployed asset once without looping", () => {
  assert.doesNotMatch(
    appSource,
    /sessionStorage\.removeItem\("station-status-hub:(?:boot-retry|chunk-retry|html-revalidated)"\)/,
  );
  assert.doesNotMatch(appSource, /pagehide/);
  assert.match(indexSource, /function retryBoot\(reason, fingerprint\)/);
  assert.match(indexSource, /getItem\(RETRY_KEY\) === fingerprint/);
  assert.match(indexSource, /setItem\(RETRY_KEY, fingerprint\)/);
  assert.match(boundarySource, /station-status-hub:chunk-retry/);
  assert.match(boundarySource, /getItem\(CHUNK_RETRY_KEY\) === fingerprint/);
  assert.match(boundarySource, /setItem\(CHUNK_RETRY_KEY, fingerprint\)/);
});
