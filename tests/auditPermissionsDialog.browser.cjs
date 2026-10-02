const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {execFileSync} = require('node:child_process');
const {createRequire} = require('node:module');
const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
const {chromium} = qa('playwright');
(async () => {
  const sourceAt = file => (process.env.AUDIT_PERMISSIONS_BASE || (file.endsWith('UserEditDialog.tsx') && process.env.AUDIT_EDITOR_BASE))
    ? execFileSync('git', ['show', `${process.env.AUDIT_PERMISSIONS_BASE || process.env.AUDIT_EDITOR_BASE}:${file}`], {encoding:'utf8'})
    : fs.readFileSync(file, 'utf8');
  const bundled = await require('esbuild').build({entryPoints: ['tests/support/permissionsDialogFixture.jsx'],
    bundle: true, write: false, jsx: 'automatic', format: 'iife', platform: 'browser',
    plugins: [{name: 'isolated-permissions', setup(build) {
      build.onLoad({filter: /UserPermissionsDialog\.tsx$/}, args => ({
        contents: sourceAt('src/components/admin/UserPermissionsDialog.tsx'), loader: 'tsx'}));
      build.onLoad({filter: /UserEditDialog\.tsx$/}, args => ({
        contents: sourceAt('src/components/admin/UserEditDialog.tsx'), loader: 'tsx'}));
      build.onResolve({filter: /^@\/(components\/auth\/UserContext|hooks\/use-toast|lib\/realtimeCollaborationConfig)$/}, args => ({path: args.path, namespace: 'audit-auth'}));
      build.onLoad({filter: /.*/, namespace: 'audit-auth'}, args => ({contents:
        args.path.endsWith('realtimeCollaborationConfig') ? 'export const REALTIME_COLLABORATION_V2_ENABLED=true'
        : args.path.endsWith('UserContext') ? 'export const useUser=()=>({user:{userId:"fixture-admin",username:"fixture-admin",role:"admin"}})'
        : 'const toast=v=>window.auditPermissions.toasts.push(v);export const useToast=()=>({toast})', loader: 'js'}));
      build.onResolve({filter: /^@\/integrations\/supabase\/client$|^\.\/authAccountSync$/}, () => ({path: path.resolve('tests/support/permissionsDialogMock.js')}));
      build.onResolve({filter: /^@\//}, args => build.resolve(path.resolve('src', args.path.slice(2)), {resolveDir: process.cwd(), kind: args.kind}));
    }}],
  });
  const style = await require('postcss')([require('tailwindcss')({config: path.resolve('tailwind.config.ts')}), require('autoprefixer')])
    .process(fs.readFileSync('src/index.css', 'utf8').replace(/@import url\([^\n]+\n/g, '')
      + sourceAt('src/components/admin/admin-panel.css'), {from: path.resolve('src/index.css')});
  const server = http.createServer((req, res) => {
    if (req.url === '/fixture.js') {res.setHeader('Content-Type', 'text/javascript');res.end(bundled.outputFiles[0].text);}
    else {res.setHeader('Content-Type', 'text/html; charset=utf-8');res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${style.css}</style><div id="root"></div><script src="/fixture.js"></script>`);}
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({headless: true, ...(process.platform === 'win32' ? {executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'} : {})});
  const artifacts = process.env.AUDIT_SCREENSHOT_DIR || '../evidence-20261002';
  fs.mkdirSync(artifacts, {recursive: true});
  try {
    const results = [];
    const sizes = [[320, 568], [390, 844], [768, 1024], [1180, 757], [1440, 900], [1180, 500], [390, 400], [720, 450, 2]];
    for (const [width, height, scale = 1] of process.env.AUDIT_EDITOR_BASE ? [] : sizes) {
      const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: scale, reducedMotion: 'reduce'});
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.locator('#fixture-user-trigger').click();
      await page.waitForFunction(() => document.querySelector('.admin-permissions-presets button')?.disabled === false);
      await page.screenshot({path: path.join(artifacts, `permissions-${process.env.AUDIT_PERMISSIONS_BASE ? 'before' : 'after'}-${width}x${height}.png`)});
      const geometry = await page.evaluate(() => {
        const rect = s => {const r = document.querySelector(s).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
        const manager = rect('[data-admin-zone="performance-manager-assignment"]');
        const label = rect('[data-admin-zone="performance-manager-assignment"] label');
        return {dialog: rect('[role="dialog"]'), manager, label, body: rect('.admin-permissions-scroll'), panes: rect('.admin-permissions-layout'), footer: rect('.admin-permissions-footer'),
          tracks: getComputedStyle(document.querySelector('[role="dialog"]')).gridTemplateRows,
          columns: getComputedStyle(document.querySelector('.admin-permissions-layout')).gridTemplateColumns,
          horizontalOverflow: document.querySelector('[role="dialog"]').scrollWidth > document.querySelector('[role="dialog"]').clientWidth,
        };
      });
      console.log(JSON.stringify({width, height, geometry}));
      assert.ok(geometry.manager.height >= geometry.label.height, 'manager content has natural height');
      assert.ok(geometry.label.bottom <= geometry.panes.y + 1, 'manager label is not covered by permission panes');
      assert.ok(geometry.footer.bottom <= height + 1, 'footer stays in viewport');
      assert.equal(geometry.horizontalOverflow, false, 'no horizontal overflow');
      const groups = page.getByRole('radiogroup');
      assert.equal(await groups.count(), 7);
      for (const group of await groups.all()) assert.ok(await group.getAttribute('aria-label'), 'workspace radiogroup has an explicit name');
      const l10 = page.locator('.admin-permission-group-row').filter({has: page.locator('#test_tracker_view')});
      assert.equal(await l10.getByRole('checkbox').count(), 4);
      for (const key of ['test_tracker_view', 'test_tracker_edit', 'production_view', 'production_edit']) {
        assert.ok((await page.locator(`label[for="${key}"]`).innerText()).length > 2, 'visible checkbox label includes its target');
        assert.ok((await page.locator(`#${key}`).getAttribute('aria-label')).length > 2, 'checkbox accessible name includes target');
      }
      const managerBox = page.locator('[data-admin-zone="performance-manager-assignment"] button[role="checkbox"]');
      await page.locator('.admin-permissions-presets button').last().click();
      await page.keyboard.press('Tab');
      assert.equal(await managerBox.evaluate(el=>el===document.activeElement), true, 'Tab from presets reaches manager control');
      const focused = await managerBox.evaluate(el => {const r=el.getBoundingClientRect();return {visible:r.y>=0 && r.bottom<=innerHeight,hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el};});
      assert.deepEqual(focused, {visible: true, hit: true}, 'keyboard focus target is visible and unobscured');
      await page.keyboard.press('Space');
      await page.waitForFunction(()=>document.querySelector('[data-admin-zone="performance-manager-assignment"] [role="checkbox"]').dataset.state==='checked');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.locator('.admin-permissions-presets button').last().evaluate(el=>el===document.activeElement),true);
      await page.locator('.admin-permissions-presets button').nth(1).click();
      await page.locator('.admin-permissions-scroll').evaluate(el => {el.scrollTop=el.scrollHeight;});
      await page.locator('#api_management_edit').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('#api_management_edit').isVisible(), 'last group is reachable');
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>document.activeElement?.id==='fixture-user-trigger');
      results.push({width,height,deviceScaleFactor:scale,layout:true,keyboard:true,scroll:true,escapeRestoresOriginalUser:true,
        ...(scale===2?{zoom:'200% effective desktop viewport (1440x900 physical / 720x450 CSS)'}:{})});
      await page.close();
    }
    const editorResults = [];
    for (const [width,height,scale=1] of sizes) {
      const editor = await browser.newPage({viewport:{width,height},deviceScaleFactor:scale,reducedMotion:'reduce'});
      await editor.goto(`http://127.0.0.1:${server.address().port}/editor`);
      await editor.locator('#fixture-editor button').click();await editor.locator('[role="dialog"]').waitFor();
      await editor.screenshot({path:path.join(artifacts,`user-editor-${process.env.AUDIT_EDITOR_BASE?'before':'after'}-${width}x${height}.png`)});
      const geometry = await editor.locator('[role="dialog"]').evaluate(el=>{
        const dialog=el.getBoundingClientRect();return {dialog:{x:dialog.x,right:dialog.right,y:dialog.y,bottom:dialog.bottom},overflow:el.scrollWidth>el.clientWidth,
          outside:[...el.querySelectorAll('input,[role="combobox"],button')].map(c=>{const r=c.getBoundingClientRect();return {role:c.getAttribute('role')||c.tagName,x:r.x,right:r.right};}).filter(c=>c.x<dialog.x||c.right>dialog.right)};
      });
      console.log(JSON.stringify({editor:{width,height,geometry}}));assert.equal(geometry.overflow,false,'user editor has no horizontal overflow');assert.deepEqual(geometry.outside,[],'editor fields/actions stay inside the modal');
      const fields=editor.locator('[role="dialog"] input');await fields.nth(1).fill('AUDIT_LOCAL_CHANGED');
      assert.equal(await fields.nth(0).inputValue(),'AUDIT_LOCAL');assert.equal(await fields.last().inputValue(),'','password stays blank; no existing credential is loaded');
      const actions=editor.locator('.admin-user-edit-actions');await actions.locator('button').last().scrollIntoViewIfNeeded();
      await editor.evaluate(()=>auditPermissions.failSave=true);await actions.locator('button').last().click();
      await editor.waitForFunction(()=>auditPermissions.toasts.some(t=>t.variant==='destructive'));
      assert.equal(await fields.nth(1).inputValue(),'AUDIT_LOCAL_CHANGED','failed save preserves edited form');
      await editor.evaluate(()=>auditPermissions.failSave=false);await actions.locator('button').last().click();
      await editor.waitForFunction(()=>auditPermissions.editorUpdates===1);
      assert.equal(await editor.evaluate(()=>auditPermissions.writes[0].payload.profile.displayName),'AUDIT_LOCAL_CHANGED');
      assert.equal(await editor.evaluate(()=>auditPermissions.writes[0].payload.profile.role),'engineer');assert.equal(await editor.evaluate(()=>auditPermissions.writes[0].payload.password),'');
      await editor.locator('[role="dialog"]').waitFor({state:'hidden'});
      await editor.waitForFunction(()=>document.activeElement===document.querySelector('#fixture-editor button'));
      await editor.locator('#fixture-editor button').click();await actions.locator('button').nth(1).scrollIntoViewIfNeeded();await actions.locator('button').nth(1).click();
      await editor.locator('[role="dialog"]').waitFor({state:'hidden'});
      await editor.waitForFunction(()=>document.activeElement===document.querySelector('#fixture-editor button'));
      assert.equal(await editor.evaluate(()=>auditPermissions.writes.length),1,'cancel issues no additional account mutation');
      assert.deepEqual(await editor.evaluate(()=>auditPermissions.editorDeletes),[],'real/fixture delete never invoked');
      await editor.locator('#fixture-editor button').click();
      await editor.locator('[role="dialog"][data-state="open"]').waitFor();
      await editor.waitForFunction(()=>document.querySelector('[role="dialog"]')?.contains(document.activeElement));
      // Focus can mount before the dismissable layer's document listeners.
      await editor.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await editor.keyboard.press('Escape');await editor.locator('[role="dialog"]').waitFor({state:'hidden'});await editor.waitForFunction(()=>document.activeElement===document.querySelector('#fixture-editor button'));
      editorResults.push({width,height,layout:true,save:true,cancel:true,escapeFocus:true});await editor.close();
    }
    const page = await browser.newPage({viewport:{width:1180,height:757}});
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#fixture-user-trigger').click();
    const save = page.locator('.admin-permissions-footer button').last();
    await save.waitFor(); await page.waitForFunction(() => document.querySelector('.admin-permissions-presets button')?.disabled === false);
    await page.locator('.admin-permissions-presets button').first().click();
    await page.waitForFunction(() => document.querySelector('#station-status-view')?.dataset.state === 'checked');
    assert.equal(await page.locator('#test_tracker_edit').isDisabled(), true, 'view preset disables edit controls');
    await page.locator('[data-admin-zone="performance-manager-assignment"] button[role="checkbox"]').click();
    assert.equal(await page.locator('.admin-permission-workspace-row').filter({has:page.locator('#performance-edit')}).locator('[role="radio"][data-state="checked"]').getAttribute('id'), 'performance-edit');
    await page.locator('.admin-permissions-footer button').first().click();
    await page.waitForFunction(()=>document.activeElement?.id==='fixture-user-trigger');
    assert.equal(await page.evaluate(() => auditPermissions.writes.length), 0, 'cancel does not save');
    await page.getByText('Open fixture', {exact:true}).click();
    await page.waitForFunction(() => document.querySelector('.admin-permissions-presets button')?.disabled === false);
    assert.equal(await page.locator('[data-admin-zone="performance-manager-assignment"] button[role="checkbox"]').getAttribute('data-state'), 'unchecked', 'cancelled draft is reloaded from stored settings');
    await page.locator('#production_edit').scrollIntoViewIfNeeded();await page.locator('#production_edit').click();
    await page.locator('#api_management_edit').scrollIntoViewIfNeeded();await page.locator('#api_management_edit').click();
    await page.evaluate(() => auditPermissions.failSave=true);await save.click();
    await page.waitForFunction(() => auditPermissions.toasts.some(t=>t.variant==='destructive'));
    assert.equal(await page.locator('[role="dialog"]').count(), 1, 'failed save retains draft');
    assert.equal(await page.locator('#production_edit').getAttribute('data-state'), 'unchecked');
    await page.evaluate(() => auditPermissions.failSave=false);await save.click();
    await page.waitForFunction(() => auditPermissions.writes.length===1);
    assert.equal(await page.evaluate(() => auditPermissions.settings.unrelatedSetting), 'preserved');
    // Existing synchronization grants all station edit permissions when the
    // station workspace is edit; use the independent API detail to test save.
    assert.equal(await page.evaluate(() => auditPermissions.settings.pagePermissions.includes('api_management_edit')), false);
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    await page.waitForFunction(()=>document.activeElement?.id==='fixture-user-trigger');
    await page.evaluate(()=>auditPermissions.failRead=true);await page.getByText('Open fixture',{exact:true}).click();
    await page.waitForFunction(()=>auditPermissions.toasts.filter(t=>t.variant==='destructive').length===2);
    assert.equal(await save.isDisabled(), true, 'failed load cannot save default permissions');
    console.log(JSON.stringify({responsive:results,userEditor:editorResults,cancelNoWrite:true,managerAssignmentMinimumEdit:true,saveFailureDraftRetained:true,durableSavePreservesUnknownSettings:true,failedReadFailsClosed:true,backend:'isolated mocks, no real permission/account updates'}));
  } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
