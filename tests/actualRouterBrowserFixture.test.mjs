// Build only. Real Chromium runs in the bounded isolated CI browser step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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


test('actual Router fixture keeps spacing inside the full-width body without hiding overflow', () => {
  const source = readFileSync(new URL('./support/actualRouterBrowser.cjs', import.meta.url), 'utf8');
  const style = source.match(/<style>([^]*?)<\/style>/)?.[1];
  assert.ok(style, 'The actual served fixture stylesheet is inspected');
  const css = require('postcss').parse(style);
  const body = css.nodes.find(rule => rule.selector === 'body');
  assert.ok(body);
  const declarations = Object.fromEntries(body.nodes.map(node => [node.prop, node.value]));
  assert.equal(declarations.margin, '0', 'A margin must not enlarge the app full-width body');
  assert.equal(declarations.padding, '16px', 'Keep readable spacing inside the body');
  assert.equal(declarations['box-sizing'], 'border-box', 'Padding stays within width:100%');
  css.walkDecls(declaration => {
    assert.doesNotMatch(declaration.prop, /^overflow/, 'Fixture CSS must not mask width failures by clipping');
  });
});
