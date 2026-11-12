import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = file => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');

test('PCB browser runner is CI-only, loopback-only and preserves failure evidence', async () => {
  const source = await read('tests/pcbSessionRecovery.browser.cjs');
  const buildOnly = source.indexOf("process.env.PCB_RECOVERY_BUILD_ONLY === '1'");
  const ciOnly = source.indexOf("assert.equal(process.env.GITHUB_ACTIONS, 'true'");
  const prOnly = source.indexOf("assert.equal(process.env.GITHUB_EVENT_NAME, 'pull_request'");
  const launch = source.indexOf("qa('playwright').chromium.launch()");
  assert.ok(buildOnly >= 0 && buildOnly < ciOnly && ciOnly < prOnly && prOnly < launch,
    'Local build exits before the explicit GitHub PR browser gates');
  assert.match(source, /server\.listen\(0, '127\.0\.0\.1'/);
  assert.match(source, /url\.origin === origin && request\.method\(\) === 'GET'/);
  assert.match(source, /connect-src 'none'; form-action 'none'/);
  assert.match(source, /Storage\.prototype\[method\] = deny/);
  assert.match(source, /result\.status = 'failed'/);
  assert.match(source, /screenshot\('failure'\)/);
  assert.match(source, /finally \{ report\(\); await context\.close\(\); \}/);
  for (const scenario of ['missing', 'expired', 'rpc401', 'rpc42501', 'empty-cloud-keeps-dirty-recovery',
    'save-denial-keeps-recovery', 'denied-lock-never-unlocks', 'stale-load-after-new-session',
    'stale-denial-after-new-session', 'stale-save-keeps-newer-draft', 'own-client-lease-renew-release',
    'dialog-cancel-and-history', 'normal-token-refresh-keeps-own-lease',
    'actor-switch-preserves-original-owner']) assert.ok(source.includes(`'${scenario}'`), scenario);
  assert.match(source, /renewSession\('SIGNED_IN'\)/, 'Actual session invalidation, not routine token refresh, fences stale-response tests');
  assert.match(source, /Routine same-actor TOKEN_REFRESHED triggers no release, acquire, load or other RPC/);
  assert.match(source, /Original owner recovery bytes remain exactly intact/);
  assert.match(source, /No write is attempted in the new-owner namespace/);
  assert.match(source, /width: 1280, height: 800/);
  assert.match(source, /width: 390, height: 844/);
});

test('PCB fixture observes the real workspace and keeps production services out of its bundle', async () => {
  const [builder, probe, fixture, services] = await Promise.all([
    read('tests/support/pcbRecoveryBrowser.cjs'), read('tests/support/pcbRecoveryWorkspaceProbe.jsx'),
    read('tests/support/pcbRecoveryFixture.jsx'), read('tests/support/pcbRecoveryServices.js'),
  ]);
  assert.match(fixture, /import \{ PcbDesignerWorkspace \} from '..\/..\/src\/components\/pcb-designer\/PcbDesignerWorkspace\.tsx'/);
  assert.match(probe, /usePcbWorkspace as useRealWorkspace/);
  assert.match(probe, /useRealWorkspace\(\{ \.\.\.options, storage: fixture\.storage, recoveryClientId: RECOVERY_CLIENT_ID \}\)/);
  for (const source of ['PcbDesignerWorkspace.tsx', 'PcbCanvas.tsx', 'PcbToolbar.tsx', 'PcbDialogs.tsx',
    'usePcbWorkspace.ts', 'usePcbPersistence.ts', 'usePcbProjectLock.ts', 'usePcbRemoteAccess.ts',
    'accountRemoteSync.ts', 'remoteAccess.ts', 'remoteSync.ts', 'storage.ts']) assert.ok(builder.includes(source), source);
  assert.match(builder, /No Supabase SDK\/network implementation enters the fixture/);
  assert.match(builder, /The entire fixture is self-contained with no runtime imports/);
  assert.match(services, /Direct permissions fallback is forbidden/);
  assert.match(services, /Synthetic fixture forbids destructive storage writes/);
  assert.match(services, /isPcbSaveState\(seed\)/);
  assert.match(services, /useSyncExternalStore\(subscribeUser, getUser, getUser\)/,
    'Account-switch browser scenario rerenders the actual mounted workspace through a reactive user provider boundary');
  assert.match(services, /switchActor\(\)/);
});

test('authorized PR workflow executes PCB browser contracts and retains synthetic artifacts', async () => {
  const workflow = await read('.github/workflows/audit-regression.yml');
  assert.match(workflow, /github\.event_name == 'pull_request'/);
  assert.match(workflow, /node tests\/pcbSessionRecovery\.browser\.cjs/);
  assert.match(workflow, /PCB_RECOVERY_EVIDENCE_DIR:/);
  assert.match(workflow, /\$\{\{ runner\.temp \}\}\/pcb-session-recovery\//);
});
