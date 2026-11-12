// Build only. Real Chromium runs in the bounded isolated CI browser step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildActualRouterFixture } = require('./support/actualRouterBrowser.cjs');

test('actual Router browser fixture keeps real runtime sources, external dynamic imports, isolated providers and app CSS', async () => {
  // The builder checks the esbuild graph and exact dynamic-import boundaries.
  const bundle = await buildActualRouterFixture();
  assert.match(bundle.javascript, /function PreparedRoutes\(/);
  assert.match(bundle.javascript, /useTransitions: false/);
  assert.match(bundle.javascript, /workspace-before-navigate/);
  assert.match(bundle.css, /--background:/);
  assert.doesNotMatch(bundle.css, /@tailwind\s/);
});
