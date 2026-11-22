// Real version-center UI with local QA series and callback journals; no production requests or mutations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {chromium} = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools','package.json'))('playwright');
const evidence = path.resolve(process.env.BOM_VERSION_UI_EVIDENCE_DIR || '../bom-version-ui-evidence');
const contextOnly = Boolean(process.env.BOM_VERSION_CONTEXT_ONLY);
const calls = page => page.evaluate(()=>window.__bomUiFixture.calls);
async function assertFrame(page, center, width, height) {
  await page.waitForFunction(({width,height})=>{const box=document.querySelector('[data-testid="bom-version-center"]')?.getBoundingClientRect();return box&&box.width>=width-36&&box.height>=height-40&&box.x>=-1&&box.y>=-1;},{width,height});
  const frame = await center.boundingBox();
  assert.ok(frame && frame.x>=-1 && frame.y>=-1 && frame.x+frame.width<=width+1 && frame.y+frame.height<=height+1, JSON.stringify(frame));
  assert.ok(frame.width>=width-36, `version window should use available width: ${JSON.stringify(frame)}`);
  assert.ok(frame.height>=height-40, `version window should use available height: ${JSON.stringify(frame)}`);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.ok(await center.evaluate(el=>el.scrollWidth<=el.clientWidth+1), 'the dialog must not scroll horizontally; only the version table may');
}
const VERA = 'Vera CPU / 工程驗證與長專案名稱測試';
// The path on top: a crumb button (‹ the level above on a phone, every level on a wide screen).
const crumbButton = (center, name) => center.locator('.bom-crumbs').getByRole('button',{name,exact:true});
async function levelOf(center) { return center.getAttribute('data-level'); }
async function contextActions(page, center, width, origin) {
  const list=center.getByTestId('bom-series-list'), detail=center.getByTestId('bom-series-detail');
  // Opens on the project of the board on screen (2026-11-22 levels): its heading, apart from the workspace project.
  await center.getByRole('heading',{level:3,name:VERA,exact:true}).waitFor();
  assert.equal(await levelOf(center),'project');
  assert.match(await center.locator('.bom-version-workspace').innerText(), /工作區專案：Carlo-Next-\(GB300\)/);
  assert.equal(await center.locator('.bom-version-header').getByRole('button',{name:'NV 原始 BOM 比對',exact:true}).count(),0,'NV is not in the title row');
  await center.getByRole('button',{name:'匯入 BOM 檔案',exact:true}).click();
  assert.ok((await calls(page)).some(call=>call.name==='uploadNew'));
  await list.getByRole('button',{name:/Vera_CPU_Rack_CPU_Module_超長系列名稱/}).click(); await detail.waitFor();
  const compare=detail.getByRole('button',{name:'比對版本',exact:true}), nv=center.getByTestId('bom-nv-compare-entry');
  assert.equal(await nv.count(),1,'one NV entry on the board level');
  assert.equal(await compare.isEnabled(),false,'The single-version series cannot compare stored versions');
  assert.equal(await nv.isEnabled(),true,'NV file comparison remains available for a single-version series');
  const pair={compare:await compare.boundingBox(),nv:await nv.boundingBox()};
  assert.ok(Math.abs(pair.compare.y-pair.nv.y)<=1 && pair.nv.x>=pair.compare.x+pair.compare.width-1 && pair.nv.x-pair.compare.x-pair.compare.width<=16,JSON.stringify(pair));
  await detail.getByRole('button',{name:'上傳此系列新版',exact:true}).click();
  assert.ok((await calls(page)).some(call=>call.name==='uploadVersion'&&call.args[0]==='module'));
  await nv.click(); await center.getByRole('heading',{name:'NV 原始 BOM 比對',exact:true}).waitFor();
  await center.getByRole('button',{name:'返回版本管理',exact:true}).waitFor();
  assert.ok(await center.getByLabel('選擇舊版 NV BOM',{exact:true}).count());
  assert.ok(await center.getByLabel('選擇新版 NV BOM',{exact:true}).count());
  await assertFrame(page,center,width,884); await page.screenshot({path:path.join(evidence,`nv-open-${width}.png`)});
  await center.getByRole('button',{name:'返回版本管理',exact:true}).click(); await detail.waitFor();
  assert.match(await detail.getByRole('heading',{level:3}).innerText(),/Vera_CPU_Rack_CPU_Module/);
  assert.match(await center.locator('.bom-crumbs li[data-kind="board"]').textContent(),/Vera_CPU_Rack_CPU_Module/,'the path names the board on screen');
  assert.equal((await center.locator('.bom-crumbs li[data-kind="project"]').textContent()).trim(),VERA);
  await page.screenshot({path:path.join(evidence,`context-${width}.png`)});
  await page.goto(origin+'/?qaUnassigned=1');await center.waitFor();
  // The unassigned board is one level over: 全部專案 › 未指定專案 › the board.
  await crumbButton(center,'全部專案').click();
  await center.getByTestId('bom-project-list').getByRole('button',{name:/^打開專案：未指定專案/}).click();
  await list.getByRole('button',{name:/Vera_CPU_TPM_交付格式/}).click();await detail.waitFor();
  assert.equal((await center.locator('.bom-crumbs li[data-kind="project"]').textContent()).trim(),'未指定專案');
  assert.match(await center.locator('.bom-version-workspace').innerText(),/工作區專案：Carlo-Next/);
  await assertFrame(page,center,width,884);await page.screenshot({path:path.join(evidence,`unassigned-${width}.png`)});
  await page.goto(origin+'/?qaEmpty=1');await center.waitFor();
  // No BOM at all: the workspace project opens with an empty board table that still shows its header and an import action.
  await center.getByRole('heading',{level:3,name:'Carlo-Next-(GB300)',exact:true}).waitFor();
  assert.equal(await center.locator('.bom-crumbs li[data-kind="board"]').count(),0,'No board is invented for an empty list');
  await list.getByText('「Carlo-Next-(GB300)」還沒有 BOM',{exact:true}).waitFor();
  assert.equal(await list.getByRole('button',{name:'匯入 BOM 檔案',exact:true}).count(),1,'the empty project offers the import');
  assert.match(await center.locator('.bom-version-workspace').innerText(),/工作區專案：Carlo-Next/);
  assert.equal(await center.getByTestId('bom-nv-compare-entry').isEnabled(),true);
  await center.getByTestId('bom-nv-compare-entry').click();await center.getByRole('button',{name:'返回版本管理',exact:true}).waitFor();
  await center.getByRole('button',{name:'返回版本管理',exact:true}).click();
  await center.getByRole('heading',{name:'BOM 版本管理',exact:true}).waitFor();await assertFrame(page,center,width,884);
  await page.screenshot({path:path.join(evidence,`empty-${width}.png`)});
  return {width,result:'passed',pair,checks:['opens on the project of the board on screen','workspace project kept apart from the path','generic import callback unchanged','selected-series version upload callback unchanged','NV beside version comparison','NV enabled when one-version comparison disabled','real NV panel and return preserve selected board','unassigned project through the levels','empty project keeps its table and import','dialog bounds']};
}
async function run(browser, origin, width) {
  const context = await browser.newContext({viewport:{width,height:884},isMobile:width<1024,hasTouch:true,reducedMotion:'reduce',locale:'zh-TW'});
  const page = await context.newPage(), errors=[]; page.on('pageerror',error=>errors.push(error.message)); page.setDefaultTimeout(15000);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  try {
    await page.goto(origin); const center=page.getByTestId('bom-version-center'); await center.waitFor();
    await assertFrame(page,center,width,884);
    if(contextOnly){const result=await contextActions(page,center,width,origin);assert.deepEqual(errors,[]);return result;}
    const list = center.getByTestId('bom-series-list'), projectList = center.getByTestId('bom-project-list'), search = center.getByRole('textbox',{name:'搜尋 BOM 系列',exact:true});
    const detail=center.getByTestId('bom-series-detail');
    const active = list.getByRole('button',{name:/Vera_CPU_Rack_E1\.S/}).first();
    const other = list.getByRole('button',{name:/Vera_CPU_Baseboard/}).first();
    const veraProject = projectList.locator('.bom-project-row[data-project-key="qa-vera"]');
    const backToProjects = crumbButton(center,'全部專案'), backToProject = crumbButton(center,VERA);
    // Levels (2026-11-22): opens on the project of the board on screen, with its 專案總料表 and its boards.
    await center.getByRole('heading',{level:3,name:VERA,exact:true}).waitFor();
    await active.waitFor(); assert.equal(await active.getAttribute('aria-current'),'true','the board on screen is marked');
    assert.equal(await levelOf(center),'project');
    assert.ok(await search.isVisible());
    await backToProjects.tap(); await projectList.waitFor();
    assert.equal(await list.count(),0,'the project level lists projects, not boards');
    assert.equal(await projectList.locator('.bom-project-row:not([data-archive])').count(),2,'the workspace project is listed even without boards');
    assert.equal(await veraProject.getAttribute('aria-current'),'true','the project holding the board on screen is marked');
    assert.equal(await page.evaluate(()=>document.activeElement?.hasAttribute('data-level-heading')),true,'focus moves to the new level heading');
    await veraProject.press('Enter'); await active.waitFor();
    await search.fill('Vera_CPU_Rack_E1.S'); await active.waitFor(); assert.equal(await other.count(),0,'search narrows the project boards');
    await center.getByRole('button',{name:'清除 BOM 系列搜尋',exact:true}).tap(); await other.waitFor();
    const tone = await active.evaluate(el=>getComputedStyle(el).backgroundColor), alternateTone=await other.evaluate(el=>getComputedStyle(el).backgroundColor);
    assert.notEqual(tone,alternateTone,'the board on screen should have a distinct surface');
    const titleFont = await active.locator('.bom-level-name').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)); assert.ok(titleFont>=14,titleFont);
    await search.fill('找不到的系列'); await list.getByText('找不到符合條件的 BOM 系列',{exact:true}).waitFor();
    if(width>=1024) assert.equal(await list.locator('.bom-level-table-head').isVisible(),true,'an empty result keeps the table header');
    await search.fill(''); await active.waitFor();
    // From every project the search lists matching boards of all projects, each with its project.
    await backToProjects.tap(); await projectList.waitFor();
    await search.fill('Baseboard'); await other.waitFor();
    assert.equal(await list.getAttribute('data-kind'),'search');
    assert.equal((await list.locator('.bom-level-cell-project').first().innerText()).trim(),VERA);
    await search.fill('工程驗證板'); await list.getByRole('button',{name:/已封存_工程驗證板/}).waitFor();
    assert.equal((await list.locator('.bom-level-cell-project').first().innerText()).trim(),`已封存（${VERA}）`,'searching every project also finds archived boards, with the project they were filed under');
    // The project name also finds that project's archived boards; a result opens under 已封存.
    await search.fill('工程驗證與長專案'); await list.getByRole('button',{name:/已封存_工程驗證板/}).waitFor();
    await list.getByRole('button',{name:/已封存_工程驗證板/}).tap(); await detail.waitFor();
    assert.equal((await center.locator('.bom-crumbs li[data-kind="project"]').textContent()).trim(),'已封存','an archived board sits under 已封存 in the path');
    assert.equal(await search.count(),0,'the board level has no search box');
    await crumbButton(center,'已封存').tap(); await center.getByRole('heading',{level:3,name:'已封存的系列',exact:true}).waitFor();
    assert.equal(await search.inputValue(),'','changing level clears the search');
    await backToProjects.tap(); await projectList.waitFor();
    // 已封存 is a level of its own beside the projects.
    await center.getByTestId('bom-archive-section').tap(); await center.getByRole('heading',{level:3,name:'已封存的系列',exact:true}).waitFor();
    await list.getByRole('button',{name:/已封存_工程驗證板/}).waitFor();
    await backToProjects.tap(); await veraProject.tap(); await active.waitFor();
    await center.getByRole('button',{name:'匯入 BOM 檔案',exact:true}).tap(); assert.ok((await calls(page)).some(call=>call.name==='uploadNew'));
    await page.screenshot({path:path.join(evidence,`series-${width}.png`)});
    await list.getByRole('button',{name:/超長系列名稱/}).tap(); await detail.waitFor();
    assert.ok((await detail.getByRole('heading',{level:3}).innerText()).includes('超長系列名稱'));
    assert.equal(await levelOf(center),'board');
    await backToProject.tap(); await active.waitFor();
    await active.tap(); await detail.waitFor();
    await detail.getByText('此 BOM 所屬專案',{exact:true}).waitFor();
    await detail.getByRole('button',{name:'上傳此系列新版',exact:true}).tap(); assert.ok((await calls(page)).some(call=>call.name==='uploadVersion'&&call.args[0]==='rack'));
    await detail.getByRole('button',{name:'修改系列名稱',exact:true}).tap(); await detail.getByRole('textbox',{name:'系列名稱',exact:true}).fill('暫存取消名稱');
    await detail.getByRole('button',{name:'取消',exact:true}).tap(); assert.equal((await calls(page)).some(call=>call.name==='rename'),false);
    await detail.getByRole('button',{name:'修改系列名稱',exact:true}).tap(); await detail.getByRole('textbox',{name:'系列名稱',exact:true}).fill('QA 已更新系列名稱');
    await detail.getByRole('button',{name:'儲存名稱',exact:true}).tap(); await detail.getByRole('heading',{name:'QA 已更新系列名稱',exact:true}).waitFor();
    assert.match(await center.locator('.bom-crumbs li[data-kind="board"]').textContent(),/QA 已更新系列名稱/,'the path follows a rename');
    const row = detail.locator('[data-version-id]').first();
    const openMore = async label => { await row.getByRole('button',{name:/更多操作$/}).tap(); await page.getByRole('menuitem',{name:label,exact:true}).tap(); };
    assert.equal(await detail.getByTestId(width<1024?'bom-version-cards':'bom-version-table').count(),1,'phone shows version cards, desktop the version table');
    await openMore('編輯說明');
    await detail.getByLabel('版本標籤',{exact:true}).fill('取消的標籤'); await detail.getByRole('button',{name:'取消',exact:true}).tap();
    assert.equal((await calls(page)).some(call=>call.name==='editVersion'),false);
    await openMore('編輯說明');
    await detail.getByLabel('版本標籤',{exact:true}).fill('QA 版次說明'); await detail.getByLabel('版本說明',{exact:true}).fill('保留原本儲存 callback');
    await detail.getByRole('button',{name:'儲存',exact:true}).tap();
    await page.waitForFunction(()=>window.__bomUiFixture.calls.some(call=>call.name==='editVersion'));
    assert.ok((await calls(page)).some(call=>call.name==='editVersion'&&call.args[2].label==='QA 版次說明'));
    await openMore('頁數進度'); assert.ok((await calls(page)).some(call=>call.name==='pages'));
    await detail.getByRole('button',{name:'比對版本',exact:true}).tap(); await center.getByTestId('bom-diff-view').waitFor(); await center.getByTestId('bom-diff-summary').waitFor();
    if(width>=1024) assert.match(await center.locator('.bom-crumbs').innerText(),/比對 V2 → V3/,'the comparison sits under its board in the path');
    await center.getByRole('button',{name:'← 返回系列',exact:true}).tap(); await detail.waitFor();
    assert.equal((await calls(page)).filter(call=>call.name==='loadRecords').length,2);
    if(width>=1024) await detail.getByTestId('bom-version-table').evaluate(el=>el.parentElement.scrollLeft=0);
    await assertFrame(page,center,width,884); await page.screenshot({path:path.join(evidence,`detail-${width}.png`)});
    await page.setViewportSize({width,height:500}); await page.waitForFunction(()=>{const box=document.querySelector('[data-testid="bom-version-center"]').getBoundingClientRect();return box.height<=innerHeight&&box.y>=0;}); await assertFrame(page,center,width,500);
    await detail.getByRole('button',{name:'上傳此系列新版',exact:true}).scrollIntoViewIfNeeded(); await detail.getByRole('button',{name:'上傳此系列新版',exact:true}).tap();
    if(width<1024) {
      const before=(await calls(page)).filter(call=>call.name==='pages').length;
      await row.getByRole('button',{name:/更多操作$/}).scrollIntoViewIfNeeded(); await openMore('頁數進度');
      assert.equal((await calls(page)).filter(call=>call.name==='pages').length,before+1,'short phone can scroll to a version action');
    }
    await page.screenshot({path:path.join(evidence,`short-${width}.png`)});
    // The board was renamed above, so it is found by its on-screen mark, not by its old name.
    await backToProject.scrollIntoViewIfNeeded(); await backToProject.tap(); await list.locator('.bom-series-row[aria-current="true"]').waitFor();
    await backToProjects.tap(); await veraProject.waitFor();
    await veraProject.tap(); await list.locator('.bom-series-row[aria-current="true"]').waitFor();
    await page.screenshot({path:path.join(evidence,`groups-short-${width}.png`)});
    await center.locator('[data-ui="dialog-close"]').tap(); await center.waitFor({state:'hidden'});
    assert.deepEqual(errors,[]);
    return {width,result:'passed',checks:['near-full-screen bounds','opens on the project of the board on screen','project level and keyboard open with focus on the heading','search narrows a project; search from every project shows the project column','empty search keeps the table header','readable and distinct board on screen','archive as its own level','long names and the path back','upload callbacks','rename and version edit save/cancel','page tracker callback','diff open under its board and return','short viewport levels','no dialog horizontal overflow']};
  } catch(error) { await page.screenshot({path:path.join(evidence,`failure-${width}.png`)}).catch(()=>{}); throw error; }
  finally { await context.close(); }
}
(async()=>{
  fs.mkdirSync(evidence,{recursive:true}); const {createServer}=await import('vite'); let server,browser;
  const report={result:'running',checks:[]};
  try {
    server=await createServer({configFile:false,root:process.cwd(),cacheDir:path.join(evidence,'.vite'),resolve:{alias:{'@':path.resolve('src')}},optimizeDeps:{entries:['tests/support/bomVersionUiFixture.jsx'],include:['react/jsx-dev-runtime']},server:{host:'127.0.0.1',port:0},plugins:[{name:'nv-models-local-fixture',enforce:'pre',resolveId(source,importer){if(source==='./nvBomCompareAi'&&importer?.replaceAll('\\','/').endsWith('/NvBomComparePanel.tsx'))return '\0qa-nv-models';},load(id){if(id==='\0qa-nv-models')return 'export async function loadNvBomModels(){return []} export async function resolveNvBomMappings(){throw new Error("QA does not call AI")} export async function runNvBomComparison(){throw new Error("QA does not call AI")}';}},{name:'bom-ui-local-fixture',configureServer(vite){vite.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]!=='/')return next();res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/bomVersionUiFixture.jsx"></script></html>');});}}]});
    await server.listen(); const origin='http://127.0.0.1:'+server.httpServer.address().port; browser=await chromium.launch({channel:'chrome'});
    for(const width of (process.env.BOM_VERSION_UI_WIDTHS || (contextOnly?'1543,1280,390':'1440,1180,390,536')).split(',').map(Number)) report.checks.push(await run(browser,origin,width));
    report.result='passed'; console.log(JSON.stringify({result:report.result,checks:report.checks},null,2));
  } catch(error) { report.result='failed';report.error=error.stack;throw error; }
  finally {fs.writeFileSync(path.join(evidence,'browser-report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();if(server)await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
