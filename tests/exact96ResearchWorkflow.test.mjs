import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const workflow = read('.github/workflows/exact96-crossrelease.yml');
const browser = read('tests/exact96/exact96-crossrelease.browser.cjs');
const manifestText = read('tests/exact96/exact96-manifest.json');
const manifest = JSON.parse(manifestText);

test('exact-old research is restricted to this same-repository PR, without deploy or production secrets', () => {
  assert.match(workflow, /pull_request:\n\s+branches: \[main\]/);
  assert.match(workflow, /github\.event\.pull_request\.number == 49/);
  assert.ok(workflow.includes("github.event.pull_request.head.ref == 'fix/legacy-pcb-protected-reads-20261112'"));
  assert.match(workflow, /head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /contents: read\n\s+actions: read/);
  assert.doesNotMatch(workflow, /secrets\.|(?:pages|contents|id-token): write|actions\/deploy|supabase\s+(?:db|functions)|pull_request_target:|workflow_dispatch:|continue-on-error:/);
  assert.match(workflow, /timeout --signal=TERM --kill-after=10s 300s node tests\/exact96\/exact96-crossrelease\.browser\.cjs/);
  assert.ok(workflow.includes('ref: '+manifest.candidateCommit));
  assert.ok(workflow.includes('working-directory: .exact96-candidate'));
  assert.ok(workflow.includes('cmp package-lock.json .exact96-candidate/package-lock.json'));
  assert.ok(workflow.includes('EXACT96_CANDIDATE_DIST: ${{ github.workspace }}/.exact96-candidate/dist'));

});
test('only the pinned original artifact and candidate hashes are accepted; source bytes are never uploaded', () => {
  assert.equal(createHash('sha256').update(manifestText).digest('hex'), 'd82671ae9fb3da32229d9372416fa753719973f033e005331000b88bdf307d53');
  assert.equal(manifest.candidateCommit, '34419778a95132a3ee73251bbde8b4327b6cd493');
  assert.equal(Object.keys(manifest.candidateFiles).length, 334);
  assert.equal(Object.keys(manifest.oldAllowedBoot).length, 53);
  assert.equal(manifest.postCutoverExtra.length, 3);
  assert.ok(workflow.includes(`actions/artifacts/${manifest.sourceArtifact}/zip`));
  const extract = read('tests/exact96/extract-exact96.py');
  assert.ok(extract.indexOf("manifest['sourceArtifactSha256']") < extract.indexOf('tarfile.open'));
  assert.match(extract, /member\.isfile\(\) and name not in found/);
  const paths = workflow.split('          path: |\n')[1].trim().split('\n').map(line => line.trim());
  assert.deepEqual(paths, ['${{ runner.temp }}/exact96-evidence/report.json', '${{ runner.temp }}/exact96-evidence/*.png']);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /retention-days: 3/);
  assert.doesNotMatch(workflow, /--location-trusted|upload-pages-artifact/);
  assert.deepEqual(readdirSync(new URL('./exact96/', import.meta.url)).sort(), ['build-exact-candidate.mjs','exact96-crossrelease.browser.cjs','exact96-fixtures.cjs','exact96-manifest.json','exact96-server.cjs','exact96-server.test.cjs','extract-exact96.py']);
});
test('research browser launch keeps CI-only authorization and a non-forwarding transport backstop', () => {
  const build = browser.indexOf("process.env.EXACT96_BUILD_ONLY==='1'");
  const ci = browser.indexOf("assert.equal(process.env.GITHUB_ACTIONS,'true'");
  const pr = browser.indexOf("assert.equal(process.env.GITHUB_EVENT_NAME,'pull_request'");
  const launch = browser.indexOf("qa('playwright').chromium.launch");
  assert.ok(build >= 0 && build < ci && ci < pr && pr < launch);
  for (const part of ['--proxy-server=http://127.0.0.1:', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', "serviceWorkers:'block'", "h.context.route('**/*'", "h.context.routeWebSocket('**/*'", 'fixture.realtimeResponse(value)', "reply.kind==='forbidden'"]) assert.ok(browser.includes(part), part);
  assert.doesNotMatch(browser, /\.connectToServer\s*\(/);
  assert.ok(browser.includes("u.origin===h.origin&&req.method()==='GET'"));
});
test('success and failure evidence are sanitized and never include old source or request credentials', () => {
  assert.ok(browser.includes('JSON.stringify(sanitizeEvidence(report),null,2)'));
  assert.ok(browser.includes('console.error(redactEvidence(error?.stack||error))'));
  assert.ok(browser.includes('h.errors.push(redactEvidence(e.message))'));
  assert.ok(browser.includes('h.logs.push(redactEvidence(e.text()))'));
  assert.doesNotMatch(browser, /recordHar|tracing\.start|storageState\(|headers:.*req\.headers\(\).*h\.calls/);
});
test('warm module, completed refresh and pending PNG byte assertions cannot be replaced by a cache or filename claim', () => {
  for (const part of ['Cache-Control', 'no-store']) assert.ok(read('tests/exact96/exact96-server.cjs').includes(part));
  for (const part of ['Original response observed before probe', 'original evaluated ESM module map, not HTTP cache', "h.page.evaluateHandle(()=>document)", 'await(await refreshed).finished()', "crypto.subtle.digest('SHA-256',bytes)", 'sha256:sha(syntheticPng)', 'assert.deepEqual(await maintenanceSnapshot(h.page),before)']) assert.ok(browser.includes(part), part);
  assert.doesNotMatch(browser, /waitForTimeout\(100\)/);
  assert.ok(browser.includes('Expected negative characterization of old client; a passing observation is NOT a safe permission cutover'));
  assert.ok(browser.includes('unsentDraftSurvived='));
});
