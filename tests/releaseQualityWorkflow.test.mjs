import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const pages = read('.github/workflows/main.yml');
const quality = read('.github/workflows/audit-on-main.yml');
const regression = read('.github/workflows/audit-regression.yml');

test('Pages waits for the same-commit quality gate before building and deploying main', () => {
  assert.match(pages, /quality:\n\s+uses: \.\/\.github\/workflows\/audit-on-main\.yml/);
  assert.match(pages, /build:\n\s+needs: quality\n\s+if: github\.ref == 'refs\/heads\/main'/);
  assert.match(pages, /deploy:\n\s+needs: build/);
  assert.match(quality, /workflow_call:/);
  assert.match(quality, /pull_request:\n\s+branches: \[main\]/);
  assert.doesNotMatch(quality, /continue-on-error:/);
});

test('release checks include lint, types, all unit contracts and severe dependency advisories', () => {
  for (const command of ['npm run lint', 'npm run typecheck', 'npm test', 'node scripts/audit-dependencies.mjs']) {
    assert.ok(quality.includes(`run: ${command}\n`), `missing required command: ${command}`);
  }
  assert.match(quality, /node tests\/anonymousExposure\.integration\.mjs/);
  assert.ok(quality.includes('PGLITE_MODULE="$AUDIT_QA_DIR/node_modules/@electric-sql/pglite/dist/index.js" node --test tests/remainingSecurity.postgres.mjs'));
  assert.match(quality, /tests\/securityProposalCutover\.postgres\.mjs/);
  assert.match(quality, /node --test tests\/audit\*\.integration\.cjs/);
});

test('release and QA use Node 24 and the committed lockfile, with isolated QA credentials', () => {
  for (const workflow of [pages, quality]) {
    assert.match(workflow, /node-version: 24/);
    assert.match(workflow, /npm ci --legacy-peer-deps/);
    assert.doesNotMatch(workflow, /npm install --legacy-peer-deps/);
  }
  assert.match(quality, /VITE_SUPABASE_URL: http:\/\/127\.0\.0\.1:54321/);
  assert.match(quality, /VITE_SUPABASE_ANON_KEY: isolated-test-key/);
  assert.doesNotMatch(quality, /\$\{\{[^}]*secrets\./);
});

test('isolated render dependencies are installed before the full unit suite', () => {
  const configure = quality.indexOf('name: Set isolated QA directory');
  const install = quality.indexOf('name: Install isolated QA dependencies');
  const unit = quality.indexOf('run: npm test');
  assert.ok(configure >= 0 && configure < install && install < unit);
});

test('browser regression uses a runner supported by its pinned Playwright release', () => {
  assert.match(regression, /runs-on: ubuntu-24\.04/);
  assert.match(regression, /playwright@1\.58\.2/);
  assert.doesNotMatch(regression, /runs-on: ubuntu-latest/);
  assert.match(regression, /AUDIT_SCREENSHOT_PATH: \$\{\{ runner\.temp \}\}\/private-richtext\.png/);
  assert.match(regression, /name: isolated-browser-evidence/);
  assert.match(regression, /retention-days: 3/);
  assert.match(regression, /tests\/edge\/dailyStats\.synthetic\.ts/);
  assert.match(regression, /deno run --cached-only --frozen/);
  assert.match(regression, /--allow-net=127\.0\.0\.1:54322,127\.0\.0\.1:8000/);
});

test('draft-PR checks remain isolated from production deployment and credentials', () => {
  for (const workflow of [quality, regression]) {
    assert.match(workflow, /permissions:\n\s+contents: read/);
    assert.match(workflow, /VITE_SUPABASE_URL: http:\/\/127\.0\.0\.1:54321/);
    assert.doesNotMatch(workflow, /\$\{\{[^}]*secrets(?:\.|\[)/);
    assert.doesNotMatch(workflow, /actions\/deploy-pages|supabase\s+(?:db\s+push|functions\s+deploy|migration\s+up)|gh\s+pr\s+merge/);
  }
  assert.doesNotMatch(pages, /pull_request(?:_target)?:/);
  assert.doesNotMatch(read('.github/workflows/keep_alive.yml'), /(?:push|pull_request(?:_target)?):/);
  assert.match(regression, /node tests\/auditRichText\.browser\.cjs/);
  assert.match(regression, /node tests\/materialSeedRemoval\.browser\.cjs/);
  assert.match(regression, /node tests\/auditDeploymentRecovery\.browser\.cjs/);
  assert.match(regression, /AUDIT_DEPLOYMENT_EVIDENCE_DIR: \$\{\{ runner\.temp \}\}\/deployment-recovery/);
  assert.match(regression, /curl --fail --silent http:\/\/127\.0\.0\.1:8106\//);
  assert.doesNotMatch(regression, /continue-on-error:/);
  assert.equal((regression.match(/!cancelled\(\) && steps\.install-browser\.outcome == 'success'/g) || []).length, 8, 'independent browser checks continue after earlier failures without hiding the failed job');
  assert.equal((regression.match(/timeout --signal=TERM --kill-after=10s 180s node tests\//g) || []).length, 8, 'a browser fixture cannot leave later independent checks waiting on a leaked process');
  assert.match(read('tests/auditMobileWorkspaces.browser.cjs'), /spawn\(process\.execPath, \[path\.resolve\('node_modules\/vite\/bin\/vite\.js'\)/);
});

// 2026-11-18: GHSA-fc5q-39xc-vjpf covers every picomatch release with no fix; the owner allowed that one advisory only.
test('the dependency gate fails on every high or critical advisory except a dated, named exception', async () => {
  const { ADVISORY_EXCEPTIONS, findBlockingAdvisories } = await import('../scripts/audit-dependencies.mjs');
  assert.deepEqual(ADVISORY_EXCEPTIONS.map((item) => [item.id, item.package]), [['GHSA-fc5q-39xc-vjpf', 'picomatch']]);
  for (const item of ADVISORY_EXCEPTIONS) assert.ok(Date.parse(item.until) <= Date.parse('2026-12-31'), `${item.id} is reviewed by the end of 2026`);
  const advisory = (id, severity = 'high') => ({ source: 1, name: 'x', title: 't', url: `https://github.com/advisories/${id}`, severity, range: '*' });
  const report = { vulnerabilities: {
    picomatch: { severity: 'high', via: [advisory('GHSA-fc5q-39xc-vjpf')] },
    vite: { severity: 'high', via: ['picomatch'] },
    lodash: { severity: 'critical', via: [advisory('GHSA-aaaa-bbbb-cccc', 'critical')] },
    minimist: { severity: 'moderate', via: [advisory('GHSA-dddd-eeee-ffff', 'moderate')] },
  } };
  const today = new Date('2026-11-18T00:00:00Z');
  const { blocking, excepted } = findBlockingAdvisories(report, ADVISORY_EXCEPTIONS, today);
  assert.deepEqual(blocking.map((item) => item.id), ['GHSA-aaaa-bbbb-cccc']);
  assert.deepEqual(excepted.map((item) => item.id), ['GHSA-fc5q-39xc-vjpf']);
  // The same advisory on another package, or after the review date, blocks again.
  assert.equal(findBlockingAdvisories({ vulnerabilities: { other: { via: [advisory('GHSA-fc5q-39xc-vjpf')] } } }, ADVISORY_EXCEPTIONS, today).blocking.length, 1);
  assert.equal(findBlockingAdvisories(report, ADVISORY_EXCEPTIONS, new Date('2027-01-01T00:00:00Z')).blocking.length, 2);
  const quality = read('.github/workflows/audit-on-main.yml');
  assert.doesNotMatch(quality, /npm audit --audit-level/, 'the gate runs through the script so the exception list is the only way through');
});
