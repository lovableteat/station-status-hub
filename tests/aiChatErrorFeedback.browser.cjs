// Real chat, routing, persistence and controls; only provider/account/storage transport is isolated.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const evidence = path.resolve(process.env.AI_ERROR_EVIDENCE_DIR || '../ai-error-feedback');
const errorBubble = page => page.locator('[data-ai-message-state="error"]');
const picker = page => page.getByRole('combobox', { name: '選擇 API 金鑰與模型', exact: true }).filter({ visible: true });
async function choose(page, model) {
  await picker(page).click();
  await page.getByRole('option', { name: model === 'gpt-6.1-sol' ? /gpt-6\.1-sol.*單次使用/ : /gpt-5\.4/ }).click();
  await picker(page).getByText(model).waitFor();
}
async function geometry(page) {
  return page.evaluate(() => {
    const input = document.querySelector('[aria-label="輸入查詢內容"]'), send = document.querySelector('[aria-label="送出查詢"]');
    const rect = element => { const r = element.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height, bottom:r.bottom }; };
    return { width:innerWidth, pageWidth:document.documentElement.scrollWidth, input:rect(input), send:rect(send), height:innerHeight };
  });
}
async function run(browser, origin, width) {
  const compact = width < 1024, context = await browser.newContext({ viewport:{width,height:884}, hasTouch:compact, isMobile:compact, reducedMotion:'reduce', locale:'zh-TW' });
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(), errors = [], result = { width, checks:[] };
  page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(15000);
  try {
    await page.goto(origin + '/?qaModelError' + (compact ? '&mobile' : ''));
    const input = page.getByRole('textbox',{name:'輸入查詢內容',exact:true}), send = page.getByRole('button',{name:'送出查詢',exact:true});
    await input.waitFor(); await choose(page,'gpt-6.1-sol');
    await input.fill('1*1'); await send.click(); await errorBubble(page).waitFor(); await picker(page).getByText('gpt-5.4',{exact:compact}).waitFor();
    assert.equal(await errorBubble(page).count(),1);
    const explanation = await errorBubble(page).innerText();
    assert.match(explanation,/gpt-6\.1-sol/);
    if(compact) {
      assert.match(explanation,/單次/); assert.match(explanation,/目前/);
      assert.equal(await page.locator('[data-ai-connection-banner]').count(),0,'one inline failure replaces the duplicate banner');
      assert.equal(await page.getByText('資料查詢失敗',{exact:true}).count(),0,'no duplicate failure toast');
      const refill = errorBubble(page).getByRole('button',{name:'重填這個問題',exact:true});
      assert.match(await refill.innerText(),/重填問題/);
      const box = await refill.boundingBox(); assert.ok(box.width>=44&&box.height>=44);
    }
    assert.deepEqual(await page.evaluate(()=>window.__aiModelErrorQA.requests.map(request=>request.model)),['gpt-6.1-sol']);
    result.layout = await geometry(page); assert.equal(result.layout.width,result.layout.pageWidth); assert.ok(result.layout.send.bottom<=result.layout.height);
    await page.screenshot({path:path.join(evidence,`error-${width}.png`)});
    result.checks.push('explicit Sol fails once; selector returns to GPT-5.4; original failure identifies Sol');
    await page.waitForFunction(()=>window.__aiModelErrorQA.writes.some(write=>write.p_items.some(item=>item.messages.some(message=>message.state==='error'&&message.content.includes('gpt-6.1-sol')))));
    if(compact) {
      await page.locator('[data-mobile-workspace-dock]').getByRole('button',{name:'首頁',exact:true}).click(); await input.waitFor({state:'hidden'});
      await page.locator('[data-mobile-workspace-dock]').getByRole('button',{name:'AI 問答',exact:true}).click();
    } else {
      await page.getByRole('button',{name:'離開 AI 工作區',exact:true}).click(); await input.waitFor({state:'hidden'});
      await page.getByRole('button',{name:'返回 AI 工作區',exact:true}).click();
    }
    await input.waitFor(); await errorBubble(page).waitFor(); assert.equal(await errorBubble(page).innerText(),explanation);
    result.checks.push('cloud save and reopening preserve the error explanation');
    if(compact) {
      await page.setViewportSize({width,height:500});
      await page.waitForFunction(()=>document.querySelector('[aria-label="送出查詢"]').getBoundingClientRect().bottom<=500);
      result.keyboard = await geometry(page);
      assert.ok(result.keyboard.send.y>=0&&result.keyboard.send.bottom<=500&&result.keyboard.send.h>=44,JSON.stringify(result.keyboard));
      await errorBubble(page).getByRole('button',{name:'重填這個問題',exact:true}).click(); assert.equal(await input.inputValue(),'1*1');
      assert.equal(await page.evaluate(()=>window.__aiModelErrorQA.requests.length),1,'refill must not send automatically');
      await page.setViewportSize({width,height:884});
    } else await input.fill('1*1');
    await send.click(); await page.getByText('1 × 1 = 1（隔離測試成功）',{exact:true}).waitFor();
    const requests = await page.evaluate(()=>window.__aiModelErrorQA.requests);
    assert.deepEqual(requests.map(request=>request.model),['gpt-6.1-sol','gpt-5.4']);
    assert.doesNotMatch(JSON.stringify(requests[1].messages),/API 呼叫失敗|尚未開通|單次使用已/);
    result.checks.push('refilled question sends only GPT-5.4 and excludes failure messages from context');
    await page.screenshot({path:path.join(evidence,`recovered-${width}.png`)});
    await input.fill('保留這份草稿');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'),page.getByRole('button',{name:'上傳 PDF、PPT、Excel、Word 或圖片',exact:true}).click()]);
    await chooser.setFiles({name:'qa-draft.txt',mimeType:'text/plain',buffer:Buffer.from('draft attachment')});
    const attachment = page.getByRole('button',{name:'移除附件 1',exact:true}); await attachment.waitFor();
    await choose(page,'gpt-6.1-sol'); assert.equal(await input.inputValue(),'保留這份草稿'); await attachment.waitFor();
    await choose(page,'gpt-5.4'); assert.equal(await input.inputValue(),'保留這份草稿'); await attachment.waitFor();
    assert.equal(await page.evaluate(()=>window.__aiModelErrorQA.requests.length),2);
    result.checks.push('same-key model changes preserve the unsent draft and attachment');
    if(compact) {
      await page.evaluate(()=>{window.__aiModelErrorQA.failAttachmentUpload=true;});
      await send.click(); const notice=page.locator('[data-ai-connection-banner]'); await notice.waitFor();
      assert.match(await notice.innerText(),/對話資料準備失敗/);
      assert.equal(await input.inputValue(),'保留這份草稿'); await attachment.waitFor();
      assert.equal(await page.evaluate(()=>window.__aiModelErrorQA.requests.length),2,'failed attachment preparation must not reach the provider');
      const close=notice.getByRole('button',{name:'關閉查詢狀態',exact:true});
      result.noticeClose=await close.evaluate(element=>{const r=element.getBoundingClientRect();return{width:r.width,height:r.height,hit:element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});
      assert.ok(result.noticeClose.width>=44&&result.noticeClose.height>=44&&result.noticeClose.hit);
      await page.screenshot({path:path.join(evidence,`attachment-failure-${width}.png`)});
      assert.equal(await page.locator('[data-sonner-toast][data-type="error"]').count(),0,'compact preparation errors must not show a duplicate error toast');
      await close.click(); await notice.waitFor({state:'hidden'}); await attachment.waitFor();
      await input.fill('保留附件並繼續輸入'); assert.equal(await input.inputValue(),'保留附件並繼續輸入');
      result.checks.push('attachment preparation failure preserves draft/files and never calls AI; compact notice X is 44px and dismisses without blocking further typing');
    }
    assert.deepEqual(errors,[]); result.errors=errors; result.result='passed'; return result;
  } catch(error) { await page.screenshot({path:path.join(evidence,`failure-${width}.png`)}).catch(()=>{}); throw error; }
  finally { await context.close(); }
}
(async()=>{
  fs.mkdirSync(evidence,{recursive:true});
  const {createServer}=await import('vite'), mock=path.resolve('tests/support/aiWorkspaceMock.js');
  const server=await createServer({configFile:false,root:process.cwd(),cacheDir:path.join(evidence,'.vite'),resolve:{alias:[{find:'@/components/auth/UserContext',replacement:mock},{find:'@/integrations/supabase/client',replacement:mock},{find:'@',replacement:path.resolve('src')}]},worker:{format:'es'},optimizeDeps:{entries:['tests/support/aiWorkspaceFixture.jsx'],include:['react/jsx-dev-runtime']},server:{host:'127.0.0.1',port:0},plugins:[{name:'ai-error-qa',configureServer(vite){vite.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]!=='/')return next();res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/aiWorkspaceFixture.jsx"></script></html>');});}}]});
  let browser; const results=[];
  try { await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;browser=await chromium.launch({channel:'chrome'});for(const width of[557,390,1440])results.push(await run(browser,origin,width));console.log('AI error feedback: 557/390/1440 passed'); }
  finally {fs.writeFileSync(path.join(evidence,'browser-report.json'),JSON.stringify({results,provider:'isolated transport; real request builder, persistence and UI'},null,2));if(browser)await browser.close();await server.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
