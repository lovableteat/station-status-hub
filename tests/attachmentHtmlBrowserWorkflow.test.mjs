import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('private HTML browser coverage runs only in authorized PR CI and retains failed evidence', () => {
  const workflow = read('.github/workflows/audit-regression.yml');
  const blocks = workflow.split(/(?=      - name: )/);
  const matches = blocks.filter(block => block.includes('node tests/attachmentHtmlUrls.browser.cjs'));
  assert.equal(matches.length, 1);
  const step = matches[0];
  assert.ok(step.includes("!cancelled() && github.event_name == 'pull_request' && steps.install-browser.outcome == 'success'"));
  assert.ok(step.includes('timeout --signal=TERM --kill-after=10s 120s node tests/attachmentHtmlUrls.browser.cjs'));
  assert.ok(step.includes('ATTACHMENT_HTML_EVIDENCE_DIR: ${{ runner.temp }}/attachment-html-urls'));
  assert.ok(!step.includes('BUILD_ONLY'));
  const artifact = blocks.find(block => block.startsWith('      - name: Preserve synthetic browser evidence'));
  assert.ok(artifact.includes('if: always()'));
  assert.ok(artifact.includes('${{ runner.temp }}/attachment-html-urls/'));
  assert.ok(!step.includes('continue-on-error'));
});

test('attachment HTML browser runner separates build-only from launch and measures forbidden effects', () => {
  const source = read('tests/attachmentHtmlUrls.browser.cjs');
  const build = source.indexOf("process.env.AUDIT_BUILD_ONLY==='1'");
  const ci = source.indexOf("assert.equal(process.env.GITHUB_ACTIONS,'true'");
  const pr = source.indexOf("assert.equal(process.env.GITHUB_EVENT_NAME,'pull_request'");
  const launch = source.indexOf("qa('playwright')");
  assert.ok(build >= 0 && build < ci && ci < pr && pr < launch);
  assert.ok(source.indexOf("await page.route('**/*'") < source.indexOf('await page.goto('));
  for (const marker of ["route.abort()", "Storage.prototype[method]", "indexedDB.open=", "assert.deepEqual(persistenceOperations,[])", "assert.equal(await page.evaluate(()=>window.original),initial)", "results.json", "status:'failed'", 'process.exitCode=1']) {
    assert.ok(source.includes(marker), marker);
  }
});
