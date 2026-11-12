import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const require = createRequire(import.meta.url);
// Pure result validation only: never invoke the runner, create a server or launch a browser.
const { assertCompletedBrowserCases } = require('./support/protectedReadBrowserHarness.cjs');
const result = (name, status, width = 1280) => ({ name, status, viewport: { width } });

test('browser result aggregation requires every desktop and mobile case to pass', () => {
  assert.doesNotThrow(() => assertCompletedBrowserCases([result('first', 'passed'), result('first', 'passed', 390)], 2));
  assert.throws(() => assertCompletedBrowserCases([result('first', 'passed')], 2), /Every configured browser case must finish/);
  assert.throws(() => assertCompletedBrowserCases([], 2), /Every configured browser case must finish/);
});

test('a later pass cannot hide failed or unfinished browser cases', () => {
  for (const state of ['failed', 'running', 'skipped']) {
    assert.throws(() => assertCompletedBrowserCases([result('first', state), result('later', 'passed', 390)], 2), /Browser cases did not pass/);
  }
});

test('case failures retain artifacts and fresh-context cleanup before mandatory final aggregation', () => {
  const source = readFileSync(new URL('./support/protectedReadBrowserHarness.cjs', import.meta.url), 'utf8');
  const failure = source.slice(source.indexOf("result.status = 'failed';"), source.indexOf('assertCompletedBrowserCases(summary.results'));
  assert.match(failure, /screenshot\('failure'\)/);
  assert.match(failure, /finally \{ report\(\); await context\.close\(\); \}/);
  assert.doesNotMatch(failure, /throw error/);
  assert.ok(source.indexOf('assertCompletedBrowserCases(summary.results, scenarios.length * 2)') < source.indexOf("summary.status = 'passed'"));
});
