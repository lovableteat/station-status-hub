const assert = require('node:assert/strict');
const { runProtectedReadBrowser } = require('./support/protectedReadBrowserHarness.cjs');
const { buildSanitizedProfilesFixture } = require('./support/sanitizedProfilesBrowser.cjs');
const OWNER = '10000000-0000-4000-8000-000000000001';
const TARGET = '10000000-0000-4000-8000-000000000002';
const SECOND = '10000000-0000-4000-8000-000000000003';
const errors = [/Failed to load current database permissions:/, /Failed to load user permissions:/];
const loaded = page => page.waitForFunction(() => sanitizedProfilesFixture.state && !sanitizedProfilesFixture.state.loading);
const event = (page, id) => page.evaluate(id => window.dispatchEvent(new CustomEvent('station-permissions-updated', { detail: { userId: id } })), id);
const save = page => page.getByRole('button', { name: '儲存權限', exact: true });
const dialogReady = page => page.waitForFunction(() => { const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === '儲存權限'); return button && !button.disabled; });
async function rosterLayout(page) {
  const geometry = await page.locator('.admin-content').evaluate(element => {
    const box = element.getBoundingClientRect(), main = element.closest('main').getBoundingClientRect();
    return { width: box.width, height: box.height, x: box.x, right: box.right, mainWidth: main.width,
      overflow: getComputedStyle(element).overflowY, viewport: innerWidth };
  });
  assert.ok(geometry.mainWidth >= geometry.viewport - 2, 'Real full-width app main');
  assert.ok(geometry.width > geometry.viewport * (geometry.viewport > 1180 ? 0.65 : 0.85), 'Roster occupies content track, never the sidebar slot');
  assert.ok(geometry.height > 100 && geometry.x >= 0 && geometry.right <= geometry.viewport + 1, 'Bounded responsive roster');
  assert.equal(geometry.overflow, 'auto', 'Actual admin-content remains the scroller');
}
async function visibleRosterHeading(page, name) {
  const heading = page.getByRole('heading', { name, exact: true });
  await heading.waitFor({ state: 'visible' });
  await heading.scrollIntoViewIfNeeded();
  assert.equal(await heading.isVisible(), true);
  assert.ok(await heading.evaluate(element => {
    const box = element.getBoundingClientRect(), clip = element.closest('.admin-content').getBoundingClientRect();
    return box.width > 0 && box.height > 0 && box.right > clip.left && box.left < clip.right && box.bottom > clip.top && box.top < clip.bottom;
  }), 'Updated roster heading is visible inside the real scroll container');
}
const scenarios = [];
function test(name, surface, run, expectedConsoleErrors = []) { scenarios.push({ name, query: { surface }, run, expectedConsoleErrors }); }

test('permissions-stored-precedence-and-read-only-profile', 'permissions', async ({ page }) => {
  await loaded(page);
  const state = await page.evaluate(() => sanitizedProfilesFixture.state);
  assert.equal(state.canEdit, true); assert.equal(state.isAdmin, false); assert.equal(state.canEditUsers, false);
  assert.ok(!state.permissions.includes('admin_edit'), 'Legacy page rows cannot override authoritative stored permissions');
  await page.evaluate(() => { sanitizedProfilesFixture.pageMode = 'error'; });
  await event(page, OWNER); await page.waitForTimeout(30); await loaded(page);
  assert.equal(await page.evaluate(() => sanitizedProfilesFixture.state.canEdit), true, 'Authoritative stored settings tolerate unavailable legacy page table');
});

test('permissions-background-refresh-preserves-mounted-draft', 'permissions', async ({ page }) => {
  await loaded(page); const value = await page.getByTestId('profile-draft').inputValue();
  await page.evaluate(() => { sanitizedProfilesFixture.modes[sanitizedProfilesFixture.owner] = 'hold'; sanitizedProfilesFixture.renders.length = 0; });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => sanitizedProfilesFixture.held.length > 0);
  assert.equal(await page.getByTestId('profile-draft').inputValue(), value);
  assert.equal(await page.evaluate(() => sanitizedProfilesFixture.renders.some(state => state.loading)), false, 'Background profile refresh never enters initial-loading gate');
  await page.evaluate(() => { sanitizedProfilesFixture.modes[sanitizedProfilesFixture.owner] = 'ok'; sanitizedProfilesFixture.resolveHeld(sanitizedProfilesFixture.owner); });
  for (const trigger of ['online', 'visibilitychange', 'event', 'interval', 'realtime', 'subscribed']) {
    const before = await page.evaluate(() => sanitizedProfilesFixture.calls.filter(call => call.type === 'profiles').length);
    if (trigger === 'interval') await page.clock.runFor(30_001);
    else await page.evaluate(trigger => {
      if (trigger === 'event') window.dispatchEvent(new CustomEvent('station-permissions-updated', { detail: {} }));
      else if (trigger === 'visibilitychange') document.dispatchEvent(new Event(trigger));
      else if (trigger === 'realtime') sanitizedProfilesFixture.emitRealtime();
      else if (trigger === 'subscribed') sanitizedProfilesFixture.emitRealtime('system_users', 'SUBSCRIBED');
      else window.dispatchEvent(new Event(trigger));
    }, trigger);
    await page.waitForFunction(before => sanitizedProfilesFixture.calls.filter(call => call.type === 'profiles').length > before, before);
  }
  assert.equal(await page.getByTestId('profile-draft').inputValue(), value);
  assert.deepEqual(await page.evaluate(() => [sanitizedProfilesFixture.mountCount, sanitizedProfilesFixture.unmountCount]), [1, 0]);
});

for (const completion of ['ok', 'error']) test(`permissions-old-actor-${completion}-discarded`, 'permissions', async ({ page }) => {
  await loaded(page);
  await page.evaluate(() => { sanitizedProfilesFixture.modes[sanitizedProfilesFixture.owner] = 'hold'; });
  await event(page, OWNER); await page.waitForFunction(() => sanitizedProfilesFixture.held.length > 0);
  await page.evaluate(() => sanitizedProfilesFixture.switchUser());
  await page.waitForFunction(() => !sanitizedProfilesFixture.state.loading && !sanitizedProfilesFixture.state.canView);
  await page.evaluate(mode => sanitizedProfilesFixture.resolveHeld(sanitizedProfilesFixture.owner, mode), completion);
  await page.waitForTimeout(30);
  assert.equal(await page.evaluate(() => sanitizedProfilesFixture.state.canEdit), false);
  assert.equal(await page.evaluate(() => sanitizedProfilesFixture.state.isAdmin), false);
  assert.deepEqual(await page.evaluate(() => sanitizedProfilesFixture.state.permissions), []);
});

for (const mode of ['error', 'missing-rpc', 'extra-secret', 'raw-snapshot']) test(`permissions-${mode}-fails-closed`, 'permissions', async ({ page }) => {
  await loaded(page);
  await page.evaluate(mode => { sanitizedProfilesFixture.modes[sanitizedProfilesFixture.owner] = mode; }, mode);
  await event(page, OWNER);
  await page.waitForFunction(() => !sanitizedProfilesFixture.state.canView && !sanitizedProfilesFixture.state.loading);
  assert.equal(await page.evaluate(() => sanitizedProfilesFixture.state.isAdmin), false);
  assert.equal(await page.evaluate(() => sanitizedProfilesFixture.state.canEdit), false);
  assert.deepEqual(await page.evaluate(() => sanitizedProfilesFixture.state.permissions), []);
}, errors);

test('admin-roster-order-filter-refresh-and-failed-read-retention', 'admin', async ({ page }) => {
  await page.waitForFunction(() => document.querySelectorAll('.admin-account-card').length === 3);
  await rosterLayout(page);
  assert.deepEqual(await page.locator('.admin-account-card h3').allTextContents(), ['Synthetic Second', 'Synthetic Target', 'Synthetic Owner']);
  const search = page.getByPlaceholder('搜尋帳號、顯示名稱、建立者或工作區');
  await search.fill('Target'); assert.equal(await page.locator('.admin-account-card').count(), 1);
  await page.locator('.admin-account-card').getByRole('button', { name: '網站權限', exact: true }).click();
  await dialogReady(page); await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' }); await search.fill('');
  await page.evaluate(() => { sanitizedProfilesFixture.modes.roster = 'error'; });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => sanitizedProfilesFixture.toasts.some(toast => toast.description === '無法載入帳號資料'));
  assert.equal(await page.locator('.admin-account-card').count(), 3, 'Read failure cannot impersonate deletion of every account');
  await page.evaluate(() => { sanitizedProfilesFixture.modes.roster = 'ok'; sanitizedProfilesFixture.profiles[1].display_name = 'Synthetic Target Updated'; });
  await event(page, TARGET);
  await visibleRosterHeading(page, 'Synthetic Target Updated');
  await page.evaluate(() => { sanitizedProfilesFixture.profiles[0].role = 'engineer'; sanitizedProfilesFixture.profiles[0].permissions = { pagePermissions: [], workspaceAccess: {} }; });
  await event(page, OWNER);
  await page.waitForFunction(() => !sanitizedProfilesFixture.state.canEditUsers);
  for (const button of await page.getByRole('button', { name: '網站權限', exact: true }).all()) assert.equal(await button.isDisabled(), true, 'Refreshed authorization gates roster actions');
});

test('admin-delayed-roster-error-after-newer-refresh', 'admin', async ({ page }) => {
  await page.waitForFunction(() => document.querySelectorAll('.admin-account-card').length === 3);
  await rosterLayout(page);
  await page.evaluate(() => { sanitizedProfilesFixture.modes.roster = 'hold'; });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => sanitizedProfilesFixture.held.some(item => item.key === 'roster'));
  await page.evaluate(() => { sanitizedProfilesFixture.modes.roster = 'ok'; sanitizedProfilesFixture.profiles[1].display_name = 'Synthetic Newest Roster'; });
  await event(page, TARGET);
  await visibleRosterHeading(page, 'Synthetic Newest Roster');
  const toasts = await page.evaluate(() => sanitizedProfilesFixture.toasts.length);
  await page.evaluate(() => sanitizedProfilesFixture.resolveHeld('roster', 'error')); await page.waitForTimeout(30);
  assert.equal(await page.getByRole('heading', { name: 'Synthetic Newest Roster' }).count(), 1);
  assert.equal(await page.evaluate(() => sanitizedProfilesFixture.toasts.length), toasts, 'Stale roster failure is ignored');
});

test('admin-old-actor-roster-cannot-overwrite-current-actor', 'admin', async ({ page }) => {
  await page.waitForFunction(() => document.querySelectorAll('.admin-account-card').length === 3);
  await rosterLayout(page);
  await page.evaluate(() => { sanitizedProfilesFixture.modes.roster = 'hold'; });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => sanitizedProfilesFixture.held.some(item => item.key === 'roster'));
  await page.evaluate(() => { sanitizedProfilesFixture.modes.roster = 'ok'; sanitizedProfilesFixture.profiles[1].display_name = 'Synthetic Current Actor Roster'; sanitizedProfilesFixture.switchUser(); });
  await visibleRosterHeading(page, 'Synthetic Current Actor Roster');
  await page.evaluate(() => sanitizedProfilesFixture.resolveHeld('roster')); await page.waitForTimeout(30);
  assert.equal(await page.getByRole('heading', { name: 'Synthetic Current Actor Roster' }).count(), 1);
  assert.equal(await page.getByRole('heading', { name: 'Synthetic Target', exact: true }).count(), 0);
  for (const button of await page.getByRole('button', { name: '網站權限', exact: true }).all()) assert.equal(await button.isDisabled(), true);
});

test('dialog-target-switch-delayed-load-and-retry-guard', 'dialog', async ({ page, screenshot }) => {
  await dialogReady(page);
  await page.evaluate(() => { sanitizedProfilesFixture.modes[sanitizedProfilesFixture.second] = 'hold'; sanitizedProfilesFixture.setTarget(sanitizedProfilesFixture.second); });
  await page.waitForFunction(() => sanitizedProfilesFixture.held.some(item => item.key === sanitizedProfilesFixture.second));
  assert.equal(await save(page).isDisabled(), true);
  for (const button of await page.locator('.admin-permissions-presets button').all()) assert.equal(await button.isDisabled(), true);
  for (const radio of await page.getByRole('radio').all()) assert.equal(await radio.isDisabled(), true);
  await screenshot('pending');
  await page.evaluate(() => sanitizedProfilesFixture.resolveHeld(sanitizedProfilesFixture.second, 'error'));
  await page.getByRole('button', { name: '重新載入權限' }).waitFor();
  assert.equal(await save(page).isDisabled(), true);
  assert.equal(await page.evaluate(() => sanitizedProfilesFixture.writes.length), 0);
  await page.evaluate(() => { sanitizedProfilesFixture.modes[sanitizedProfilesFixture.second] = 'ok'; });
  await page.getByRole('button', { name: '重新載入權限' }).click(); await dialogReady(page);
  assert.equal(await page.locator('#pcb-designer-none').getAttribute('aria-checked'), 'true');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await page.evaluate(() => sanitizedProfilesFixture.writes.length), 0);
}, errors);

test('dialog-old-target-completion-never-enables-new-target', 'dialog', async ({ page }) => {
  await dialogReady(page); await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.evaluate(() => { sanitizedProfilesFixture.modes[sanitizedProfilesFixture.target] = 'hold'; sanitizedProfilesFixture.setOpen(true); });
  await page.waitForFunction(() => sanitizedProfilesFixture.held.some(item => item.key === sanitizedProfilesFixture.target));
  await page.evaluate(() => { sanitizedProfilesFixture.modes[sanitizedProfilesFixture.second] = 'hold'; sanitizedProfilesFixture.setTarget(sanitizedProfilesFixture.second); });
  await page.waitForFunction(() => sanitizedProfilesFixture.held.some(item => item.key === sanitizedProfilesFixture.second));
  await page.evaluate(() => sanitizedProfilesFixture.resolveHeld(sanitizedProfilesFixture.target)); await page.waitForTimeout(30);
  assert.equal(await save(page).isDisabled(), true);
  await page.evaluate(() => sanitizedProfilesFixture.resolveHeld(sanitizedProfilesFixture.second)); await dialogReady(page);
  assert.equal(await page.locator('#pcb-designer-none').getAttribute('aria-checked'), 'true');
  assert.equal(await page.evaluate(() => sanitizedProfilesFixture.writes.length), 0);
});

test('dialog-save-failure-cancel-and-controlled-retry-preserve-source', 'dialog', async ({ page }) => {
  await dialogReady(page);
  await page.getByRole('button', { name: '全站管理', exact: true }).click();
  await page.evaluate(() => { sanitizedProfilesFixture.saveMode = 'error'; });
  await save(page).click();
  await page.waitForFunction(() => sanitizedProfilesFixture.toasts.some(toast => toast.title === '權限儲存失敗'));
  assert.equal(await page.locator('#pcb-designer-edit').getAttribute('aria-checked'), 'true', 'Failed save preserves configured draft');
  assert.equal(await page.evaluate(() => sanitizedProfilesFixture.writes.length), 0);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: 'Open target', exact: true }).click(); await dialogReady(page);
  assert.equal(await page.locator('#pcb-designer-view').getAttribute('aria-checked'), 'true', 'Reopening reads server settings rather than canceled draft');
  await page.getByRole('button', { name: '全站管理', exact: true }).click();
  await page.evaluate(() => { sanitizedProfilesFixture.saveMode = 'hold'; });
  await save(page).click();
  await page.waitForFunction(() => typeof sanitizedProfilesFixture.finishSave === 'function');
  assert.equal(await page.getByRole('button', { name: '儲存中...' }).isDisabled(), true);
  await page.evaluate(() => sanitizedProfilesFixture.finishSave());
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const writes = await page.evaluate(() => sanitizedProfilesFixture.writes);
  assert.equal(writes.length, 1); assert.equal(writes[0].name, 'set_user_access_permissions'); assert.equal(writes[0].args.p_user_id, TARGET);
  assert.deepEqual(Object.keys(writes[0].args).sort(), ['p_granted_by', 'p_performance_manager', 'p_permissions', 'p_user_id', 'p_workspace_access']);
  assert.equal(await page.evaluate(() => sanitizedProfilesFixture.assertSnapshots()), true, 'No sanitized whole-document overwrite of private snapshots');
  assert.deepEqual(await page.evaluate(() => sanitizedProfilesFixture.profiles[1].permissions.futureKey), { unicode: '保留 α 🧪', explicitNull: null, falseFlag: false });
  assert.ok((await page.evaluate(() => sanitizedProfilesFixture.permissionEvents)).some(event => event.userId === TARGET));
});

for (const mode of ['missing-rpc', 'extra-secret', 'raw-snapshot']) test(`dialog-${mode}-save-disabled`, 'dialog', async ({ page }) => {
  await dialogReady(page); await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.evaluate(mode => { sanitizedProfilesFixture.modes[sanitizedProfilesFixture.target] = mode; }, mode);
  await page.getByRole('button', { name: 'Open target', exact: true }).click();
  await page.getByRole('button', { name: '重新載入權限' }).waitFor();
  assert.equal(await save(page).isDisabled(), true); assert.equal(await page.evaluate(() => sanitizedProfilesFixture.writes.length), 0);
}, errors);


async function pcbSettings(page, viewport) {
  if (viewport.width === 390) {
    await page.getByRole('button', { name: '開啟 PCB 專案操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '專案設定', exact: true }).click();
  } else await page.getByRole('button', { name: '專案設定', exact: true }).click();
  await page.getByRole('dialog').waitFor();
}

test('actual-guard-unmount-storage-failure-same-owner-recovers', 'guard', async ({ page, viewport, screenshot }) => {
  await page.waitForFunction(() => pcbRecoveryFixture.state?.canEdit && pcbRecoveryFixture.state.hasUnsavedChanges);
  const diskBefore = await page.evaluate(() => pcbRecoveryFixture.storageSnapshot());
  await page.evaluate(() => { pcbRecoveryFixture.storageFailure = true; });
  await pcbSettings(page, viewport);
  await page.getByRole('dialog').getByLabel('描述', { exact: true }).fill('Synthetic newest memory-only PCB draft α 🧪');
  await page.getByRole('dialog').getByRole('button', { name: '儲存', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => pcbRecoveryFixture.storageFailures.length > 0 && pcbRecoveryFixture.state.data.projects[0].description === 'Synthetic newest memory-only PCB draft α 🧪');
  const before = await page.evaluate(() => pcbRecoveryFixture.state.data);
  await page.evaluate(() => { sanitizedProfilesFixture.modes[sanitizedProfilesFixture.owner] = 'error'; pcbRecoveryFixture.storageReadFailure = true; });
  await event(page, OWNER);
  await page.getByTestId('pcb-designer-workspace').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => pcbRecoveryFixture.unmounted), 1, 'The actual PermissionGuard unmounted the actual PCB workspace');
  await page.getByText('您沒有權限存取此頁面。請聯繫管理員獲取相應權限。').waitFor();
  await screenshot('denied');
  await page.evaluate(() => { sanitizedProfilesFixture.modes[sanitizedProfilesFixture.owner] = 'ok'; });
  await event(page, OWNER);
  await page.waitForFunction(() => pcbRecoveryFixture.mounted === 2 && pcbRecoveryFixture.state.canEdit);
  assert.deepEqual(await page.evaluate(() => pcbRecoveryFixture.state.data), before, 'Same document/owner/client checkpoint restores exact current draft despite unavailable storage');
  assert.equal(await page.evaluate(() => pcbRecoveryFixture.state.hasUnsavedChanges), true);
  assert.deepEqual(await page.evaluate(() => pcbRecoveryFixture.storageSnapshot()), diskBefore, 'Failed writes did not damage persistent recovery or unrelated data');
}, errors);

test('actual-guard-owner-remount-never-inherits-other-draft', 'guard', async ({ page }) => {
  await page.waitForFunction(() => pcbRecoveryFixture.state?.canEdit && pcbRecoveryFixture.state.hasUnsavedChanges);
  const before = await page.evaluate(() => pcbRecoveryFixture.state.data);
  const ownRecovery = await page.evaluate(() => pcbRecoveryFixture.storageSnapshot()[pcbRecoveryFixture.recoveryKey]);
  await page.evaluate(() => {
    sanitizedProfilesFixture.profiles[1].permissions = { pagePermissions: ['pcb_designer_view'], workspaceAccess: { 'pcb-designer': 'view' } };
    pcbRecoveryFixture.switchActor(); sanitizedProfilesFixture.switchUser(sanitizedProfilesFixture.target);
  });
  await page.waitForFunction(() => pcbRecoveryFixture.mounted >= 2 && pcbRecoveryFixture.state.data.activeProjectId === 'synthetic-other-owner-project');
  const other = await page.evaluate(() => pcbRecoveryFixture.state.data);
  assert.equal(other.projects[0].description, 'OTHER OWNER INDEPENDENT DRAFT β');
  assert.ok(!JSON.stringify(other).includes('合成 PCB 未儲存草稿'));
  assert.equal(await page.evaluate(() => pcbRecoveryFixture.storageSnapshot()[pcbRecoveryFixture.recoveryKey]), ownRecovery, 'Original-owner recovery bytes survive another account remount');
  assert.ok(!(await page.evaluate(() => pcbRecoveryFixture.storageReads)).includes('work-platform:pcb-designer:v1'), 'Authenticated remount never reads ownerless global data');
  await page.evaluate(() => { pcbRecoveryFixture.renewSession('SIGNED_IN'); sanitizedProfilesFixture.switchUser(sanitizedProfilesFixture.owner); });
  await page.waitForFunction(() => pcbRecoveryFixture.mounted >= 3 && pcbRecoveryFixture.state.data.activeProjectId === 'synthetic-pcb-project');
  assert.deepEqual(await page.evaluate(() => pcbRecoveryFixture.state.data), before);
  assert.equal(await page.evaluate(() => pcbRecoveryFixture.state.hasUnsavedChanges), true);
});

test('dialog-old-actor-read-cannot-enable-current-form', 'dialog', async ({ page }) => {
  await dialogReady(page); await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.evaluate(() => { sanitizedProfilesFixture.modes[sanitizedProfilesFixture.target] = 'hold'; sanitizedProfilesFixture.setOpen(true); });
  await page.waitForFunction(() => sanitizedProfilesFixture.held.some(item => item.key === sanitizedProfilesFixture.target));
  await page.evaluate(() => { sanitizedProfilesFixture.modes[sanitizedProfilesFixture.target] = 'error'; sanitizedProfilesFixture.switchUser(); });
  await page.getByRole('button', { name: '重新載入權限' }).waitFor();
  await page.evaluate(() => sanitizedProfilesFixture.resolveHeld(sanitizedProfilesFixture.target)); await page.waitForTimeout(30);
  assert.equal(await save(page).isDisabled(), true);
  for (const button of await page.locator('.admin-permissions-presets button').all()) assert.equal(await button.isDisabled(), true);
  assert.equal(await page.evaluate(() => sanitizedProfilesFixture.writes.length), 0);
}, errors);

test('dialog-old-save-receipt-cannot-close-new-target', 'dialog', async ({ page }) => {
  await dialogReady(page); await page.getByRole('button', { name: '全站管理', exact: true }).click();
  await page.evaluate(() => { sanitizedProfilesFixture.saveMode = 'hold'; }); await save(page).click();
  await page.waitForFunction(() => typeof sanitizedProfilesFixture.finishSave === 'function');
  await page.evaluate(() => sanitizedProfilesFixture.setTarget(sanitizedProfilesFixture.second));
  await dialogReady(page);
  await page.evaluate(() => sanitizedProfilesFixture.finishSave()); await page.waitForTimeout(30);
  assert.equal(await page.getByRole('dialog').count(), 1);
  await page.getByRole('heading', { name: '設定 Synthetic Second 的網站權限' }).waitFor();
  assert.equal(await page.locator('#pcb-designer-none').getAttribute('aria-checked'), 'true');
  assert.equal(await page.evaluate(() => sanitizedProfilesFixture.permissionEvents.length), 0, 'Stale receipt cannot publish current-form success');
  const writes = await page.evaluate(() => sanitizedProfilesFixture.writes);
  assert.equal(writes.length, 1); assert.equal(writes[0].args.p_user_id, TARGET, 'Already-sent mutation remains attributed to its original target');
});

runProtectedReadBrowser({ build: buildSanitizedProfilesFixture, buildOnly: 'SANITIZED_PROFILES_BUILD_ONLY', evidenceEnv: 'SANITIZED_PROFILES_EVIDENCE_DIR',
  name: 'sanitized-profiles', scenarios, limits: ['Three actual consumers and typed reader are bundled; unexercised account editing, sidebar, API and collaboration panels are excluded.',
    'The synthetic mounted editor observes permission loading; it is not a proof for every existing editor or old tab.', 'Realtime events are simulated trigger checks, not real-service payload or authorization proof.'],
  async inspect(page) {
    const result = await page.evaluate(() => ({ rawAttempts: sanitizedProfilesFixture.rawAttempts, authMutations: sanitizedProfilesFixture.authMutations,
      snapshotsIntact: sanitizedProfilesFixture.assertSnapshots(), profileCalls: sanitizedProfilesFixture.calls.filter(call => call.type === 'profiles').length,
      writes: sanitizedProfilesFixture.writes, pcb: sanitizedProfilesFixture.surface === 'guard' ? {
        permissionsReads: pcbRecoveryFixture.permissionsReads, destructiveWrites: pcbRecoveryFixture.destructiveWrites, storageReads: pcbRecoveryFixture.storageReads,
        hasUnsavedChanges: pcbRecoveryFixture.state.hasUnsavedChanges, mounted: pcbRecoveryFixture.mounted, unmounted: pcbRecoveryFixture.unmounted } : null }));
    assert.deepEqual(result.rawAttempts, []); assert.deepEqual(result.authMutations, []); assert.equal(result.snapshotsIntact, true);
    assert.ok(result.profileCalls > 0);
    if (result.pcb) { assert.equal(result.pcb.permissionsReads, 0); assert.deepEqual(result.pcb.destructiveWrites, []); assert.equal(result.pcb.hasUnsavedChanges, true); assert.ok(!result.pcb.storageReads.includes('work-platform:pcb-designer:v1')); }
    const bounds = await page.locator('[data-admin-dialog=permissions]').count() ? await page.locator('[data-admin-dialog=permissions]').boundingBox() : null;
    if (bounds) { const viewport = page.viewportSize(); assert.ok(bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, 'Permission dialog remains inside viewport'); }
    return result;
  },
}).catch(error => { console.error(error); process.exitCode = 1; });
