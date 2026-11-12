import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
const root = path.resolve(import.meta.dirname, '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const require = createRequire(import.meta.url);

function definition(file) {
  let captured;
  vm.runInNewContext(read(file), { require(name) {
    if (name === 'node:assert/strict') return require(name);
    if (name.endsWith('protectedReadBrowserHarness.cjs')) return { runProtectedReadBrowser(options) { captured = options; return Promise.resolve(); } };
    if (name.endsWith('pcbRecoveryBrowser.cjs')) return { buildPcbRecoveryFixture() { throw new Error('No fixture execution in source-only checks'); } };
    if (name.endsWith('sanitizedProfilesBrowser.cjs')) return { buildSanitizedProfilesFixture() { throw new Error('No fixture execution in source-only checks'); } };
    throw new Error(`Unexpected source-only import ${name}`);
  }, console, process: { exitCode: 0 } }, { filename: file });
  return captured;
}

test('protected browser harness separates local build from authorized PR-only Chromium and records failures', () => {
  const source = read('tests/support/protectedReadBrowserHarness.cjs');
  const build = source.indexOf("process.env[buildOnly] === '1'");
  const ci = source.indexOf("assert.equal(process.env.GITHUB_ACTIONS, 'true'");
  const pr = source.indexOf("assert.equal(process.env.GITHUB_EVENT_NAME, 'pull_request'");
  const launch = source.indexOf("qa('playwright').chromium.launch()");
  assert.ok(build >= 0 && build < ci && ci < pr && pr < launch);
  for (const pattern of [/server\.listen\(0, '127\.0\.0\.1'/, /url\.origin === origin && req\.method\(\) === 'GET'/,
    /connect-src 'none'; form-action 'none'/, /Storage\.prototype\[method\] = deny/, /indexedDB\.deleteDatabase = deny/,
    /originalDocumentRetained/, /documentLoads, 1/, /documentRequests, 1/, /screenshot\('failure'\)/,
    /finally \{ report\(\); await context\.close\(\); \}/, /fullPage: false/]) assert.match(source, pattern);
  assert.ok(!source.includes("performance.getEntriesByType('navigation')"));
  assert.match(source, /already-running old bundle is not retroactively repaired/);
  assert.match(source, /not hosted Auth\/PostgREST\/Realtime proof/);
});

test('PCB protected recovery defines all added scenarios without removing the original 32 suite', () => {
  const spec = definition('tests/pcbLegacyRecovery.browser.cjs');
  assert.equal(spec.name, 'pcb-legacy-recovery'); assert.equal(spec.scenarios.length, 23);
  assert.equal(new Set(spec.scenarios.map(item => item.name)).size, 23);
  for (const name of ['protected-own-catalog-read-only', 'protected-shared-only-catalog-read-only',
    'protected-null-retains-dirty-recovery', 'protected-future-retains-dirty-recovery', 'protected-private-catalog-retains-dirty-recovery',
    'modern-helper-missing-never-enters-legacy', 'modern-empty-is-authoritative',
    'protected-old-session-completion-discarded', 'protected-old-owner-completion-never-crosses-account', 'missing-locked-save-never-falls-through']) {
    assert.ok(spec.scenarios.some(item => item.name === name), name);
  }
  assert.match(read('tests/pcbSessionRecovery.browser.cjs'), /normal-token-refresh-keeps-own-lease/);
  const services = read('tests/support/pcbRecoveryServices.js');
  assert.match(services, /Object\.keys\(args \|\| \{\}\)\.length/);
  assert.match(services, /schemaVersion: 1, ownSnapshotPresent: true, ownSnapshot: legacyOwn, sharedCatalog: catalog/);
  assert.match(services, /Direct permissions fallback is forbidden/);
  assert.match(services, /pcbOwnerStorageKey\(USER_ID\)/);
});

test('profile fixture bundles actual three consumers plus actual PCB permission guard, not replacement permission logic', () => {
  const spec = definition('tests/sanitizedProfiles.browser.cjs');
  assert.equal(spec.name, 'sanitized-profiles'); assert.equal(spec.scenarios.length, 21);
  assert.equal(new Set(spec.scenarios.map(item => item.name)).size, 21);
  for (const name of ['permissions-background-refresh-preserves-mounted-draft', 'permissions-old-actor-error-discarded',
    'admin-roster-order-filter-refresh-and-failed-read-retention', 'admin-delayed-roster-error-after-newer-refresh',
    'dialog-target-switch-delayed-load-and-retry-guard', 'dialog-old-target-completion-never-enables-new-target',
    'dialog-save-failure-cancel-and-controlled-retry-preserve-source', 'dialog-old-save-receipt-cannot-close-new-target',
    'actual-guard-unmount-storage-failure-same-owner-recovers', 'actual-guard-owner-remount-never-inherits-other-draft']) {
    assert.ok(spec.scenarios.some(item => item.name === name), name);
  }
  const builder = read('tests/support/sanitizedProfilesBrowser.cjs');
  for (const actual of ['src/hooks/usePermissions.ts', 'src/components/admin/AdminPanel.tsx', 'src/components/admin/UserPermissionsDialog.tsx',
    'src/lib/systemUserProfiles.ts', 'src/components/layout/PermissionGuard.tsx', 'src/components/pcb-designer/PcbDesignerWorkspace.tsx']) assert.ok(builder.includes(actual));
  assert.match(builder, /No live Supabase config or SDK/); assert.match(builder, /No runtime imports/);
  assert.ok(!builder.includes("'@/hooks/usePermissions',"), 'Real permission logic is never aliased');
  const fixture = read('tests/support/sanitizedProfilesFixture.jsx');
  assert.match(fixture, /<PermissionGuard module="pcb-designer"><PcbDesignerWorkspace \/><\/PermissionGuard>/);
  assert.match(builder, /createElement\('aside', \{ className: 'admin-sidebar'/, 'Excluded sidebar must retain desktop grid slot and production mobile CSS');
  assert.match(fixture, /data-mobile-workspace-main="true" className="mobile-workspace-main flex w-full min-w-0 flex-1 flex-col min-h-0 overflow-hidden"/);
  assert.match(fixture, /app-shell flex min-h-\[100dvh\] min-w-0 flex-col bg-background h-\[100dvh\] overflow-hidden/);
  const browser = read('tests/sanitizedProfiles.browser.cjs');
  assert.equal((browser.match(/await rosterLayout\(page\)/g) || []).length, 3);
  assert.equal((browser.match(/await visibleRosterHeading\(page,/g) || []).length, 3);
  assert.match(browser, /heading\.waitFor\(\{ state: 'visible' \}\)/);
  assert.match(browser, /heading\.scrollIntoViewIfNeeded\(\)/);

  const services = read('tests/support/sanitizedProfilesServices.js');
  assert.match(services, /Raw system_users read\/write forbidden/);
  assert.match(services, /Only zero-argument sanitized profile reads allowed/);
  assert.match(services, /set_user_access_permissions/);
});

test('existing permissions dialog browser fixture uses the strict sanitized read contract and keeps its assertions', () => {
  const mock = read('tests/support/permissionsDialogMock.js');
  assert.match(mock, /list_system_user_profiles/); assert.match(mock, /table !== 'user_page_permissions'/);
  assert.match(mock, /maybeSingle\(\)/); assert.match(mock, /auth_migrated_at: null/);
  const browser = read('tests/auditPermissionsDialog.browser.cjs');
  assert.ok(browser.indexOf("AUDIT_PERMISSIONS_BUILD_ONLY === '1'") < browser.indexOf('chromium.launch('));
  for (const assertion of ['no horizontal overflow', 'saveFailureDraftRetained', 'failedReadFailsClosed', 'cancelNoWrite', 'durableSavePreservesUnknownSettings']) assert.ok(browser.includes(assertion));
});

test('PR workflow independently executes both protected read suites and preserves their failure evidence', () => {
  const workflow = read('.github/workflows/audit-regression.yml');
  const blocks = workflow.split(/(?=      - name: )/);
  for (const [script, environment, directory] of [
    ['pcbLegacyRecovery.browser.cjs', 'PCB_LEGACY_EVIDENCE_DIR', 'pcb-legacy-recovery'],
    ['sanitizedProfiles.browser.cjs', 'SANITIZED_PROFILES_EVIDENCE_DIR', 'sanitized-profiles'],
  ]) {
    const steps = blocks.filter(block => block.includes(`node tests/${script}`));
    assert.equal(steps.length, 1, `${script} has one independent step`);
    const step = steps[0];
    assert.match(step, /github\.event_name == 'pull_request'/);
    assert.match(step, /!cancelled\(\) &&/);
    assert.match(step, /steps\.install-browser\.outcome == 'success'/);
    assert.ok(step.includes(`${environment}: \${{ runner.temp }}/${directory}`));
    assert.ok(step.includes(`timeout --signal=TERM --kill-after=10s 240s node tests/${script}`));
    assert.ok(!step.includes('BUILD_ONLY'), 'CI must execute Chromium, not merely build the fixture');
  }
  assert.match(workflow, /VITE_SUPABASE_URL: http:\/\/127\.0\.0\.1:54321/);
  assert.match(read('tests/support/protectedReadBrowserHarness.cjs'), /server\.listen\(0, '127\.0\.0\.1'/);
  const artifacts = blocks.find(block => block.startsWith('      - name: Preserve synthetic browser evidence'));
  assert.ok(artifacts); assert.match(artifacts, /if: always\(\)/); assert.match(artifacts, /actions\/upload-artifact@v4/);
  for (const directory of ['pcb-session-recovery', 'pcb-legacy-recovery', 'sanitized-profiles']) assert.ok(artifacts.includes(`\${{ runner.temp }}/${directory}/`));
  assert.ok(workflow.includes('240s node tests/pcbSessionRecovery.browser.cjs'), 'Original 32 PCB cases remain wired');
  for (const script of ['auditHistory', 'auditDeploymentRecovery', 'auditRichText', 'materialSeedRemoval',
    'auditPermissionsDialog', 'auditBomVersions', 'auditMobileWorkspaces', 'auditShortLandscape']) {
    assert.ok(workflow.includes(`180s node tests/${script}.browser.cjs`), `Existing browser step retained: ${script}`);
  }
});

test('phone permissions footer hides only informational copy, never failed-read recovery', () => {
  const component = read('src/components/admin/UserPermissionsDialog.tsx');
  const css = read('src/components/admin/admin-panel.css');
  assert.match(component, /data-load-retry=\{!isReading && loadedUserId !== userId \? "true" : undefined\}/);
  assert.match(css, /\.admin-permissions-footer\[data-load-retry="true"\]\s*\{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.admin-permissions-footer\[data-load-retry="true"\] > div:first-child\s*\{\s*display: block;/);
  const browser = read('tests/sanitizedProfiles.browser.cjs');
  assert.match(browser, /width: 844, height: 390/);
  assert.match(browser, /retry\.waitFor\(\{ state: 'visible' \}\)/);
  assert.match(browser, /retry\.isEnabled\(\)/);
});
