// First use of 線路修改: real entry, dialog and hook; all data and image requests stay in the local fixture.
// A user who has recorded nothing must be able to start typing and adding pictures without setting anything up first.
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
  const pdfStorageMock = path.resolve('tests/support/circuitChangesPdfStorageMock.js');
  const supabaseMock = path.resolve('tests/support/circuitChangesSupabaseMock.js');
  let server, browser, context, page;
  try {
    server = await createServer({configFile:false, root:process.cwd(), cacheDir:path.join(evidence,'vite-cache'), resolve:{alias:[
      {find:/^@\/(components\/auth\/UserContext|hooks\/usePermissions|components\/test-projects\/TestProjectProvider)$/, replacement:materialMock},
      {find:'@/integrations/supabase/client', replacement:supabaseMock},
      {find:/^\.\/(materialBomStorage|useMaterialBomPresence|materialRequestAudit)$/, replacement:materialMock},
      {find:'@', replacement:path.resolve('src')},
    ]}, worker:{format:'es'}, optimizeDeps:{entries:['tests/support/circuitChangesFixture.jsx'], include:['react/jsx-dev-runtime','exceljs']}, server:{host:'127.0.0.1',port:0}, plugins:[
      {name:'circuit-onboarding-storage', enforce:'pre', resolveId(source, importer){const own = importer?.replaceAll('\\','/').includes('/circuit-changes/'); if(own && source === './storage') return storageMock; if(own && source === './pdfStorage') return pdfStorageMock; if(own && source === './officialPdfStorage') return path.resolve('tests/support/circuitPdfOfficialMock.js');}},
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
      const phone = width < 1024, ownBatch = width === 390;
      await fetch(origin + '/__circuit/control', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'reset'})});
      context = await browser.newContext({viewport:{width,height:884},deviceScaleFactor:1,isMobile:phone,hasTouch:true,reducedMotion:'reduce',locale:'zh-TW'});
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      page = await context.newPage(); const errors=[]; page.on('pageerror',error=>errors.push(error.message)); page.setDefaultTimeout(25000);
      await page.goto(origin + '/?qaMainRows&qaPages&qaUser=A');
      await page.getByTestId('material-table-card').waitFor();
      if(phone) { await page.getByRole('button',{name:'排序與工具',exact:true}).tap(); await page.getByTestId('material-mobile-tools').waitFor(); }
      await page.getByTestId('material-circuit-changes').filter({visible:true}).tap();
      const dialog=page.getByTestId('circuit-changes-dialog'), guide=page.getByTestId('circuit-usage-guide');
      await dialog.waitFor();
      // 1. The form and a place for pictures are on screen straight away; none of this has written anything.
      const title=dialog.getByRole('textbox',{name:'修改標題',exact:true}); await title.waitFor();
      const addBefore=dialog.getByRole('button',{name:'加入修改前圖片',exact:true});
      await addBefore.scrollIntoViewIfNeeded();
      const target=await addBefore.boundingBox();
      assert.ok(await addBefore.isVisible() && target && target.height>=100 && target.width>=Math.min(width,320)-80, 'the picture target is a large, visible area');
      if(!phone) assert.ok(await dialog.getByRole('button',{name:'加入修改後圖片',exact:true}).isVisible(), 'before and after sit side by side');
      assert.ok((await dialog.locator('.circuit-image-column[data-side="before"]').innerText()).includes('貼上會加到這裡'));
      assert.equal((await addBefore.innerText()).includes('Ctrl+V'), !phone, 'a phone is not told to press Ctrl+V or drag');
      assert.equal(await dialog.getByRole('button',{name:/批次|新增修改/}).filter({visible:true}).count(), phone ? 0 : 2, 'one button per action, not several names for the same form');
      const initialState=await state(origin);
      assert.equal(initialState.sets.length+initialState.items.length, 0);
      await page.screenshot({path:path.join(evidence,`first-open-${width}.png`)});
      // 2. The guide opens and closes without creating data.
      await dialog.getByRole('button',{name:'使用說明',exact:true}).tap();
      await guide.getByRole('heading',{name:'線路修改怎麼用',exact:true}).waitFor();
      assert.ok((await guide.innerText()).includes('Review'));
      await page.screenshot({path:path.join(evidence,`guide-${width}.png`)});
      await guide.getByRole('button',{name:'關閉使用說明',exact:true}).tap(); await guide.waitFor({state:'hidden'});
      assert.equal((await state(origin)).sets.length, 0); assert.equal((await state(origin)).items.length, 0);
      const batch=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'建立改版紀錄',exact:true})});
      if(phone) { await dialog.getByRole('button',{name:'返回修改清單',exact:true}).tap(); await dialog.getByTestId('circuit-change-unsaved').waitFor(); }
      // 3. Naming a batch is optional: the form can be cancelled, or submitted with Enter.
      await dialog.getByRole('button',{name:'開始另一次改版',exact:true}).tap();
      await batch.waitFor();
      const batchName=batch.getByRole('textbox',{name:'改版紀錄名稱',exact:true});
      assert.equal(await batchName.inputValue(),'V2 → V3 線路修改','the batch name is filled in from the version on screen');
      assert.equal(await batch.getByRole('textbox',{name:'修改前版次',exact:true}).inputValue(),'V2');
      assert.equal(await batch.getByRole('textbox',{name:'修改後版次',exact:true}).inputValue(),'V3');
      if(phone) {
        await page.setViewportSize({width,height:500});
        await batchName.focus();
        assert.ok(await batchName.evaluate(input=>document.activeElement===input && parseFloat(getComputedStyle(input).fontSize)>=16));
        await batch.getByRole('button',{name:'建立改版紀錄',exact:true}).scrollIntoViewIfNeeded();
        const createBox=await batch.getByRole('button',{name:'建立改版紀錄',exact:true}).boundingBox();
        assert.ok(createBox && createBox.height>=40 && createBox.y+createBox.height<=501);
        await page.setViewportSize({width,height:884});
      }
      if(ownBatch) {
        await batchName.fill('QA 自訂批次 ' + width);
        await batchName.press('Enter'); await batch.waitFor({state:'hidden'});
        assert.equal((await state(origin)).sets.length,1); assert.equal((await state(origin)).items.length,0);
      } else {
        await batch.getByRole('button',{name:'取消',exact:true}).tap(); await batch.waitFor({state:'hidden'});
        assert.equal((await state(origin)).sets.length,0);
      }
      if(phone) await dialog.getByTestId('circuit-change-unsaved').tap();
      // 4. Typing is all it takes: the change is created, and so is its batch when the user did not make one.
      await title.fill('QA 這筆草稿不因操作說明消失');
      await page.waitForFunction(()=>document.querySelector('.circuit-detail-footer [role="status"]')?.textContent==='已儲存');
      const created=await state(origin);
      assert.equal(created.sets.length,1); assert.equal(created.items.length,1);
      assert.equal(created.sets[0].title, ownBatch ? 'QA 自訂批次 ' + width : 'V2 → V3 線路修改');
      assert.equal(created.items[0].setId, created.sets[0].id); assert.equal(created.items[0].number,1);
      assert.ok((await dialog.locator('.circuit-next-step').innerText()).includes('修改說明或修改後圖片'), 'what is still missing before review is spelled out');
      assert.equal(await dialog.getByRole('button',{name:'送出 Review',exact:true}).isDisabled(), true);
      // 5. The guide keeps the draft, and its last section and button stay reachable on a short screen.
      await dialog.getByRole('button',{name:'使用說明',exact:true}).tap(); await guide.waitFor();
      if(phone) await page.setViewportSize({width,height:500});
      const lastSection=guide.locator('.circuit-guide-scroll > section').last();
      await lastSection.scrollIntoViewIfNeeded();
      const lastBox=await lastSection.boundingBox(), footerBox=await guide.locator('.circuit-guide-footer').boundingBox();
      assert.ok(lastBox && footerBox && lastBox.y+lastBox.height<=footerBox.y+1);
      assert.ok(await guide.locator('.circuit-guide-scroll').evaluate(body=>body.scrollWidth<=body.clientWidth+1));
      if(phone) await page.screenshot({path:path.join(evidence,`guide-short-${width}.png`)});
      const understood=guide.getByRole('button',{name:'知道了',exact:true});
      await understood.scrollIntoViewIfNeeded();
      const box=await understood.boundingBox(); assert.ok(box && box.height>=40 && box.y+box.height<= (phone?501:885));
      await understood.tap(); await guide.waitFor({state:'hidden'});
      if(phone) await page.setViewportSize({width,height:884});
      assert.equal(await title.inputValue(),'QA 這筆草稿不因操作說明消失');
      if(phone) {
        await page.setViewportSize({width,height:500}); await title.focus();
        assert.ok(await title.evaluate(input=>document.activeElement===input && parseFloat(getComputedStyle(input).fontSize)>=16));
        const footer=await dialog.locator('.circuit-detail-footer').boundingBox();
        assert.ok(footer && footer.y+footer.height<=501);
        await page.setViewportSize({width,height:884});
      }
      // 6. Once the description is there the change can be sent, and nothing overflows sideways.
      await dialog.getByRole('textbox',{name:'修改說明',exact:true}).fill('上拉電阻改為 4.7K');
      await page.waitForFunction(()=>document.querySelector('.circuit-detail-footer [role="status"]')?.textContent==='已儲存');
      assert.equal(await dialog.getByRole('button',{name:'送出 Review',exact:true}).isEnabled(), true);
      assert.equal((await state(origin)).items.length,1);
      // 7. Pictures: two pasted screenshots become before and after without choosing anything; a phone picks files into the open tab.
      const paneCount=(side,count)=>page.waitForFunction(({side,count})=>document.querySelector(`.circuit-image-column[data-side="${side}"]`)?.dataset.imageCount===String(count),{side,count});
      const shot=()=>page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,320,180);c.fillStyle='#111';c.fillRect(40,60,120,40);return canvas.toDataURL('image/png').split(',')[1];});
      if(phone) {
        const chooser=page.waitForEvent('filechooser');
        await dialog.getByRole('button',{name:'加入修改前圖片',exact:true}).tap();
        await (await chooser).setFiles([{name:'phone-before.png',mimeType:'image/png',buffer:Buffer.from(await shot(),'base64')}]);
        await paneCount('before',1);
        assert.equal(await dialog.locator('.circuit-image-columns').getAttribute('data-mobile-side'),'before','the tab stays on the picture that was just added');
        assert.ok(await dialog.getByRole('button',{name:'放大圖片 phone-before.png',exact:true}).isVisible());
      } else {
        const paste=async name=>page.evaluate(({base64,name})=>{
          const data=new DataTransfer();data.items.add(new File([Uint8Array.from(atob(base64),char=>char.charCodeAt(0))],name,{type:'image/png'}));
          document.querySelector('[data-testid="circuit-changes-dialog"]').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
        },{base64:await shot(),name});
        await paste('before-shot.png'); await paneCount('before',1);
        await page.waitForFunction(()=>document.querySelector('.circuit-image-column[data-side="after"]')?.dataset.active==='true');
        await paste('after-shot.png'); await paneCount('after',1);
      }
      await page.waitForFunction(()=>document.querySelector('.circuit-detail-footer [role="status"]')?.textContent==='已儲存');
      assert.deepEqual((await state(origin)).items[0].content.images.map(image=>[image.name,image.side]), phone ? [['phone-before.png','before']] : [['before-shot.png','before'],['after-shot.png','after']]);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
      await page.screenshot({path:path.join(evidence,`first-item-${width}.png`)});
      if(phone) { await dialog.getByRole('button',{name:'返回修改清單',exact:true}).tap(); await dialog.getByTestId('circuit-change-item').waitFor(); }
      await dialog.getByRole('button',{name:'關閉線路修改',exact:true}).tap(); await dialog.waitFor({state:'hidden'});
      assert.deepEqual(errors,[]);
      report.checks.push({width,result:'passed',checks:['first open shows the form and a large picture target without writing','one button per action','help opens/closes without creating data','batch form is prefilled and optional', ownBatch ? 'Enter creates the custom batch and the first change goes into it' : 'typing creates the change and its default batch','missing content is named and review stays disabled until it is there', phone ? 'a picked file lands in the open tab and stays on screen' : 'two pasted screenshots become before and after without choosing a target','help preserves draft','guide last section and footer reachable',...(phone ? ['short viewport form focus and create reachable','short viewport guide scroll and footer reachable','focused editor keeps footer visible'] : []),'no horizontal overflow','return and close work']});
      await context.close(); context=null;
    }
    report.result='passed'; console.log('Circuit changes first-use workflow passed at 1440/390/536');
  } catch(error) { report.result='failed'; report.error=error.stack; if(page) await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{}); throw error; }
  finally { fs.writeFileSync(path.join(evidence,'browser-report.json'),JSON.stringify(report,null,2)); if(context) await context.close().catch(()=>{}); if(browser) await browser.close(); fixture.close(); if(server) await server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
