import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

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

test("automatic recovery retries recent deployed assets once without looping", () => {
  assert.doesNotMatch(
    appSource,
    /sessionStorage\.removeItem\("station-status-hub:(?:boot-retry|chunk-retry|html-revalidated)"\)/,
  );
  assert.doesNotMatch(appSource, /pagehide/);
  assert.match(indexSource, /function retryBoot\(reason, fingerprint\)/);
  assert.match(indexSource, /const RETRY_WINDOW_MS = 30000/);
  assert.match(indexSource, /hasRecentRetry\(/);
  assert.match(indexSource, /JSON\.stringify\(\{ fingerprint: fingerprint, attemptedAt: now \}\)/);
  assert.match(boundarySource, /station-status-hub:chunk-retry/);
  assert.match(boundarySource, /CHUNK_RETRY_WINDOW_MS = 30_000/);
  assert.match(boundarySource, /hasRecentChunkRetry\(/);
  assert.match(boundarySource, /JSON\.stringify\(\{ fingerprint, attemptedAt: now \}\)/);
});

test("versioned module failures automatically load the newest deployment", () => {
  assert.match(indexSource, /addEventListener\("vite:preloadError"/);
  assert.match(indexSource, /event\.preventDefault\(\)/);
  assert.match(indexSource, /retryBoot\("vite-preload-error", fingerprint\)/);
  assert.match(
    boundarySource,
    /componentDidCatch[\s\S]{0,1000}this\.setState\(\{ retrying: true \}\);[\s\S]{0,120}replaceWithCacheBuster\(\)/,
  );
});

test("automatic recovery lock expires so later deployments can refresh again", () => {
  const functionMatch = indexSource.match(
    /(function hasRecentRetry\(value, fingerprint, now\) \{[\s\S]*?\r?\n        \})\r?\n\r?\n        function retryBoot/,
  );
  assert.ok(functionMatch, "inline retry policy must remain executable before the app bundle loads");

  const context = { RETRY_WINDOW_MS: 30_000, retryPolicy: null };
  runInNewContext(`${functionMatch[1]}\nretryPolicy = hasRecentRetry;`, context);
  const hasRecentRetry = context.retryPolicy;
  assert.equal(typeof hasRecentRetry, "function");

  const recentRetry = JSON.stringify({ fingerprint: "asset-v1", attemptedAt: 10_000 });
  assert.equal(hasRecentRetry(recentRetry, "asset-v1", 39_999), true);
  assert.equal(hasRecentRetry(recentRetry, "asset-v1", 40_000), false);
  assert.equal(hasRecentRetry(recentRetry, "asset-v2", 20_000), false);
  assert.equal(hasRecentRetry("invalid-json", "asset-v1", 20_000), false);
});
