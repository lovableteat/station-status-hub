// Real version-center UI with local QA series and callback journals; no production requests or mutations.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {chromium} = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools','package.json'))('playwright');
const evidence = path.resolve(process.env.BOM_VERSION_UI_EVIDENCE_DIR || '../bom-version-ui-evidence');
const calls = page => page.evaluate(()=>window.__bomUiFixture.calls);
async function assertFrame(page, center, width, height) {
  const frame = await center.boundingBox();
  assert.ok(frame && frame.x>=-1 && frame.y>=-1 && frame.x+frame.width<=width+1 && frame.y+frame.height<=height+1, JSON.stringify(frame));
  assert.ok(frame.width>=width-36, `version window should use available width: ${JSON.stringify(frame)}`);
  assert.ok(frame.height>=height-40, `version window should use available height: ${JSON.stringify(frame)}`);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.ok(await center.evaluate(el=>el.scrollWidth<=el.clientWidth+1), 'the dialog must not scroll horizontally; only the version table may');
}
async function run(browser, origin, width) {
  const context = await browser.newContext({viewport:{width,height:884},isMobile:width<1024,hasTouch:true,reducedMotion:'reduce',locale:'zh-TW'});
  const page = await context.newPage(), errors=[]; page.on('pageerror',error=>errors.push(error.message)); page.setDefaultTimeout(15000);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  try {
    await page.goto(origin); const center=page.getByTestId('bom-version-center'); await center.waitFor();
    await assertFrame(page,center,width,884);
    const list = center.getByTestId('bom-series-list'), search = list.getByRole('textbox',{name:'搜尋 BOM 系列',exact:true});
    assert.ok(await search.isVisible());
    const active = list.getByRole('button',{name:/Vera_CPU_Rack_E1\.S/}).first();
    const other = list.getByRole('button',{name:/Vera_CPU_Baseboard/}).first();
    const tone = await active.evaluate(el=>getComputedStyle(el).backgroundColor), alternateTone=await other.evaluate(el=>getComputedStyle(el).backgroundColor);
    assert.notEqual(tone,alternateTone,'selected series should have a distinct surface');
    const titleFont = await active.locator('p').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)); assert.ok(titleFont>=14,titleFont);
    await search.fill('找不到的系列'); await center.getByText('找不到符合條件的 BOM 系列',{exact:true}).waitFor();
    await search.fill(''); await active.waitFor();
    const archive = center.getByTestId('bom-archive-section').getByRole('button',{name:/已封存/}).first();
    await archive.tap(); await list.getByRole('button',{name:/已封存_工程驗證板/}).waitFor();
    await archive.tap(); assert.equal(await list.getByRole('button',{name:/已封存_工程驗證板/}).count(),0);
    await list.getByRole('button',{name:/上傳 BOM/}).tap(); assert.ok((await calls(page)).some(call=>call.name==='uploadNew'));
    await list.locator('.bom-series-groups').evaluate(el=>el.scrollTop=0); await page.screenshot({path:path.join(evidence,`series-${width}.png`)});
    await list.getByRole('button',{name:/超長系列名稱/}).tap();
    const detail=center.getByTestId('bom-series-detail'); await detail.waitFor();
    assert.ok((await detail.getByRole('heading',{level:3}).innerText()).includes('超長系列名稱'));
    if(width<1024) { await detail.getByRole('button',{name:'返回清單',exact:true}).tap(); await list.waitFor(); }
    await active.tap(); await detail.waitFor();
    await detail.getByRole('button',{name:'上傳新版本',exact:true}).tap(); assert.ok((await calls(page)).some(call=>call.name==='uploadVersion'&&call.args[0]==='rack'));
    await detail.getByRole('button',{name:'修改系列名稱',exact:true}).tap(); await detail.getByRole('textbox',{name:'系列名稱',exact:true}).fill('暫存取消名稱');
    await detail.getByRole('button',{name:'取消',exact:true}).tap(); assert.equal((await calls(page)).some(call=>call.name==='rename'),false);
    await detail.getByRole('button',{name:'修改系列名稱',exact:true}).tap(); await detail.getByRole('textbox',{name:'系列名稱',exact:true}).fill('QA 已更新系列名稱');
    await detail.getByRole('button',{name:'儲存名稱',exact:true}).tap(); await detail.getByRole('heading',{name:'QA 已更新系列名稱',exact:true}).waitFor();
    const row = detail.getByTestId('bom-version-table').locator('tr[data-version-id]').first();
    await row.getByRole('button',{name:'編輯說明',exact:true}).tap();
    await detail.getByLabel('版本標籤',{exact:true}).fill('取消的標籤'); await detail.getByRole('button',{name:'取消',exact:true}).tap();
    assert.equal((await calls(page)).some(call=>call.name==='editVersion'),false);
    await row.getByRole('button',{name:'編輯說明',exact:true}).tap();
    await detail.getByLabel('版本標籤',{exact:true}).fill('QA 版次說明'); await detail.getByLabel('版本說明',{exact:true}).fill('保留原本儲存 callback');
    await detail.getByRole('button',{name:'儲存',exact:true}).tap();
    await page.waitForFunction(()=>window.__bomUiFixture.calls.some(call=>call.name==='editVersion'));
    assert.ok((await calls(page)).some(call=>call.name==='editVersion'&&call.args[2].label==='QA 版次說明'));
    await row.getByRole('button',{name:'頁數',exact:true}).tap(); assert.ok((await calls(page)).some(call=>call.name==='pages'));
    await detail.getByRole('button',{name:'比對版本',exact:true}).tap(); await center.getByTestId('bom-diff-view').waitFor(); await center.getByTestId('bom-diff-summary').waitFor();
    await center.getByRole('button',{name:'← 返回系列',exact:true}).tap(); await detail.waitFor();
    assert.equal((await calls(page)).filter(call=>call.name==='loadRecords').length,2);
    const table=detail.getByTestId('bom-version-table'); await table.evaluate(el=>el.parentElement.scrollLeft=0);
    await assertFrame(page,center,width,884); await page.screenshot({path:path.join(evidence,`detail-${width}.png`)});
    await page.setViewportSize({width,height:500}); await page.waitForFunction(()=>{const box=document.querySelector('[data-testid="bom-version-center"]').getBoundingClientRect();return box.height<=innerHeight&&box.y>=0;}); await assertFrame(page,center,width,500);
    await detail.getByRole('button',{name:'上傳新版本',exact:true}).scrollIntoViewIfNeeded(); await detail.getByRole('button',{name:'上傳新版本',exact:true}).tap();
    if(width<1024) {
      const tableSize=await detail.locator('.bom-version-table-scroll').evaluate(el=>({height:el.clientHeight,basis:getComputedStyle(el).flexBasis}));
      assert.ok(tableSize.height>=180,JSON.stringify(tableSize)); assert.equal(tableSize.basis,'200px');
      const before=(await calls(page)).filter(call=>call.name==='pages').length;
      await row.getByRole('button',{name:'頁數',exact:true}).scrollIntoViewIfNeeded(); await row.getByRole('button',{name:'頁數',exact:true}).tap();
      assert.equal((await calls(page)).filter(call=>call.name==='pages').length,before+1,'short phone can scroll to a version action');
    }
    await page.screenshot({path:path.join(evidence,`short-${width}.png`)});
    await center.locator('[data-ui="dialog-close"]').tap(); await center.waitFor({state:'hidden'});
    assert.deepEqual(errors,[]);
    return {width,result:'passed',checks:['near-full-screen bounds','readable and distinct selected series','search and archive reveal','long names and phone back','upload callbacks','rename and version edit save/cancel','page tracker callback','diff open and return','short viewport controls','no dialog horizontal overflow']};
  } catch(error) { await page.screenshot({path:path.join(evidence,`failure-${width}.png`)}).catch(()=>{}); throw error; }
  finally { await context.close(); }
}
(async()=>{
  fs.mkdirSync(evidence,{recursive:true}); const {createServer}=await import('vite'); let server,browser;
  const report={result:'running',checks:[]};
  try {
    server=await createServer({configFile:false,root:process.cwd(),cacheDir:path.join(evidence,'.vite'),resolve:{alias:{'@':path.resolve('src')}},optimizeDeps:{entries:['tests/support/bomVersionUiFixture.jsx'],include:['react/jsx-dev-runtime']},server:{host:'127.0.0.1',port:0},plugins:[{name:'bom-ui-local-fixture',configureServer(vite){vite.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]!=='/')return next();res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/bomVersionUiFixture.jsx"></script></html>');});}}]});
    await server.listen(); const origin='http://127.0.0.1:'+server.httpServer.address().port; browser=await chromium.launch({channel:'chrome'});
    for(const width of [1440,1180,390,536]) report.checks.push(await run(browser,origin,width));
    report.result='passed'; console.log('BOM version UI verified at1440/1180/390/536 with isolated callbacks');
  } catch(error) { report.result='failed';report.error=error.stack;throw error; }
  finally {fs.writeFileSync(path.join(evidence,'browser-report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();if(server)await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
