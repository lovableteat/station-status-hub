// Real entry, dialog and hook; all data and image requests stay in the local fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {chromium} = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const {createCircuitChangesServer} = require('./support/circuitChangesServer.cjs');
const evidence = path.resolve(process.env.CIRCUIT_EVIDENCE_DIR || '../circuit-change-onboarding-evidence');
const state = async origin => (await fetch(origin + '/__circuit/state')).json();

(async () => {
  fs.mkdirSync(evidence, {recursive:true});
  const fixture = createCircuitChangesServer(), report = {result:'running', checks:[]};
  const {createServer} = await import('vite');
  const materialMock = path.resolve('tests/support/materialWorkspaceMock.js');
  const storageMock = path.resolve('tests/support/circuitChangesStorageMock.js');
  const supabaseMock = path.resolve('tests/support/circuitChangesSupabaseMock.js');
  let server, browser, context, page;
  try {
    server = await createServer({configFile:false, root:process.cwd(), cacheDir:path.join(evidence,'vite-cache'), resolve:{alias:[
      {find:/^@\/(components\/auth\/UserContext|hooks\/usePermissions|components\/test-projects\/TestProjectProvider)$/, replacement:materialMock},
      {find:'@/integrations/supabase/client', replacement:supabaseMock},
      {find:/^\.\/(materialBomStorage|useMaterialBomPresence|materialRequestAudit)$/, replacement:materialMock},
      {find:'@', replacement:path.resolve('src')},
    ]}, worker:{format:'es'}, optimizeDeps:{entries:['tests/support/circuitChangesFixture.jsx'], include:['react/jsx-dev-runtime','exceljs']}, server:{host:'127.0.0.1',port:0}, plugins:[
      {name:'circuit-onboarding-storage', enforce:'pre', resolveId(source, importer){if(source === './storage' && importer?.replaceAll('\\','/').includes('/circuit-changes/')) return storageMock;}},
      {name:'circuit-onboarding-http', configureServer(vite){vite.middlewares.use(fixture.middleware); vite.middlewares.use((req,res,next) => {
        if(req.url?.split('?')[0] !== '/') return next();
        res.setHeader('Content-Type','text/html; charset=utf-8');
        res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><title>線路修改操作說明驗證</title><div id="root"></div><script type="module" src="/tests/support/circuitChangesFixture.jsx"></script></html>');
      });}},
    ]});
    await server.listen();
    const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
    browser = await chromium.launch({channel:'chrome'});
    for(const width of [1440,390,536]) {
      await fetch(origin + '/__circuit/control', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'reset'})});
      context = await browser.newContext({viewport:{width,height:884},deviceScaleFactor:1,isMobile:width<1024,hasTouch:true,reducedMotion:'reduce',locale:'zh-TW'});
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      page = await context.newPage(); const errors=[]; page.on('pageerror',error=>errors.push(error.message)); page.setDefaultTimeout(25000);
      await page.goto(origin + '/?qaMainRows&qaPages&qaUser=A');
      await page.getByTestId('material-table-card').waitFor();
      if(width<1024) { await page.getByRole('button',{name:'排序與工具',exact:true}).tap(); await page.getByTestId('material-mobile-tools').waitFor(); }
      await page.getByTestId('material-circuit-changes').filter({visible:true}).tap();
      const dialog=page.getByTestId('circuit-changes-dialog'), guide=page.getByTestId('circuit-usage-guide');
      await dialog.waitFor();
      const initialState=await state(origin);
      await dialog.getByRole('button',{name:'使用說明',exact:true}).tap();
      await guide.getByRole('heading',{name:'線路修改怎麼用',exact:true}).waitFor();
      assert.ok((await guide.innerText()).includes('Review'));
      await page.screenshot({path:path.join(evidence,`guide-${width}.png`)});
      await guide.getByRole('button',{name:'關閉使用說明',exact:true}).tap(); await guide.waitFor({state:'hidden'});
      assert.equal((await state(origin)).sets.length, initialState.sets.length);
      assert.equal((await state(origin)).items.length, initialState.items.length);
      await dialog.getByRole('button',{name:'開始新增修改',exact:true}).tap();
      const batch=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'新增改版批次',exact:true})});
      await batch.waitFor(); await batch.getByRole('button',{name:'取消',exact:true}).tap(); await batch.waitFor({state:'hidden'});
      await dialog.getByRole('button',{name:'新增批次',exact:true}).tap();
      await batch.waitFor(); await batch.getByRole('button',{name:'取消',exact:true}).tap(); await batch.waitFor({state:'hidden'});
      const create=dialog.getByRole('button',{name:'建立改版批次',exact:true}).filter({visible:true});
      assert.equal(await create.count(),1);
      await page.screenshot({path:path.join(evidence,`empty-${width}.png`)});
      await create.tap(); await batch.waitFor();
      await batch.getByRole('textbox',{name:'改版批次名稱',exact:true}).fill('QA 初次建立批次 ' + width);
      await batch.getByRole('textbox',{name:'修改前版次',exact:true}).fill('V1');
      await batch.getByRole('textbox',{name:'修改後版次',exact:true}).fill('V2');
      if(width<1024) {
        await page.setViewportSize({width,height:500});
        await batch.getByRole('textbox',{name:'改版批次名稱',exact:true}).focus();
        assert.ok(await batch.getByRole('textbox',{name:'改版批次名稱',exact:true}).evaluate(input=>document.activeElement===input && parseFloat(getComputedStyle(input).fontSize)>=16));
        await batch.getByRole('button',{name:'建立批次',exact:true}).scrollIntoViewIfNeeded();
        const createBox=await batch.getByRole('button',{name:'建立批次',exact:true}).boundingBox();
        assert.ok(createBox && createBox.height>=40 && createBox.y+createBox.height<=501);
      }
      await batch.getByRole('button',{name:'建立批次',exact:true}).tap(); await batch.waitFor({state:'hidden'});
      if(width<1024) await page.setViewportSize({width,height:884});
      await dialog.getByRole('button',{name:'新增第一項修改',exact:true}).filter({visible:true}).tap();
      const title=dialog.getByRole('textbox',{name:'修改標題',exact:true}); await title.waitFor();
      await dialog.locator('.circuit-entry-hint').waitFor();
      assert.ok((await dialog.locator('.circuit-entry-hint').innerText()).includes('送出 Review'));
      await title.fill('QA 這筆草稿不因操作說明消失');
      await dialog.getByRole('button',{name:'使用說明',exact:true}).tap(); await guide.waitFor();
      if(width<1024) await page.setViewportSize({width,height:500});
      const lastSection=guide.locator('.circuit-guide-scroll > section').last();
      await lastSection.scrollIntoViewIfNeeded();
      const lastBox=await lastSection.boundingBox(), footerBox=await guide.locator('.circuit-guide-footer').boundingBox();
      assert.ok(lastBox && footerBox && lastBox.y+lastBox.height<=footerBox.y+1);
      assert.ok(await guide.locator('.circuit-guide-scroll').evaluate(body=>body.scrollWidth<=body.clientWidth+1));
      if(width<1024) await page.screenshot({path:path.join(evidence,`guide-short-${width}.png`)});
      const understood=guide.getByRole('button',{name:'知道了',exact:true});
      await understood.scrollIntoViewIfNeeded();
      const box=await understood.boundingBox(); assert.ok(box && box.height>=40 && box.y+box.height<= (width<1024?501:885));
      await understood.tap(); await guide.waitFor({state:'hidden'});
      if(width<1024) await page.setViewportSize({width,height:884});
      assert.equal(await title.inputValue(),'QA 這筆草稿不因操作說明消失');
      await page.waitForFunction(()=>document.querySelector('.circuit-detail-footer [role="status"]')?.textContent==='已儲存');
      if(width<1024) {
        await page.setViewportSize({width,height:500}); await title.focus();
        assert.ok(await title.evaluate(input=>document.activeElement===input && parseFloat(getComputedStyle(input).fontSize)>=16));
        const footer=await dialog.locator('.circuit-detail-footer').boundingBox();
        assert.ok(footer && footer.y+footer.height<=501);
        await page.setViewportSize({width,height:884});
      }
      assert.equal((await state(origin)).sets.length,1); assert.equal((await state(origin)).items.length,1);
      assert.ok(await dialog.getByRole('button',{name:'加入圖片',exact:true}).isVisible());
      assert.ok(await dialog.getByRole('button',{name:'送出 Review',exact:true}).isVisible());
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
      await page.screenshot({path:path.join(evidence,`first-item-${width}.png`)});
      if(width<1024) { await dialog.getByRole('button',{name:'返回修改清單',exact:true}).tap(); await dialog.getByTestId('circuit-change-item').waitFor(); }
      await dialog.getByRole('button',{name:'關閉線路修改',exact:true}).tap(); await dialog.waitFor({state:'hidden'});
      assert.deepEqual(errors,[]);
      report.checks.push({width,result:'passed',checks:['help opens/closes without creating data','start and batch actions open form and cancel returns','empty-state CTA creates batch and first item','step guidance visible','help preserves draft','guide last section and footer reachable',...(width<1024 ? ['short viewport form focus and create reachable','short viewport guide scroll and footer reachable','focused editor keeps footer visible'] : []),'no horizontal overflow','return and close work']});
      await context.close(); context=null;
    }
    report.result='passed'; console.log('Circuit changes onboarding workflow passed at 1440/390/536');
  } catch(error) { report.result='failed'; report.error=error.stack; if(page) await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{}); throw error; }
  finally { fs.writeFileSync(path.join(evidence,'browser-report.json'),JSON.stringify(report,null,2)); if(context) await context.close().catch(()=>{}); if(browser) await browser.close(); fixture.close(); if(server) await server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
