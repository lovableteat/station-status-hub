const assert = require('node:assert/strict');
const { runProtectedReadBrowser } = require('./support/protectedReadBrowserHarness.cjs');
const { buildPcbRecoveryFixture } = require('./support/pcbRecoveryBrowser.cjs');
const scenarios = [];
const ready = page => page.waitForFunction(() => pcbRecoveryFixture.state?.canEdit && pcbRecoveryFixture.state.remoteReady);
const blocked = (page, status) => page.waitForFunction(status => {
  const state = pcbRecoveryFixture.state;
  return state?.hasUnsavedChanges && !state.canEdit && !state.remoteReady && document.querySelector('[data-testid="pcb-cloud-access"]')?.getAttribute('data-status') === status;
}, status);
function assertRecoverySnapshot(recovery, data, allowSaveAttribution = false) {
  assert.equal(recovery.version, 1);
  assert.equal(recovery.savedRevision, '2026-11-12T10:00:00.000Z');
  let expected = data;
  if (allowSaveAttribution && JSON.stringify(recovery.state) !== JSON.stringify(data)) {
    // Only saveNow's exact attribution on the active project may differ. Never
    // strip fields: wrong/missing attribution or any other changed bytes fail.
    assert.ok(data.projects.some(project => project.id === data.activeProjectId));
    expected = { ...data, projects: data.projects.map(project => project.id === data.activeProjectId
      ? { ...project, lastEditedBy: 'Synthetic editor', lastEditedById: '10000000-0000-4000-8000-000000000001' }
      : project) };
  }
  assert.deepEqual(recovery.state, expected, 'Recovery retains the entire unsaved workspace, with only exact authorized save attribution');
  assert.equal(JSON.stringify(recovery.state), JSON.stringify(expected), 'All recovery content bytes outside the two exact attribution fields remain unchanged');
}
async function dirty(page, allowSaveAttribution = false) {
  await page.waitForFunction(() => pcbRecoveryFixture.state?.hasUnsavedChanges);
  const value = await page.evaluate(() => ({ state: pcbRecoveryFixture.state, storage: pcbRecoveryFixture.storageSnapshot(), key: pcbRecoveryFixture.recoveryKey }));
  assert.equal(value.state.hasUnsavedChanges, true); assert.notEqual(value.state.persistenceStatus, 'synced');
  const recovery = JSON.parse(value.storage[value.key]);
  assertRecoverySnapshot(recovery, value.state.data, allowSaveAttribution);
  assert.equal(value.storage['unrelated-synthetic-sentinel'], 'keep exact bytes\t\u0000🧪 {"partial":');
  return value.state.data;
}
const unchanged = async (page, before, allowSaveAttribution = false) => {
  const actual = await dirty(page, allowSaveAttribution);
  assert.deepEqual(actual, before, 'No legacy result may overwrite existing dirty content');
  assert.equal(JSON.stringify(actual), JSON.stringify(before), 'The complete mounted draft retains its exact content bytes');
};
const noRemoteWrites = async page => assert.equal(await page.evaluate(() => pcbRecoveryFixture.calls.some(call => /^(?:save|delete)_/.test(call.name))), false, 'Recovery never reimports, saves or deletes cloud data');
const protectedCalls = page => page.evaluate(() => pcbRecoveryFixture.calls.filter(call => call.name === 'load_pcb_designer_legacy_workspace'));
function test(name, query, run) { scenarios.push({ name, query, run }); }

for (const [mode, ownership] of [['ok', 'own'], ['absent', 'shared-only']]) test(`protected-${ownership}-catalog-read-only`, { loadMode: 'missing-rpc', legacyMode: mode }, async ({ page, screenshot }) => {
  await blocked(page, 'legacy-recovery'); const before = await dirty(page);
  assert.equal(await page.evaluate(() => pcbRecoveryFixture.state.legacyRecovery), ownership);
  const result = await page.evaluate(() => pcbRecoveryFixture.remoteClient.loadWithMetadata());
  assert.equal(result.source, 'legacy'); assert.equal(result.ownSnapshotPresent, mode === 'ok');
  assert.equal(result.state.projects.find(project => project.id === 'synthetic-shared-project')?.description, 'NEWER SHARED REVISION');
  assert.ok(!result.state.projects.some(project => project.id === 'synthetic-deleted-project'), 'Tombstone wins over older shared project');
  assert.equal(result.state.library.find(component => component.id === 'synthetic-shared-component')?.name, 'Synthetic newer shared BOM');
  assert.ok(!JSON.stringify(result).includes('OTHER PRIVATE'), 'Other-owner private fields never become a fallback');
  if (mode === 'ok') {
    const own = await page.evaluate(() => pcbRecoveryFixture.legacyOwn);
    assert.deepEqual(result.state.templates.find(template => template.id === 'own-private-template'), own.templates[0]);
    assert.deepEqual(result.state.modelAssets, own.modelAssets); assert.deepEqual(result.state.pendingPlacementsByProject, own.pendingPlacementsByProject);
    assert.equal(result.state.privateFutureField, own.privateFutureField); assert.equal(result.state.activeProjectId, own.activeProjectId);
  } else {
    assert.equal(result.state.activeProjectId, null, 'Own absence never chooses someone else’s first board');
    assert.deepEqual(result.state.modelAssets, {}); assert.deepEqual(result.state.pendingPlacementsByProject, {});
    assert.ok(!result.state.templates.some(template => !template.isBuiltIn)); assert.equal(result.state.privateFutureField, undefined);
  }
  for (const call of await protectedCalls(page)) assert.deepEqual(call.args, {}, 'Zero owner/actor parameters');
  assert.equal(await page.getByRole('button', { name: '儲存', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '匯入 JSON', exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(() => pcbRecoveryFixture.api.saveNow()), false);
  await page.keyboard.press('Control+s'); await page.getByTestId('pcb-cloud-retry').click(); await blocked(page, 'legacy-recovery');
  await unchanged(page, before, true); await screenshot('read-only');
  await noRemoteWrites(page);
  await page.evaluate(() => { pcbRecoveryFixture.controls.load = 'ok'; });
  await page.getByTestId('pcb-cloud-retry').click(); await ready(page); await unchanged(page, before, true);
  await noRemoteWrites(page);
  assert.equal(await page.evaluate(() => pcbRecoveryFixture.state.legacyRecovery), null);
});

for (const mode of ['401', '42501', 'view-denied', 'missing-rpc', 'transport', 'null', 'malformed', 'future', 'private-catalog', 'inconsistent-absence']) {
  test(`protected-${mode}-retains-dirty-recovery`, { loadMode: 'missing-rpc', legacyMode: mode }, async ({ page }) => {
    const status = ['401'].includes(mode) ? 'session-required' : ['42501', 'view-denied'].includes(mode) ? 'denied' : 'error';
    // A server 401 is classified by the production guard. Do not coerce it to empty data.
    await page.waitForFunction(() => pcbRecoveryFixture.state?.hasUnsavedChanges && !pcbRecoveryFixture.state.canEdit
      && ['error', 'denied', 'session-required'].includes(pcbRecoveryFixture.state.remoteAccessStatus));
    const actual = await page.getByTestId('pcb-cloud-access').getAttribute('data-status');
    assert.equal(actual, mode === '401' ? 'denied' : status);
    const before = await dirty(page);
    assert.equal(await page.evaluate(() => pcbRecoveryFixture.api.saveNow()), false);
    await page.getByTestId('pcb-cloud-retry').click();
    await blocked(page, actual); await unchanged(page, before, true);
    await noRemoteWrites(page);
    assert.ok((await protectedCalls(page)).length >= 1);
    assert.equal(await page.evaluate(() => pcbRecoveryFixture.state.legacyRecovery), null, 'Invalid/denied envelope is not successful recovery');
  });
}

for (const mode of ['401', '42501', 'view-denied', 'transport', 'helper-missing', 'malformed']) test(`modern-${mode}-never-enters-legacy`, { loadMode: mode }, async ({ page }) => {
  await page.waitForFunction(() => pcbRecoveryFixture.state?.hasUnsavedChanges && !pcbRecoveryFixture.state.canEdit
    && ['error', 'denied', 'session-required'].includes(pcbRecoveryFixture.state.remoteAccessStatus));
  const before = await dirty(page);
  assert.deepEqual(await protectedCalls(page), []);
  await page.getByTestId('pcb-cloud-retry').click(); await page.waitForTimeout(30);
  assert.deepEqual(await protectedCalls(page), []); await unchanged(page, before);
});

for (const mode of ['empty', 'ok']) test(`modern-${mode}-is-authoritative`, { loadMode: mode }, async ({ page }) => {
  await ready(page); const before = await dirty(page);
  assert.deepEqual(await protectedCalls(page), []);
  const result = await page.evaluate(() => pcbRecoveryFixture.remoteClient.loadWithMetadata());
  assert.equal(result.source, 'modern');
  if (mode === 'empty') assert.equal(result.state, null);
  await unchanged(page, before); assert.deepEqual(await protectedCalls(page), []);
});

test('protected-old-session-completion-discarded', { scenario: 'missing' }, async ({ page }) => {
  await blocked(page, 'session-required'); const before = await dirty(page);
  await page.evaluate(() => { pcbRecoveryFixture.controls.load = 'missing-rpc'; pcbRecoveryFixture.controls.legacy = 'hold'; pcbRecoveryFixture.renewSession('SIGNED_IN'); });
  await page.waitForFunction(() => pcbRecoveryFixture.held.some(item => item.kind === 'legacy'));
  await page.evaluate(() => { pcbRecoveryFixture.expireSession(); pcbRecoveryFixture.controls.load = 'ok'; });
  await blocked(page, 'session-required');
  await page.evaluate(() => pcbRecoveryFixture.renewSession('SIGNED_IN')); await ready(page);
  await page.evaluate(() => pcbRecoveryFixture.resolveHeld('legacy')); await page.waitForTimeout(30);
  await ready(page); await unchanged(page, before);
  assert.equal(await page.evaluate(() => pcbRecoveryFixture.state.legacyRecovery), null);
});

test('protected-old-owner-completion-never-crosses-account', { scenario: 'missing' }, async ({ page }) => {
  await blocked(page, 'session-required'); const before = await dirty(page);
  await page.evaluate(() => { pcbRecoveryFixture.controls.load = 'missing-rpc'; pcbRecoveryFixture.controls.legacy = 'hold'; pcbRecoveryFixture.renewSession('SIGNED_IN'); });
  await page.waitForFunction(() => pcbRecoveryFixture.held.some(item => item.kind === 'legacy'));
  await page.evaluate(() => pcbRecoveryFixture.switchActor());
  await page.waitForFunction(() => pcbRecoveryFixture.state.ownerChanged && !pcbRecoveryFixture.state.canEdit);
  const afterSwitch = await page.evaluate(() => pcbRecoveryFixture.calls.length);
  await page.evaluate(() => pcbRecoveryFixture.resolveHeld('legacy')); await page.waitForTimeout(30);
  await unchanged(page, before);
  assert.equal(await page.evaluate(() => pcbRecoveryFixture.calls.length), afterSwitch, 'Old completion cannot issue loads or lock requests under the new owner');
  assert.ok(!(await page.evaluate(() => pcbRecoveryFixture.storageWrites)).some(write => write.key.includes('10000000-0000-4000-8000-000000000002')));
});

test('missing-locked-save-never-falls-through', {}, async ({ page }) => {
  await ready(page); const before = await dirty(page);
  await page.evaluate(() => { pcbRecoveryFixture.controls.save = 'missing-rpc'; });
  await page.getByRole('button', { name: '儲存', exact: true }).click();
  await page.waitForFunction(() => pcbRecoveryFixture.toasts.some(toast => toast.title.includes('失敗')));
  const calls = await page.evaluate(() => pcbRecoveryFixture.calls.filter(call => call.name.startsWith('save_')));
  assert.deepEqual(calls.map(call => call.name), ['save_pcb_designer_workspace_locked']);
  // A failed locked save retains the full draft/recovery and never claims success.
  await unchanged(page, before, true);
});

runProtectedReadBrowser({ build: buildPcbRecoveryFixture, buildOnly: 'PCB_LEGACY_BUILD_ONLY', evidenceEnv: 'PCB_LEGACY_EVIDENCE_DIR', name: 'pcb-legacy-recovery', scenarios,
  limits: ['Actual PCB UI, hooks and remote adapter, with synthetic actor-bound RPC envelopes; database filtering itself is verified separately.',
    'CAD/STEP/3D and presence transport are not exercised.'],
  async inspect(page) {
    const result = await page.evaluate(() => ({ permissionsReads: pcbRecoveryFixture.permissionsReads, destructiveWrites: pcbRecoveryFixture.destructiveWrites,
      authMutations: pcbRecoveryFixture.authMutations, rpcNames: pcbRecoveryFixture.calls.map(call => call.name),
      hasUnsavedChanges: pcbRecoveryFixture.state.hasUnsavedChanges, recoveryPresent: Boolean(pcbRecoveryFixture.storageSnapshot()[pcbRecoveryFixture.recoveryKey]) }));
    assert.equal(result.permissionsReads, 0); assert.deepEqual(result.destructiveWrites, []); assert.deepEqual(result.authMutations, []);
    assert.ok(!result.rpcNames.includes('load_pcb_designer_workspace'), 'No old unprotected load fallback');
    assert.ok(!result.rpcNames.includes('save_pcb_designer_workspace') && !result.rpcNames.includes('save_pcb_designer_workspace_shared'));
    assert.equal(result.hasUnsavedChanges, true); assert.equal(result.recoveryPresent, true); return result;
  },
}).catch(error => { console.error(error); process.exitCode = 1; });
