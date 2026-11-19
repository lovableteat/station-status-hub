// 失敗紀錄 in a real browser: the real comparison engine fails on a BOM it cannot read, the page explains it and the
// record reaches the (stand-in) backend; a dropped connection keeps the record on this computer and sends it later.
// Run by hand: AUDIT_QA_DIR=<folder with playwright> node tests/comparisonFailureLog.browser.cjs
// The engine is downloaded from cdn.jsdelivr.net / PyPI, as on the site.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(process.env.AUDIT_QA_DIR||'../qa-tools','package.json'))('playwright');
const evidence=path.resolve(process.env.COMPARISON_FAILURE_EVIDENCE_DIR||'../comparison-failure-log-evidence');
const fixtures=path.resolve('tests/comparison/fixtures');
const ORCAD=['Cover Page  Revised: Monday, October 19, 2026','QA BOARD          Revision: 1.0','','Bill Of Materials         October 19,2026      10:22:33\tPage1','','Item\tQuantity\tReference\tPart','______________________________________________','','1\t1\tC1\t1uF 6.3V','2\t1\tU1\tTMP451','3\t2\tR1,R2\t2.2Kohm'].join('\r\n');
const utf16=text=>Buffer.concat([Buffer.from([0xFF,0xFE]),Buffer.from(text,'utf16le')]);

/** Two input folders: A with a BOM saved as UTF-16 (the engine cannot read it), B complete. */
function inputs() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'comparison-failure-'));
  for(const side of['A','B']){fs.mkdirSync(path.join(root,side));for(const name of['pstxnet.dat','pstxprt.dat','pstchip.dat'])fs.copyFileSync(path.join(fixtures,side,name),path.join(root,side,name));fs.copyFileSync(path.join(fixtures,'B','schematic.pdf'),path.join(root,side,'schematic.pdf'));}
  fs.writeFileSync(path.join(root,'A','QA_BOARD_20261019.BOM'),utf16(ORCAD));
  fs.copyFileSync(path.join(fixtures,'B','bom.csv'),path.join(root,'B','bom.csv'));
  return root;
}
const qa=(page,change)=>page.evaluate(change);
const notice=page=>page.getByTestId('comparison-failure');
async function ready(page){await page.waitForSelector('[data-comparison-workspace="true"]',{timeout:120000});await page.waitForFunction(()=>!document.querySelector('.comparison-loading'),null,{timeout:60000});await page.waitForTimeout(500);}
async function fail(page,root,name){
  await page.locator('input[aria-label="選取 A 版資料夾"]').setInputFiles(path.join(root,'A'));
  await page.locator('input[aria-label="選取 B 版資料夾"]').setInputFiles(path.join(root,'B'));
  await page.fill('#comparison-project',name);
  await page.locator('[data-testid="comparison-run"], .comparison-run-actions > button').first().click();
  await notice(page).waitFor({timeout:600000});
  await page.waitForFunction(()=>!document.querySelector('.comparison-progress'),null,{timeout:60000});
}

(async()=>{
  fs.mkdirSync(evidence,{recursive:true});
  const{createServer}=await import('vite');const mock=path.resolve('tests/support/comparisonFailureMock.ts');
  const server=await createServer({configFile:false,root:process.cwd(),cacheDir:path.join(evidence,'.vite'),
    resolve:{alias:[{find:'@/integrations/supabase/client',replacement:mock},{find:'@/components/auth/UserContext',replacement:mock},{find:'@/hooks/usePermissions',replacement:mock},{find:'@',replacement:path.resolve('src')}]},
    optimizeDeps:{entries:['tests/support/comparisonFailureFixture.jsx'],include:['react/jsx-dev-runtime','xlsx']},worker:{format:'es'},
    server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd(),evidence,fs.realpathSync('node_modules')]}},
    plugins:[{name:'comparison-failure-fixture',configureServer(vite){vite.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]!=='/')return next();res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-Hant" class="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/comparisonFailureFixture.jsx"></script></html>')})}}]});
  let browser;const root=inputs(),results={};
  try{
    await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
    browser=await chromium.launch({channel:'chrome'});
    for(const width of[1440,390]){
      const context=await browser.newContext({viewport:{width,height:900},isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce'});
      await context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Browser error:',error.message)});
      await page.goto(origin+'/?role=admin');await ready(page);

      // 1. A real engine failure: explained in words, the file's start shown, the record in the backend.
      await fail(page,root,`失敗紀錄測試 ${width}`);
      const panel=notice(page);
      // The notice is brought to the user: on a phone the run button is far below it.
      await page.waitForFunction(()=>{const top=document.querySelector('#comparison-failure-title')?.getBoundingClientRect().top??-1;return top>=0&&top<window.innerHeight*0.6;},null,{timeout:10000});
      assert.equal(await panel.getByRole('heading').innerText(),'比對沒有完成：BOM「QA_BOARD_20261019.BOM」讀不出表頭');
      const text=await panel.innerText();
      assert.match(text,/這份檔案是 UTF-16 編碼/);
      assert.match(text,/請另存成 UTF-8 或 ANSI 再試/);
      assert.match(text,/內容本身的表頭在第 6 行，寫法符合引擎的規則/);
      assert.match(await panel.locator('.comparison-failure-file pre').innerText(),/6│Item ⇥ Quantity ⇥ Reference ⇥ Part/);
      await panel.locator('.comparison-failure-record[data-state="saved"]').waitFor({timeout:20000});
      assert.match(await panel.locator('.comparison-failure-record').innerText(),/已記到後台（編號 [0-9a-f]{8}）.*意見收集 → 回報管理/);
      assert.equal(await page.locator('.comparison-alert').count(),0,'the raw traceback is not dumped on the page');
      let state=await qa(page,()=>({rows:window.__failureQA.rows,left:localStorage.getItem('comparison-failure-log:11111111-1111-4111-8111-111111111111')}));
      assert.equal(state.rows.length,1);assert.equal(state.left,null,'nothing waits on this computer once the backend has it');
      const row=state.rows[0];
      assert.equal(row.is_submitted,true);assert.equal(row.category,'bug');assert.equal(row.comparison_tab,'compare');assert.equal(row.project_name,`失敗紀錄測試 ${width}`);
      assert.equal(row.title,'【失敗紀錄】比對：BOM「QA_BOARD_20261019.BOM」讀不出表頭');
      assert.match(row.description,/^自動失敗紀錄｜比對｜\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d（台北時間）\n原因：BOM「QA_BOARD_20261019\.BOM」讀不出表頭\n引擎訊息：ValueError: BOM header not recognised in QA_BOARD_20261019\.BOM/);
      assert.match(row.description,/處理位置：這台電腦的瀏覽器\n比對名稱：失敗紀錄測試 \d+｜A=EVT → B=DVT/);
      assert.match(row.description,/▍A A\/QA_BOARD_20261019\.BOM｜[\d.]+ B｜文字檔（UTF-16，Tab 分隔）/);
      assert.match(row.description,/這次交給引擎的檔案（10 份）：/);
      assert.match(row.description,/引擎位置：parsers\/bom_erp\.py:\d+ parse_bom/);
      assert.match(row.description,/原始訊息（結尾）：[\s\S]*Traceback|原始訊息（結尾）：[\s\S]*ValueError/);
      assert.deepEqual(Object.keys(row.page_context).sort(),['browser','height','revisionA','revisionB','width']);
      assert.equal(row.page_context.revisionA,'EVT');
      await panel.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,`failure-${width}.png`)});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)<=0,true,'no sideways scroll of the page');

      // 2. The controls of the notice.
      const copy=panel.getByRole('button',{name:'複製紀錄',exact:true});
      if(width<768){const box=await copy.boundingBox();assert.ok(box.height>=44,'the copy button is a full touch target on a phone');}
      await copy.click();
      await panel.getByRole('button',{name:'已複製',exact:true}).waitFor();
      const clip=await page.evaluate(()=>navigator.clipboard.readText());
      assert.match(clip,/自動失敗紀錄｜比對/);assert.match(clip,/Traceback \(most recent call last\)/);
      const raw=panel.locator('.comparison-failure-raw');
      assert.equal(await raw.evaluate(node=>node.open),false);
      await raw.locator('summary').click();
      assert.match(await raw.locator('pre').innerText(),/Traceback \(most recent call last\)[\s\S]*ValueError: BOM header not recognised/);
      await page.screenshot({path:path.join(evidence,`failure-raw-${width}.png`)});
      await panel.getByRole('button',{name:'關閉失敗訊息',exact:true}).click();
      assert.equal(await notice(page).count(),0);
      assert.equal((await qa(page,()=>window.__failureQA.rows.length)),1,'closing the notice does not remove the record');

      // 3. The backend cannot be reached: the record waits on this computer and goes out when the connection is back.
      await qa(page,()=>{window.__failureQA.offline=true;});
      await page.locator('[data-testid="comparison-run"], .comparison-run-actions > button').first().click();
      await notice(page).waitFor({timeout:600000});
      await notice(page).locator('.comparison-failure-record[data-state="queued"]').waitFor({timeout:20000});
      assert.match(await notice(page).locator('.comparison-failure-record').innerText(),/還沒送到後台.*自動補送/);
      state=await qa(page,()=>({rows:window.__failureQA.rows.length,left:JSON.parse(localStorage.getItem('comparison-failure-log:11111111-1111-4111-8111-111111111111')||'[]').length}));
      assert.deepEqual(state,{rows:1,left:1});
      await page.screenshot({path:path.join(evidence,`failure-queued-${width}.png`)});
      await qa(page,()=>{window.__failureQA.offline=false;window.dispatchEvent(new Event('online'));});
      await page.waitForFunction(()=>window.__failureQA.rows.filter(row=>row.is_submitted).length===2,null,{timeout:20000});
      await page.waitForFunction(()=>localStorage.getItem('comparison-failure-log:11111111-1111-4111-8111-111111111111')===null,null,{timeout:20000});

      // 4. A record the backend refuses says so and points at 複製紀錄; it is not shown as saved.
      await qa(page,()=>{window.__failureQA.refuse='回報內容格式不正確';});
      await page.locator('[data-testid="comparison-run"], .comparison-run-actions > button').first().click();
      await notice(page).waitFor({timeout:600000});
      await notice(page).locator('.comparison-failure-record:not([data-state="sending"])').waitFor({timeout:20000});
      assert.match(await notice(page).locator('.comparison-failure-record').innerText(),/回報內容格式不正確/);
      assert.notEqual(await notice(page).locator('.comparison-failure-record').getAttribute('data-state'),'saved');
      await qa(page,()=>{window.__failureQA.refuse='';localStorage.clear();});

      // 5. The administrator finds the records in 意見收集 → 回報管理, with the number of open ones on the button.
      await page.reload();await ready(page);
      const trigger=width<768?null:page.getByRole('button',{name:/意見收集/});
      if(trigger){
        await page.waitForFunction(()=>document.querySelector('.comparison-feedback-count')?.textContent==='2',null,{timeout:20000});
        assert.match(await trigger.getAttribute('title'),/有 2 筆比對失敗紀錄還沒處理/);
        await trigger.click();
        const dialog=page.getByRole('dialog',{name:'AutoCheck 意見收集'});
        await dialog.locator('.feedback-table tbody tr').first().waitFor();
        assert.equal(await dialog.locator('.feedback-table tbody tr').count(),2);
        await dialog.getByRole('combobox',{name:'回報來源'}).click();
        await page.getByRole('option',{name:'使用者回報',exact:true}).click();
        assert.match(await dialog.locator('.feedback-table tbody').innerText(),/沒有|找不到|0/);
        assert.match(await dialog.locator('.feedback-filter-chips').innerText(),/來源：使用者回報/);
        assert.match(page.url(),/feedbackSource=manual/);
        await dialog.getByRole('button',{name:'清除回報來源'}).click();
        await dialog.getByRole('combobox',{name:'回報來源'}).click();
        await page.getByRole('option',{name:'自動失敗紀錄',exact:true}).click();
        assert.equal(await dialog.locator('.feedback-table tbody tr').count(),2);
        await dialog.locator('.feedback-table tbody tr button').first().click();
        const log=dialog.locator('.feedback-log');
        await log.waitFor();
        assert.match(await log.innerText(),/自動失敗紀錄｜比對[\s\S]*判斷：這份檔案是 UTF-16 編碼/);
        // Leaving for another workspace must not carry the 意見收集 filter along (Index clears the keys it knows).
        assert.match(page.url(),/feedbackSource=failure/);
        await log.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(evidence,`admin-${width}.png`)});
        assert.equal(await dialog.evaluate(node=>node.scrollWidth-node.clientWidth)<=1,true,'the log scrolls inside its own box');
      }
      results[width]={errors};
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log(JSON.stringify(results));console.log('comparison failure log: ok, evidence in',evidence);
  }finally{await browser?.close();await server.close();fs.rmSync(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1);});
