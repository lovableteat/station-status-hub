const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(process.env.AUDIT_QA_DIR||'../qa-tools','package.json'))('playwright');
const evidence=path.resolve(process.env.CIRCUIT_AI_EVIDENCE_DIR||'../circuit-pdf-ai-review-evidence');
// 2026-11-25: what the model adds is its reading of the picture, listed for reference with this prefix and never counted.
const findingTitle='參考：AI 補充：CON2A A1 差分 P/N 名稱不同';
// 本機比對 lists the renamed net first (F1: 字改了：PCIE_RX_P → PCIE_RX_N); the model's own findings follow as F2…F4.
const findingMarker=(region, side)=>region.getByRole('button',{name:`${side} F2：${findingTitle}`,exact:true});

async function verifyAnnotations(dialog,page,width) {
  const region=dialog.getByRole('region',{name:'AI 圖面標註',exact:true});
  const baseline=findingMarker(region,'基準版');
  const working=findingMarker(region,'比對版');
  await baseline.waitFor();
  await working.waitFor();
  const unclear=region.getByRole('button',{name:'比對版 F4：參考：AI 補充：A1 接點需確認',exact:true});
  await unclear.waitFor();
  assert.equal(await baseline.getAttribute('data-certainty'),'suspected');
  assert.equal(await unclear.getAttribute('data-certainty'),'unclear');
  for(const marker of [baseline,working]) {
    const placement=await marker.evaluate(node=>{
      const rect=node.getBoundingClientRect(), canvas=node.parentElement.querySelector('canvas').getBoundingClientRect();
      return {
        error:Math.max(Math.abs(rect.left-canvas.left-canvas.width*.125),Math.abs(rect.top-canvas.top-canvas.height*.283),
          Math.abs(rect.width-canvas.width*.15),Math.abs(rect.height-canvas.height*.058)),
        labelOverlaps:node.firstElementChild.getBoundingClientRect().bottom>rect.top+2,
      };
    });
    assert.ok(placement.error<=1.1,`annotation coordinate error ${placement.error}px at viewport ${width}px`);
    assert.equal(placement.labelOverlaps,false);
  }
  // 2026-11-24 (「標註的方式、範圍、顏色不夠清楚」): the whole area is outlined just outside its edge in magenta, a colour
  // schematics do not use; 證據不足 is the same outline dashed and untinted, so what is under it stays readable.
  const outline=node=>{const mark=getComputedStyle(node,'::before'),box=node.getBoundingClientRect(),around=parseFloat(mark.width);return {style:mark.borderTopStyle,colour:mark.borderTopColor,tinted:mark.backgroundColor!=='rgba(0, 0, 0, 0)',outside:around>box.width};};
  // 2026-11-25: what the model adds is for reference (never counted), so it is outlined in the grey of reference marks.
  assert.deepEqual(await unclear.evaluate(outline),{style:'dashed',colour:'rgb(100, 116, 139)',tinted:false,outside:true});
  assert.deepEqual(await baseline.evaluate(outline),{style:'dashed',colour:'rgb(100, 116, 139)',tinted:false,outside:true});
  assert.equal(await region.getByRole('button',{name:/^(基準版|比對版) F3：/}).count(),0);
  assert.equal(await region.getByRole('button',{name:/^(基準版|比對版) F1：字改了：PCIE_RX_P → PCIE_RX_N$/}).count(),2,'the difference found without AI is boxed on both drawings');
  assert.equal(await region.getByText('位置未能確認',{exact:true}).count(),2);
  assert.ok((await region.innerText()).includes('元件／接腳名稱'));
  const first=dialog.locator('.circuit-pdf-ai-finding').nth(1);
  await baseline.scrollIntoViewIfNeeded();
  assert.deepEqual(await tagsApart(dialog),[]);
  await page.screenshot({path:path.join(evidence,`annotations-${width}.png`)});
  if(width<768) {
    await working.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(evidence,`annotations-working-${width}.png`)});
    await working.locator('span').first().tap();
  } else await working.locator('span').first().click(); // only the number tag takes clicks (2026-11-23)
  await first.locator('textarea').waitFor();
  assert.equal(await first.getAttribute('open'),'');
}

async function runSelectedBatch(browser,origin,width) {
  const context=await browser.newContext({viewport:{width,height:884},isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  try {
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/?allPages');
    await page.getByRole('button',{name:'開啟本頁 AI 初審',exact:true}).click();
    const dialog=page.getByTestId('circuit-pdf-ai-review');
    await dialog.getByRole('combobox',{name:'AI 初審服務',exact:true}).selectOption('qa-vision');
    const selection=dialog.getByRole('textbox',{name:'指定比對頁碼',exact:true});
    const submit=dialog.getByRole('button',{name:'比對指定頁面',exact:true});
    assert.equal(await submit.isDisabled(),true);
    await selection.fill('1, 6');
    assert.equal(await selection.getAttribute('aria-invalid'),'true');
    assert.equal(await submit.isDisabled(),true);
    assert.match(await selection.evaluate(node=>node.getAttribute('aria-describedby')?.split(/\s+/).map(id=>document.getElementById(id)?.textContent).join(' ')??''),/1\s*–\s*5/);
    assert.equal(await page.evaluate(()=>window.__circuitAiQA.calls.length),0);

    await selection.fill('5');
    assert.equal(await submit.isDisabled(),true,'selection needs a page with a baseline counterpart');
    await selection.fill('1、3–5，3');
    assert.notEqual(await selection.getAttribute('aria-invalid'),'true');
    assert.equal(await submit.isEnabled(),true);
    assert.ok(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1));
    await page.screenshot({path:path.join(evidence,`selected-range-${width}.png`)});
    await page.evaluate(()=>window.__circuitAiQA.failPages=[3]);
    if(width<768)await submit.tap();else await selection.press('Enter');
    const progress=dialog.getByRole('region',{name:'指定頁面比對進度',exact:true});
    const pageResult=number=>progress.getByRole('button',{name:`查看比對版第 ${number} 頁初審`,exact:true});
    await progress.getByRole('button',{name:'繼續未完成頁面',exact:true}).waitFor();
    assert.equal(await pageResult(2).count(),0);
    assert.equal(await pageResult(3).getAttribute('data-status'),'failed');
    assert.equal(await pageResult(5).getAttribute('data-status'),'unmatched');
    assert.equal(await pageResult(5).isDisabled(),true);
    assert.deepEqual(await page.evaluate(()=>window.__circuitAiQA.saveRecords.map(({workingPage})=>workingPage).sort()),[1,4]);

    await page.evaluate(()=>window.__circuitAiQA.failPages=[]);
    await progress.getByRole('button',{name:'繼續未完成頁面',exact:true}).click();
    await progress.getByText('指定頁面比對已結束',{exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.__circuitAiQA.calls.map(call=>call.target.workingPage).sort()),[1,3,3,3,4],'the failing page was retried once by itself, then once more on 繼續');
    assert.deepEqual(await page.evaluate(()=>window.__circuitAiQA.saveRecords.map(({workingPage,officialPage})=>[workingPage,officialPage]).sort()),[[1,2],[3,4],[4,5]]);
    await pageResult(3).click();
    await dialog.getByRole('heading',{name:'比對版第 3 頁 · 基準版第 4 頁初審摘要',exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.__circuitAiQA.loads),[3]);
    await page.screenshot({path:path.join(evidence,`selected-results-${width}.png`)});
    assert.deepEqual(errors,[]);
    return {width,checks:['invalid range cannot submit','selected pages deduplicated and mapped to baseline','a failing page is retried by itself before it is marked failed','resume retries only failed selected page','persisted selected result can be opened']};
  } finally {
    await context.close();
  }
}

async function runParallelBatch(browser,origin,width) {
  const context=await browser.newContext({viewport:{width,height:884},isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  try {
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/?allPages');
    await page.getByRole('button',{name:'開啟本頁 AI 初審',exact:true}).click();
    const dialog=page.getByTestId('circuit-pdf-ai-review');
    const progress=dialog.getByRole('region',{name:'全部頁面比對進度'});
    const status=(number)=>progress.getByRole('button',{name:`查看比對版第 ${number} 頁初審`,exact:true}).getAttribute('data-status');
    await dialog.getByRole('combobox',{name:'AI 初審服務',exact:true}).selectOption('qa-vision');
    await page.evaluate(()=>window.__circuitAiQA.mode='hold');
    await dialog.getByRole('button',{name:'全部頁面比對',exact:true}).click();
    await page.waitForFunction(()=>Object.keys(window.__circuitAiQA.held??{}).length>=3);
    await progress.getByText(/正在比對第 1、2、3 頁/).waitFor();
    assert.deepEqual(await page.evaluate(()=>Object.keys(window.__circuitAiQA.held)),['1','2','3']);
    assert.equal(await status(4),'pending');
    assert.equal(await status(5),'unmatched');
    assert.ok(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1));
    await page.screenshot({path:path.join(evidence,`parallel-three-pages-${width}.png`)});

    await page.evaluate(()=>window.__circuitAiQA.held[2]());
    await page.waitForFunction(()=>window.__circuitAiQA.saves===1&&Boolean(window.__circuitAiQA.held[4]));
    assert.deepEqual(await page.evaluate(()=>window.__circuitAiQA.saveRecords.map(({workingPage})=>workingPage)),[2]);
    assert.deepEqual(await page.evaluate(()=>Object.keys(window.__circuitAiQA.held)),['1','3','4']);
    assert.equal(await status(2),'complete');
    await dialog.getByRole('button',{name:'停止全部比對',exact:true}).click();
    const resume=dialog.getByRole('button',{name:'繼續未完成頁面',exact:true});
    await resume.waitFor();
    assert.equal(await page.evaluate(()=>Object.keys(window.__circuitAiQA.held).length),0);
    assert.equal(await status(1),'pending');
    assert.equal(await status(3),'pending');
    assert.equal(await status(4),'pending');
    assert.equal(await page.evaluate(()=>window.__circuitAiQA.saves),1);

    await page.evaluate(()=>{window.__circuitAiQA.mode='normal';window.__circuitAiQA.failPages=[3]});
    await resume.click();
    await progress.getByText('部分頁面尚未完成',{exact:true}).waitFor();
    assert.equal(await status(3),'failed');
    assert.equal(await status(4),'complete');
    assert.deepEqual(await page.evaluate(()=>window.__circuitAiQA.saveRecords.map(({workingPage})=>workingPage).sort()),[1,2,4]);
    await page.evaluate(()=>window.__circuitAiQA.failPages=[]);
    await resume.click();
    await progress.getByText('全部頁面比對已結束',{exact:true}).waitFor();
    assert.equal(await status(3),'complete');
    const calls=await page.evaluate(()=>window.__circuitAiQA.calls.map(call=>call.target.workingPage));
    assert.equal(calls.filter(page=>page===2).length,1);
    assert.ok(!calls.includes(5));
    assert.deepEqual(await page.evaluate(()=>window.__circuitAiQA.saveRecords.map(({workingPage,officialPage})=>[workingPage,officialPage]).sort()),[[1,2],[2,3],[3,4],[4,5]]);
    assert.deepEqual(errors,[]);
    return {width,checks:['three concurrent matched pairs with fourth pending','out-of-order result saves independently','cancel resets active pages and preserves saved report','resume skips saved and unmatched and retries failed page']};
  } finally {
    await context.close();
  }
}


// 2026-11-19: compare in the browser first; identical pages never reach the AI, nothing is done twice, failures retry
// by themselves, a dropped connection waits, repeated failures stop the batch, and the result is a report.
async function runLocalFirst(browser,origin,width) {
  const phone=width<768;
  const context=await browser.newContext({viewport:{width,height:884},isMobile:phone,hasTouch:phone,reducedMotion:'reduce',acceptDownloads:true});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  try {
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.setDefaultTimeout(30000);
    await page.goto(origin+'/?sameSheets');
    await page.getByRole('button',{name:'開啟本頁 AI 初審',exact:true}).click();
    const dialog=page.getByTestId('circuit-pdf-ai-review');
    await dialog.getByRole('combobox',{name:'AI 初審服務',exact:true}).selectOption('qa-vision');
    const all=dialog.getByRole('button',{name:'全部頁面比對',exact:true});
    const progress=dialog.getByRole('region',{name:'全部頁面比對進度'});
    const finished=()=>progress.getByText('全部頁面比對已結束',{exact:true}).waitFor();
    const chip=number=>progress.getByRole('button',{name:`查看比對版第 ${number} 頁初審`,exact:true});
    const qa=fn=>page.evaluate(fn);
    const top=()=>dialog.locator('.circuit-pdf-ai-body').evaluate(node=>{node.scrollTop=0;});

    await all.click();await finished();
    assert.deepEqual(await qa(()=>window.__circuitAiQA.calls.map(call=>call.target.workingPage).sort()),[2,5],'only the sheets that differ are sent to the AI');
    assert.deepEqual(await qa(()=>window.__circuitAiQA.saveRecords.map(row=>[row.workingPage,row.source]).sort()),[[1,'local'],[2,'ai'],[3,'local'],[4,'local'],[5,'ai'],[6,'local']]);
    assert.match(await progress.getByRole('status').innerText(),/已儲存 6／6 頁 · 相同 4 頁 · 有差異 2 頁/);
    assert.match(await progress.getByRole('status').innerText(),/本次 AI 用量約 9,160 tokens/);
    assert.equal(await chip(1).getAttribute('data-outcome'),'identical');assert.match(await chip(1).innerText(),/相同/);
    assert.equal(await chip(2).getAttribute('data-outcome'),'different');assert.match(await chip(2).innerText(),/處不同/);
    await page.screenshot({path:path.join(evidence,`local-first-${width}.png`)});

    // Nothing is compared, paid for or stored twice.
    await all.click();await finished();
    assert.equal(await qa(()=>window.__circuitAiQA.calls.length),2);assert.equal(await qa(()=>window.__circuitAiQA.saves),6);assert.ok(await qa(()=>window.__circuitAiQA.loadAll)>=2);


    // The renamed net is one difference with its place, in front of what the model added.
    if(phone)await chip(2).tap();else await chip(2).click();
    await dialog.getByRole('heading',{name:'比對版第 2 頁 · 基準版第 2 頁初審摘要',exact:true}).waitFor();
    assert.match(await dialog.locator('.circuit-pdf-ai-results > header p').innerText(),/^電腦比對（沒用 AI）：這一頁有 2 個地方不一樣（字改了 1 個、線不一樣 1 處）。.*AI 說明：/s);
    assert.match(await dialog.locator('.circuit-pdf-ai-finding summary').first().innerText(),/F1 · 字改了：NET_2 → NET_2_NEW/);

    // 放大檢視: both versions large; choosing a difference zooms to it.
    await dialog.getByRole('button',{name:'放大檢視兩版',exact:true}).click();
    const zoom=page.getByTestId('circuit-pdf-ai-zoom');
    await zoom.waitFor();
    await page.waitForFunction(count=>document.querySelectorAll('[data-testid="circuit-pdf-ai-zoom"] canvas:not([hidden])').length===count,phone?1:2);
    assert.equal(await zoom.getByRole('group',{name:'顯示哪一版'}).getByRole('button',{pressed:true}).innerText(),phone?'比對版':'兩版並排');
    assert.equal(await zoom.locator('output').innerText(),'100%');
    const jump=zoom.getByRole('navigation',{name:'跳到差異'}).getByRole('button',{name:/F1/});
    if(phone)await jump.tap();else await jump.click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="circuit-pdf-ai-zoom"] output').textContent==='300%');
    await zoom.getByRole('button',{name:/^放大圖 比對版 F1：/}).waitFor();
    assert.equal(await zoom.getByRole('button',{name:/^放大圖 比對版 F1：/}).getAttribute('aria-pressed'),'true');
    await page.waitForFunction(()=>{const box=document.querySelector('[data-testid="circuit-pdf-ai-zoom"] .circuit-pdf-ai-zoom-pane[data-side="working"] .circuit-pdf-ai-annotation-box[data-selected="true"]'),view=box?.closest('.circuit-pdf-ai-zoom-scroll');if(!box||!view)return false;const a=box.getBoundingClientRect(),b=view.getBoundingClientRect();return a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom;},null,{timeout:10000});
    // The drawing itself is redrawn larger than its pane, not just relabelled 300 %.
    await page.waitForFunction(()=>{const sheet=document.querySelector('[data-testid="circuit-pdf-ai-zoom"] .circuit-pdf-ai-zoom-pane[data-side="working"] .circuit-pdf-ai-zoom-sheet'),view=sheet?.parentElement;return Boolean(sheet&&view&&sheet.getBoundingClientRect().width>view.clientWidth*1.8);},null,{timeout:10000});
    assert.match(await zoom.locator('.circuit-pdf-ai-zoom-detail').innerText(),/NET_2_NEW/);
    assert.ok(await zoom.evaluate(node=>node.scrollWidth<=node.clientWidth+1));
    assert.deepEqual(await tagsApart(zoom),[],'the tags of the renamed net and the changed wire around it do not cover each other');
    await page.screenshot({path:path.join(evidence,`zoom-${width}.png`)});
    await zoom.getByRole('button',{name:'縮小',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="circuit-pdf-ai-zoom"] output').textContent==='200%');
    await zoom.getByRole('button',{name:'關閉放大檢視',exact:true}).click();
    await zoom.waitFor({state:'hidden'});
    assert.ok(await dialog.isVisible(),'closing the viewer keeps the comparison open');

    // 下載報告: every page, every difference, the marked drawings.
    await top();
    const [download]=await Promise.all([page.waitForEvent('download'),dialog.getByRole('button',{name:'下載報告',exact:true}).click()]);
    const file=path.join(evidence,`report-${width}.xlsx`);
    await download.saveAs(file);
    assert.match(download.suggestedFilename(),/^工作版本 V2-新舊版比對報告-\d{8}\.xlsx$/);
    await dialog.locator('.circuit-pdf-ai-notice').waitFor();
    const ExcelJS=require('exceljs'),book=new ExcelJS.Workbook();
    await book.xlsx.readFile(file);
    assert.deepEqual(book.worksheets.map(sheet=>sheet.name),['摘要','差異清單','各頁結果','圖面標註']);
    const cells=(sheet,row)=>book.getWorksheet(sheet).getRow(row).values.slice(1).map(value=>String(value??''));
    const summary=Object.fromEntries(book.getWorksheet('摘要').getSheetValues().filter(Boolean).map(row=>[String(row[1]),String(row[2]??'')]));
    assert.equal(summary['相同'],'4 頁');assert.equal(summary['有差異'],'2 頁');assert.equal(summary['比對失敗'],'0 頁');assert.match(summary['AI token 用量'],/輸入 8,400、輸出 760/);
    assert.equal(book.getWorksheet('各頁結果').rowCount,7);
    assert.deepEqual(cells('各頁結果',2).slice(0,4),['1','1','相同','本機比對']);
    assert.deepEqual(cells('差異清單',2).slice(0,4).concat(cells('差異清單',2)[6]),['2','2','F1','Net 名稱','字改了：NET_2 → NET_2_NEW']);
    assert.equal(book.getWorksheet('圖面標註').getImages().length,4,'both versions of the two sheets that differ');

    // A timeout and a dropped connection need no manual retry, and no page is marked failed on the way.
    await dialog.getByLabel('比對過的頁也重新比對').check();
    await qa(()=>{window.__circuitAiQA.calls=[];window.__circuitAiQA.networkDown=2;window.__circuitAiQA.failOnce=[5];});
    const statuses=[];
    const watch=setInterval(()=>{page.evaluate(()=>[...document.querySelectorAll('.circuit-pdf-ai-batch-pages button')].map(node=>node.dataset.status)).then(value=>statuses.push(...value)).catch(()=>{});},60);
    await all.click();
    await dialog.locator('.circuit-pdf-ai-wait[data-kind="network"]').waitFor();
    assert.match(await dialog.locator('.circuit-pdf-ai-wait').innerText(),/秒後自動再試.*沒有頁面被算成失敗/);
    await finished();clearInterval(watch);
    assert.ok(!statuses.includes('failed'),'nothing was shown as failed while waiting');
    assert.deepEqual(await qa(()=>window.__circuitAiQA.calls.map(call=>call.target.workingPage).sort()),[2,5,5]);
    assert.match(await progress.getByRole('status').innerText(),/已儲存 6／6 頁/);

    // Without the AI step the comparison costs nothing and still lists every difference.
    await dialog.getByLabel('有差異的頁再用 AI 說明').uncheck();
    await qa(()=>{window.__circuitAiQA.calls=[];});
    await all.click();await finished();
    assert.equal(await qa(()=>window.__circuitAiQA.calls.length),0);
    assert.deepEqual(await qa(()=>window.__circuitAiQA.saveRecords.slice(-6).map(row=>[row.workingPage,row.modelLabel,row.findings]).sort((a,b)=>a[0]-b[0])),[[1,'本機比對（未使用 AI）',0],[2,'本機比對（未使用 AI）',2],[3,'本機比對（未使用 AI）',0],[4,'本機比對（未使用 AI）',0],[5,'本機比對（未使用 AI）',2],[6,'本機比對（未使用 AI）',0]]);
    // 2026-11-23 「我在另一個電腦比對完成，為何換一個電腦看不到了」: a window opened afresh (another computer) lists what is stored
    // without pressing anything, and compares nothing again.
    const callsBefore=await qa(()=>window.__circuitAiQA.calls.length),savesBefore=await qa(()=>window.__circuitAiQA.saves);
    await dialog.getByRole('button',{name:'關閉 AI 比對',exact:true}).click();await dialog.waitFor({state:'detached'});
    await page.getByRole('button',{name:'開啟本頁 AI 初審',exact:true}).click();
    await progress.getByRole('status').filter({hasText:/已儲存 6／6 頁 · 相同 4 頁 · 有差異 2 頁/}).waitFor();
    assert.equal(await dialog.getByText('還沒有比對結果',{exact:true}).count(),0);
    assert.equal(await qa(()=>window.__circuitAiQA.calls.length),callsBefore,'opening the window sends nothing to the AI');
    assert.equal(await qa(()=>window.__circuitAiQA.saves),savesBefore,'and stores nothing');
    assert.ok(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1));
    assert.deepEqual(errors,[]);
    return {width,checks:['identical sheets settled without AI','no page compared or stored twice','renamed net is one located difference','zoom viewer follows a chosen difference','report holds summary, pages, differences and drawings','timeout and dropped connection recover by themselves','comparison without AI costs nothing']};
  } finally { await context.close(); }
}

// 2026-11-24 (the user's MCU1 sheet, 「你自己看，幫我解決」): one block of an otherwise unchanged sheet drawn again elsewhere
// put 40 marks on top of each other. It is one finding now, its parts and nets compared by name, and no two number tags
// on a drawing cover each other.
async function tagsApart(scope) {
  return scope.evaluate(root => {
    const clashes = [];
    for (const surface of root.querySelectorAll('.circuit-pdf-ai-annotation-surface, .circuit-pdf-ai-zoom-sheet')) {
      const tags = [...surface.querySelectorAll('.circuit-pdf-ai-annotation-box > span')].map(node => ({ id: node.textContent, box: node.getBoundingClientRect() })).filter(tag => tag.box.width);
      for (let i = 0; i < tags.length; i++) for (let j = i + 1; j < tags.length; j++) {
        const a = tags[i].box, b = tags[j].box;
        if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) clashes.push(`${tags[i].id}/${tags[j].id}`);
      }
    }
    return clashes;
  });
}
async function runMovedBlock(browser,origin,width) {
  const phone=width<768;
  const context=await browser.newContext({viewport:{width,height:884},isMobile:phone,hasTouch:phone,reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  try {
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.setDefaultTimeout(30000);
    await page.goto(origin+'/?movedBlock');
    await page.getByRole('button',{name:'開啟本頁 AI 初審',exact:true}).click();
    const dialog=page.getByTestId('circuit-pdf-ai-review');
    await dialog.getByRole('combobox',{name:'AI 初審服務',exact:true}).selectOption('qa-vision');
    await dialog.getByLabel('有差異的頁再用 AI 說明').uncheck();
    const progress=dialog.getByRole('region',{name:'全部頁面比對進度'});
    const chip=number=>progress.getByRole('button',{name:`查看比對版第 ${number} 頁初審`,exact:true});
    const press=async locator=>{if(phone)await locator.tap();else await locator.click();};
    await dialog.getByRole('button',{name:'全部頁面比對',exact:true}).click();
    await progress.getByText('全部頁面比對已結束',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__circuitAiQA.calls.length),0);
    assert.deepEqual(await page.evaluate(()=>window.__circuitAiQA.saveRecords.map(row=>[row.workingPage,row.source]).sort()),[[1,'local'],[2,'local'],[3,'local']]);
    assert.deepEqual([await chip(1).getAttribute('data-outcome'),await chip(2).getAttribute('data-outcome'),await chip(3).getAttribute('data-outcome')],['common','different','common'],'a new company in the title block is not a difference');
    assert.equal((await chip(1).locator('strong').innerText()).trim(),'只有不算錯的地方（標題欄等 1 項）');
    await press(chip(2));
    await dialog.getByRole('heading',{name:'比對版第 2 頁 · 基準版第 2 頁初審摘要',exact:true}).waitFor();
    const titles=(await dialog.locator('.circuit-pdf-ai-finding summary').allInnerTexts()).map(text=>text.trim());
    assert.equal(titles.length,3,titles.join(' | '));
    assert.ok(titles.some(title=>/不算錯：標題欄不一樣（公司、作者、日期等 1 處）/.test(title)),titles.join(' | '));
    assert.ok(titles.some(title=>/字改了：R910 → R920/.test(title)),titles.join(' | '));
    assert.ok(titles.some(title=>/這一塊整個搬走或重畫了：32 段字的位置不一樣，零件和線路名稱都一樣/.test(title)),titles.join(' | '));
    // 2026-11-25: the moved block is listed for reference (a layout change, like a redrawn sheet); the summary counts only
    // the rename and says what is listed apart.
    assert.match(await dialog.locator('.circuit-pdf-ai-results > header p').innerText(),/這一頁有 1 個地方不一樣（字改了 1 個）。另外 2 項只是參考或不算錯/);
    assert.ok(titles.some(title=>/^參考：這一塊整個搬走或重畫了/.test(title.replace(/^S+ · /,'').replace(/^(一般提醒|需要注意|優先核對)s*Fd+ · /,'')) || /參考：這一塊整個搬走或重畫了/.test(title)),titles.join(' | '));
    await dialog.locator('.circuit-pdf-ai-annotation-box').first().waitFor();
    assert.deepEqual(await tagsApart(dialog),[]);
    await page.screenshot({path:path.join(evidence,`moved-block-${width}.png`)});
    await press(dialog.getByRole('button',{name:'放大檢視兩版',exact:true}));
    const zoom=page.locator('.circuit-pdf-ai-zoom');
    await zoom.locator('.circuit-pdf-ai-annotation-box').first().waitFor();
    assert.deepEqual(await tagsApart(zoom),[]);
    await page.screenshot({path:path.join(evidence,`moved-block-zoom-${width}.png`)});
    await page.keyboard.press('Escape');
    assert.deepEqual(errors,[]);
    return {width,checks:['a moved block is one finding compared by name','a rename beside it stays its own finding','no two tags cover each other']};
  } finally { await context.close(); }
}

// 2026-11-24 (「明明不是有問題的東西，他卻一樣標出來…600多項不同每頁都這樣子」): the same circuit drawn again elsewhere on every
// sheet is compared by its parts and nets, without AI; a part drawn on another sheet is not missing.
async function runRedrawn(browser,origin,width) {
  const phone=width<768;
  const context=await browser.newContext({viewport:{width,height:884},isMobile:phone,hasTouch:phone,reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  try {
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.setDefaultTimeout(30000);
    await page.goto(origin+'/?redrawn');
    await page.getByRole('button',{name:'開啟本頁 AI 初審',exact:true}).click();
    const dialog=page.getByTestId('circuit-pdf-ai-review');
    await dialog.getByRole('combobox',{name:'AI 初審服務',exact:true}).selectOption('qa-vision');
    const progress=dialog.getByRole('region',{name:'全部頁面比對進度'});
    const chip=number=>progress.getByRole('button',{name:`查看比對版第 ${number} 頁初審`,exact:true});
    const press=async locator=>{if(phone)await locator.tap();else await locator.click();};
    await dialog.getByRole('button',{name:'全部頁面比對',exact:true}).click();
    await progress.getByText('全部頁面比對已結束',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__circuitAiQA.calls.length),0,'a redrawn sheet is never sent to the AI');
    assert.deepEqual(await page.evaluate(()=>window.__circuitAiQA.saveRecords.map(row=>[row.workingPage,row.source]).sort()),[[1,'local'],[2,'local'],[3,'local'],[4,'local']]);
    const labels=[];
    for(const number of [1,2,3,4]) labels.push([await chip(number).getAttribute('data-outcome'),(await chip(number).locator('strong').innerText()).trim()]);
    assert.deepEqual(labels,[['clean','重畫的圖：零件、線路名稱和數值都一樣'],['different','重畫的圖：1 處不一樣（零件、線路名稱或數值）'],['clean','重畫的圖：零件、線路名稱和數值都一樣'],['clean','重畫的圖：零件、線路名稱和數值都一樣']]);
    assert.match(await progress.getByRole('status').innerText(),/有差異 1 頁/);
    await page.screenshot({path:path.join(evidence,`redrawn-${width}.png`)});

    await press(chip(2));
    await dialog.getByRole('heading',{name:'比對版第 2 頁 · 基準版第 2 頁初審摘要',exact:true}).waitFor();
    const summary=await dialog.locator('.circuit-pdf-ai-results > header p').innerText();
    assert.match(summary,/^電腦比對（沒用 AI）：這一頁兩版是重新畫過的（重畫的圖）/);assert.match(summary,/電腦只比名字/);
    assert.match(await dialog.locator('.circuit-pdf-ai-finding summary').first().innerText(),/F1 · 基準版有、比對版沒有的零件編號：R204/);
    assert.equal(await dialog.locator('.circuit-pdf-ai-finding').count(),1,'one part left out is one item, not a list of every moved word and line');
    await page.screenshot({path:path.join(evidence,`redrawn-page2-${width}.png`)});
    await press(chip(3));
    await dialog.getByRole('heading',{name:'比對版第 3 頁 · 基準版第 3 頁初審摘要',exact:true}).waitFor();
    assert.match(await dialog.locator('.circuit-pdf-ai-finding summary').first().innerText(),/參考：U30 畫到比對版第 4 頁了/);
    assert.ok(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1));
    assert.deepEqual(errors,[]);
    return {width,checks:['redrawn sheets settled by parts and nets without AI','a part left out is one located item','a part drawn on another sheet is not missing']};
  } finally { await context.close(); }
}

async function runStopLoss(browser,origin) {
  const context=await browser.newContext({viewport:{width:1440,height:884},reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  try {
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/?allPages');
    await page.getByRole('button',{name:'開啟本頁 AI 初審',exact:true}).click();
    const dialog=page.getByTestId('circuit-pdf-ai-review');
    await dialog.getByRole('combobox',{name:'AI 初審服務',exact:true}).selectOption('qa-vision');
    await page.evaluate(()=>{window.__circuitAiQA.failPages=[1,2,3,4];});
    await dialog.getByRole('button',{name:'全部頁面比對',exact:true}).click();
    const progress=dialog.getByRole('region',{name:'全部頁面比對進度'});
    await progress.getByText('比對已自動停止',{exact:true}).waitFor();
    assert.match(await progress.locator('.circuit-pdf-ai-stop').innerText(),/連續 3 頁比對失敗，已自動停止，避免繼續消耗 token/);
    assert.ok(!(await page.evaluate(()=>window.__circuitAiQA.calls.map(call=>call.target.workingPage))).includes(4),'the page that had not started was not paid for');
    assert.equal(await progress.getByRole('button',{name:'查看比對版第 4 頁初審',exact:true}).getAttribute('data-status'),'pending');
    assert.equal(await page.evaluate(()=>window.__circuitAiQA.saves),0);
    await page.screenshot({path:path.join(evidence,'stop-loss-1440.png')});
    // With the cause gone, 繼續 finishes what is left; the report can be made at any point.
    await page.evaluate(()=>{window.__circuitAiQA.failPages=[];});
    await progress.getByRole('button',{name:'繼續未完成頁面',exact:true}).click();
    await progress.getByText('全部頁面比對已結束',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__circuitAiQA.saves),4);
    assert.deepEqual(errors,[]);
    return {checks:['three failures in a row stop the batch','pages not started are not paid for','resume finishes the rest']};
  } finally { await context.close(); }
}

(async()=>{fs.mkdirSync(evidence,{recursive:true});const{createServer}=await import('vite');const mock=path.resolve('tests/support/circuitPdfAiReviewMock.ts');const server=await createServer({configFile:false,root:process.cwd(),cacheDir:path.join(evidence,'.vite'),resolve:{alias:[{find:'@/integrations/supabase/client',replacement:mock},{find:'../api-management/aiUsageTelemetry',replacement:mock},{find:'@',replacement:path.resolve('src')}]},optimizeDeps:{entries:['tests/support/circuitPdfAiReviewFixture.jsx'],include:['react/jsx-dev-runtime','pdfjs-dist','jspdf','exceljs']},worker:{format:'es'},server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd(),evidence,fs.realpathSync('node_modules')]}},plugins:[{name:'circuit-ai-fixture',configureServer(vite){vite.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]!=='/')return next();res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/circuitPdfAiReviewFixture.jsx"></script></html>')})}}]});let browser;const results=[];
try{await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;browser=await chromium.launch({channel:'chrome'});
for(const width of[1440,1173,390]){const context=await browser.newContext({viewport:{width,height:884},hasTouch:true,isMobile:width<768,reducedMotion:'reduce'});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage(),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Browser error:',error.message)});page.setDefaultTimeout(20000);await page.goto(origin);const open=page.getByRole('button',{name:'開啟本頁 AI 初審',exact:true});await open.click();const dialog=page.getByTestId('circuit-pdf-ai-review');await dialog.waitFor();await dialog.getByRole('combobox',{name:'AI 初審服務',exact:true}).selectOption('qa-vision');
await dialog.getByRole('button',{name:'只比對這一頁',exact:true}).click();await page.waitForFunction(()=>window.__circuitAiQA.rows.length===1);assert.equal((await page.evaluate(()=>window.__circuitAiQA.calls))[0].images,4,'both whole pages and the changed area of both versions');assert.deepEqual((await page.evaluate(()=>window.__circuitAiQA.calls))[0].detail,['high','high','high','high']);assert.match((await page.evaluate(()=>window.__circuitAiQA.calls))[0].text,/已經確定的差異/);assert.match((await page.evaluate(()=>window.__circuitAiQA.calls))[0].text,/PCIE_RX_P/);assert.match(await dialog.innerText(),/有疑點或證據不足就標註/);const first=await page.evaluate(()=>window.__circuitAiQA.rows[0].id);
await verifyAnnotations(dialog,page,width);const confirmed=dialog.getByRole('group',{name:'F2 人工判讀',exact:true}).getByRole('button',{name:'已確認',exact:true});await confirmed.click();await dialog.getByRole('textbox',{name:'F2 人工核對備註',exact:true}).fill('QA 已核對原生 netlist，應更正 P/N。');await dialog.getByRole('button',{name:'返回圖面',exact:true}).click();assert.ok(await dialog.isVisible());assert.match(await dialog.getByRole('alert').innerText(),/尚未儲存/);await dialog.getByRole('button',{name:'儲存人工判讀',exact:true}).click();await page.waitForFunction(()=>window.__circuitAiQA.saves===2);assert.equal(await page.evaluate(()=>window.__circuitAiQA.rows[0].id),first);assert.equal(await page.evaluate(()=>window.__circuitAiQA.rows[0].findings[1].decision),'confirmed');assert.deepEqual(await page.evaluate(()=>window.__circuitAiQA.rows[0].findings[1].workingBox),{x:.125,y:.283,width:.15,height:.058});assert.equal(await page.evaluate(()=>window.__circuitAiQA.rows[0].findings[0].title),'字改了：PCIE_RX_P → PCIE_RX_N');await dialog.getByRole('button',{name:'返回圖面',exact:true}).click();await dialog.waitFor({state:'hidden'});await open.click();assert.match(await dialog.innerText(),/已確認/);await findingMarker(dialog.getByRole('region',{name:'AI 圖面標註',exact:true}),'基準版').waitFor();
await dialog.getByRole('button',{name:'重新比對這一頁',exact:true}).click();await page.waitForFunction(()=>window.__circuitAiQA.rows.length===2);assert.notEqual(await page.evaluate(()=>window.__circuitAiQA.rows.at(-1).id),first);await dialog.getByRole('combobox',{name:'歷次 AI 初審',exact:true}).selectOption(first);assert.match(await dialog.innerText(),/正在查看歷史初審/);if(!await confirmed.isVisible())await dialog.locator('.circuit-pdf-ai-finding summary').nth(1).click();assert.equal(await confirmed.isEnabled(),false);await dialog.getByRole('combobox',{name:'歷次 AI 初審',exact:true}).selectOption('');
if(width===1440){const saved=await page.evaluate(()=>window.__circuitAiQA.rows.at(-1).id);await page.evaluate(()=>window.__circuitAiQA.mode='invalid');await dialog.getByRole('button',{name:'重新比對這一頁',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.__circuitAiQA.rows.at(-1).id),saved);await page.evaluate(()=>{window.__circuitAiQA.mode='normal';window.__circuitAiQA.saveFail=true});await dialog.getByRole('button',{name:'重新比對這一頁',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'QA 模擬儲存失敗'}).waitFor();assert.equal(await page.evaluate(()=>window.__circuitAiQA.rows.length),2);await page.evaluate(()=>window.__circuitAiQA.saveFail=false);await dialog.getByRole('button',{name:'儲存人工判讀',exact:true}).click();await page.waitForFunction(()=>window.__circuitAiQA.rows.length===3);const count=await page.evaluate(()=>window.__circuitAiQA.calls.length);await page.evaluate(()=>window.__circuitAiQA.mode='slow');await dialog.getByRole('button',{name:'重新比對這一頁',exact:true}).click();await page.waitForFunction(count=>window.__circuitAiQA.calls.length>count,count);await dialog.getByRole('button',{name:'取消初審',exact:true}).click();await dialog.getByRole('button',{name:'重新比對這一頁',exact:true}).waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.__circuitAiQA.rows.length),3);}
await page.setViewportSize({width,height:500});
await page.waitForFunction(()=>{const box=document.querySelector('[data-testid="circuit-pdf-ai-review"]').getBoundingClientRect();return box.y>=-1&&box.bottom<=501}).catch(async error=>{await page.screenshot({path:path.join(evidence,`failure-short-${width}.png`)});console.error(await dialog.boundingBox());throw error});
await dialog.locator('.circuit-pdf-ai-body').evaluate(node=>node.scrollTop=node.scrollHeight);const box=await dialog.boundingBox(),footer=await dialog.locator('.circuit-pdf-ai-footer').boundingBox();assert.ok(box.y>=-1&&box.y+box.height<=501);assert.ok(footer.y>=0&&footer.y+footer.height<=501);assert.ok(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1));await page.screenshot({path:path.join(evidence,`short-${width}.png`)});await page.setViewportSize({width,height:884});await dialog.locator('.circuit-pdf-ai-body').evaluate(node=>node.scrollTop=0);await page.screenshot({path:path.join(evidence,`review-${width}.png`)});await dialog.getByRole('button',{name:'關閉 AI 比對',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByRole('button',{name:'切換檢視權限',exact:true}).click();await open.click();assert.equal(await dialog.getByRole('button',{name:'重新比對這一頁',exact:true}).isEnabled(),false);assert.deepEqual(errors,[]);results.push({width,result:'passed',checks:['real PDF images and coordinate text sent','manual review save/reopen','old AI runs read-only','cancellation and failure preserve reports','short viewport no clipping','read-only permissions respected']});await context.close();}
for(const result of results) result.checks.push('PDF markers open the matching finding and reopen after save','unknown coordinates show page-level flags and no precise marker');
const parallelBatch=[];
for(const width of [1440,390])parallelBatch.push(await runParallelBatch(browser,origin,width));
const selectedBatch=[];
for(const width of [1440,390])selectedBatch.push(await runSelectedBatch(browser,origin,width));
const localFirst=[];
for(const width of [1440,390])localFirst.push(await runLocalFirst(browser,origin,width));
const redrawn=[];
for(const width of [1440,390])redrawn.push(await runRedrawn(browser,origin,width));
const movedBlock=[];
for(const width of [1440,390])movedBlock.push(await runMovedBlock(browser,origin,width));
const stopLoss=await runStopLoss(browser,origin);
fs.writeFileSync(path.join(evidence,'browser-report.json'),JSON.stringify({result:'passed',checks:results,parallelBatch,selectedBatch,localFirst,redrawn,movedBlock,stopLoss},null,2));console.log(JSON.stringify({checks:results,parallelBatch,selectedBatch,localFirst,redrawn,movedBlock,stopLoss}));
}finally{if(browser)await browser.close();await server.close()}})().catch(error=>{console.error(error);process.exitCode=1});


