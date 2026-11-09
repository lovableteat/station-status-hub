// Targeted density and button flows against isolated UI fixtures; no production requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createRequire} = require('node:module');
const {chromium} = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools','package.json'))('playwright');
const evidence = path.resolve(process.env.BOM_DENSITY_EVIDENCE_DIR || '../bom-density-evidence');
const baselineOnly = Boolean(process.env.BOM_DENSITY_BASELINE_ONLY);
const baselinePath = path.join(evidence,'baseline.json');
const trackerOf = p => p.getByRole('dialog').filter({has:p.getByRole('heading',{name:'頁數進度',exact:true})});
async function openTracker(page,width){
  if(width<1024){await page.getByRole('button',{name:'排序與工具',exact:true}).click();await page.getByTestId('material-mobile-tools').getByRole('button',{name:'頁數進度',exact:true}).click();}
  else await page.getByRole('button',{name:/已完成.*頁/}).click();
  const tracker=trackerOf(page);await tracker.waitFor();return tracker;
}
async function geometry(page,tracker){return tracker.evaluate(el=>{const r=n=>{const b=n.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom}};return{map:r(el.querySelector('.bom-tracker-map')),controls:r(el.querySelector('.bom-tracker-controls')),batch:r(el.querySelector('.bom-tracker-batch')),filter:r(el.querySelector('.bom-tracker-filter')),table:r(el.querySelector('.bom-tracker-table-scroll'))}});}
async function frame(page,dialog,width){
  const b=await dialog.boundingBox();assert.ok(b.x>=-1&&b.y>=-1&&b.x+b.width<=width+1&&b.y+b.height<=885,JSON.stringify(b));
  assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Dialog cannot scroll horizontally');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
}
async function versionMetrics(center){
 return center.locator('.bom-series-row').evaluateAll(rows=>rows.map(el=>({height:el.getBoundingClientRect().height,name:el.innerText})));
}
async function versionFlow(page,width,report){
 await page.goto('/versions');const center=page.getByTestId('bom-version-center');await center.waitFor();
 const list=center.getByTestId('bom-series-list'),detail=center.getByTestId('bom-series-detail'),search=list.getByRole('textbox',{name:'搜尋 BOM 系列',exact:true});
 const rows=await versionMetrics(center);report.seriesRows=rows;
 if(!baselineOnly){report.seriesTextBounds=await list.locator('.bom-series-row').evaluateAll(rows=>rows.map(row=>{const box=row.getBoundingClientRect(),meta=row.querySelector('.bom-series-metadata');const text=document.createRange();text.selectNodeContents(meta);const r=text.getBoundingClientRect();return{rowBottom:box.bottom,textBottom:r.bottom,textTop:r.top,metaHeight:meta.getBoundingClientRect().height}}));assert.ok(report.seriesTextBounds.every(x=>x.textBottom<=x.rowBottom-1),'Series metadata text must fit the 48px row: '+JSON.stringify(report.seriesTextBounds));}
 if(baselineOnly){await page.screenshot({path:path.join(evidence,'before-versions-'+width+'.png')});return;}
 await frame(page,center,width);
 if(width>=1024){assert.ok(rows.every(row=>row.height>=44&&row.height<=50),JSON.stringify(rows));
 const upload=await list.getByRole('button',{name:/上傳 BOM/}).boundingBox(),find=await search.boundingBox();assert.ok(Math.abs(upload.y-find.y)<=1,'Upload and search share a row');report.uploadSearch={upload,find};}
 const group=list.locator('.bom-project-heading').filter({hasText:'Vera CPU'});await group.click();assert.equal(await group.getAttribute('aria-expanded'),'false');await group.press('Enter');assert.equal(await group.getAttribute('aria-expanded'),'true');
 await search.fill('找不到的系列');await center.getByText('找不到符合條件的 BOM 系列',{exact:true}).waitFor();await search.fill('');
 await list.getByRole('button',{name:/上傳 BOM/}).click();assert.ok(await page.evaluate(()=>window.__bomUiFixture.calls.some(c=>c.name==='uploadNew')));
 await list.getByRole('button',{name:/超長系列名稱/}).click();await detail.waitFor();if(width<1024){await detail.getByRole('button',{name:'返回清單',exact:true}).click();await list.waitFor();}
 await list.getByRole('button',{name:/Vera_CPU_Rack_E1\.S/}).first().click();await detail.waitFor();
 await detail.getByRole('button',{name:'上傳新版本',exact:true}).click();assert.ok(await page.evaluate(()=>window.__bomUiFixture.calls.some(c=>c.name==='uploadVersion')));
 await detail.getByRole('button',{name:'修改系列名稱',exact:true}).click();await detail.getByRole('textbox',{name:'系列名稱',exact:true}).fill('QA 單行版本管理');await detail.getByRole('button',{name:'儲存名稱',exact:true}).click();await detail.getByRole('heading',{name:'QA 單行版本管理',exact:true}).waitFor();
 const table=detail.getByTestId('bom-version-table'),row=table.locator('tr[data-version-id]').first();
 const cells=await row.locator('td').evaluateAll(cells=>cells.map(cell=>({text:cell.innerText,whiteSpace:getComputedStyle(cell).whiteSpace,height:cell.getBoundingClientRect().height,children:[...cell.children].map(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,height:n.getBoundingClientRect().height,display:getComputedStyle(n).display}))})));
 report.versionCells=cells;const actionBounds=await row.locator('td').last().evaluate(el=>{const b=el.getBoundingClientRect(),s=el.closest('.bom-version-table-scroll').getBoundingClientRect();return{left:b.left,right:b.right,hostLeft:s.left,hostRight:s.right}});report.actionBounds=actionBounds;if(width>=768)assert.ok(actionBounds.left>=actionBounds.hostLeft-1&&actionBounds.right<=actionBounds.hostRight+1,'Version row actions stay visible at default table position: '+JSON.stringify(actionBounds));assert.ok(cells.every(cell=>cell.height<=(width<1024?66:56)),JSON.stringify(cells));assert.ok(cells.every(cell=>cell.whiteSpace==='nowrap'),'Every version data cell keeps a single line');
 const actionGroup=await row.locator('td').last().locator(':scope > div').evaluate(el=>({wrap:getComputedStyle(el).flexWrap,tops:[...el.children].map(n=>n.getBoundingClientRect().top)}));assert.equal(actionGroup.wrap,'nowrap');assert.ok(Math.max(...actionGroup.tops)-Math.min(...actionGroup.tops)<=1);
 await row.getByRole('button',{name:'編輯說明',exact:true}).click();await detail.getByLabel('版本標籤',{exact:true}).fill('QA 單行標籤');await detail.getByLabel('版本說明',{exact:true}).fill('QA 保留完整說明');await page.screenshot({path:path.join(evidence,'version-edit-'+width+'.png')});await detail.getByRole('button',{name:'儲存',exact:true}).click();await page.waitForFunction(()=>window.__bomUiFixture.calls.some(c=>c.name==='editVersion'));
 await row.getByRole('button',{name:'頁數',exact:true}).click();assert.ok(await page.evaluate(()=>window.__bomUiFixture.calls.some(c=>c.name==='pages')));
 await detail.getByRole('button',{name:'比對版本',exact:true}).click();await center.getByTestId('bom-diff-view').waitFor();await center.getByRole('button',{name:'← 返回系列',exact:true}).click();await detail.waitFor();
 await table.evaluate(el=>el.parentElement.scrollLeft=0);await frame(page,center,width);await page.screenshot({path:path.join(evidence,'versions-'+width+'.png')});
 if(width<1024){const bounds=await detail.locator('.bom-version-table-scroll').evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth}));assert.ok(bounds.scrollWidth>bounds.width,'Version table alone scrolls sideways on phone');}
 await center.locator('[data-ui="dialog-close"]').click();await center.waitFor({state:'hidden'});
}
async function trackerFlow(page,width,report){
 await page.goto('/?qaMainRows&qaPages');await page.getByTestId('material-table-card').waitFor();const tracker=await openTracker(page,width);
 await tracker.getByLabel('總頁數',{exact:true}).fill('56');await tracker.getByLabel('第 56 頁標題',{exact:true}).waitFor({state:'attached'});
 if(width<768){await page.screenshot({path:path.join(evidence,'tracker-mobile-default-'+width+'.png')});await tracker.getByRole('button',{name:'頁面總覽與批次設定',exact:true}).click();}
 report.tracker=await geometry(page,tracker);
 if(baselineOnly){await page.screenshot({path:path.join(evidence,'before-tracker-'+width+'.png')});return;}
 await frame(page,tracker,width);
 const g=report.tracker;assert.ok(g.batch.bottom<=g.map.y+1,'Batch control precedes the page overview');assert.ok(g.filter.bottom<=g.table.y+1&&g.table.y-g.filter.bottom<=16,'Filters directly precede results');
 if(width>=1024&&fs.existsSync(baselinePath)){const before=JSON.parse(fs.readFileSync(baselinePath)).checks.find(c=>c.width===width)?.tracker;if(before){report.overviewWithBatch=g.map.bottom-g.batch.y;report.mapRatio=report.overviewWithBatch/before.map.height;assert.ok(report.mapRatio<=.79,'Overview including moved batch should shrink at least one quarter: '+JSON.stringify({before:before.map.height,after:report.overviewWithBatch}));}}
 const title=tracker.getByLabel('第 1 頁標題',{exact:true}),note=tracker.getByLabel('第 1 頁備註',{exact:true});await title.fill('QA compact page title');await note.fill('QA note survives status changes');
 const batch=tracker.getByTestId('bom-page-tracker-batch');await tracker.getByLabel('起始頁',{exact:true}).fill('1');await tracker.getByLabel('結束頁',{exact:true}).fill('3');
 const batchColors=await batch.locator('[data-status]').evaluateAll(nodes=>nodes.map(n=>({status:n.dataset.status,color:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor})));
 assert.equal(new Set(batchColors.map(c=>c.color)).size,3,'Batch status labels use3 semantic colors');report.batchColors=batchColors;
 for(const label of ['已完成','待處理','已完成但缺料']){await batch.getByRole('button',{name:label,exact:true}).click();assert.equal(await title.inputValue(),'QA compact page title');assert.equal(await note.inputValue(),'QA note survives status changes');}
 const rowStatus=tracker.getByRole('group',{name:'第 1 頁狀態',exact:true});await rowStatus.getByRole('button',{name:'已完成',exact:true}).click();await rowStatus.getByRole('button',{name:'待處理',exact:true}).click();
 const filters=tracker.getByRole('group',{name:'篩選狀態',exact:true});report.filterColors=await filters.getByRole('button').evaluateAll(nodes=>nodes.map(n=>({text:n.innerText,color:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor})));
 assert.ok(new Set(report.filterColors.map(c=>c.color)).size>=3);
 await filters.getByRole('button',{name:/^已完成但缺料/}).click();await tracker.getByLabel('搜尋頁面',{exact:true}).fill('不存在的頁面');await tracker.getByText('目前篩選條件沒有符合的頁面',{exact:true}).waitFor();assert.equal(await tracker.getByRole('columnheader').count(),4);await tracker.getByTestId('bom-page-tracker-filters').getByRole('button',{name:'全部清除',exact:true}).click();
 await page.screenshot({path:path.join(evidence,'tracker-'+width+'.png')});
 await tracker.getByLabel('總頁數',{exact:true}).fill('500');await tracker.getByLabel('第 500 頁標題',{exact:true}).waitFor({state:'attached'});const range=tracker.getByLabel('選擇頁碼範圍',{exact:true});assert.equal(await range.locator('option').count(),10);assert.equal(await tracker.locator('[data-map-page]').count(),50);
 await range.selectOption('9');await tracker.locator('[data-map-page="500"]').click();assert.equal(await tracker.getByLabel('起始頁',{exact:true}).inputValue(),'500');await tracker.getByRole('button',{name:'上一段頁碼',exact:true}).click();await tracker.getByRole('button',{name:'下一段頁碼',exact:true}).click();assert.equal(await range.inputValue(),'9');
 await range.selectOption('0');await tracker.locator('[data-map-page="5"]').click();await tracker.locator('[data-map-page="9"]').click({modifiers:['Shift']});assert.equal(await tracker.getByLabel('起始頁',{exact:true}).inputValue(),'5');assert.equal(await tracker.getByLabel('結束頁',{exact:true}).inputValue(),'9');
 await tracker.getByLabel('目前做到第幾頁',{exact:true}).fill('500');await tracker.getByRole('button',{name:'跳到目前頁',exact:true}).click();assert.equal(await tracker.locator('tr[data-current="true"]').getAttribute('data-testid'),'bom-page-tracker-row');
 const title500=tracker.getByLabel('第 500 頁標題',{exact:true});await title500.fill('QA500 retained');await tracker.getByLabel('第 500 頁備註',{exact:true}).fill('QA500 note');
 await tracker.getByRole('button',{name:'儲存頁數進度',exact:true}).click();await tracker.waitFor({state:'hidden'});await openTracker(page,width);assert.equal(await title500.inputValue(),'QA500 retained');assert.equal(await tracker.getByLabel('第 1 頁備註',{exact:true}).inputValue(),'QA note survives status changes');await tracker.getByRole('button',{name:'關閉',exact:true}).click();
 if(width>=1024)await toolbarFlow(page,width,report);
}
async function toolbarFlow(page,width,report){
 const toolbar=page.getByTestId('material-table-toolbar'),summary=toolbar.locator('[data-material-zone="summary-filters"] > button');
 const controls=[toolbar.getByRole('combobox',{name:'搜尋篩選工具',exact:true}),summary.nth(0),summary.nth(1),toolbar.getByRole('combobox',{name:'排序',exact:true}),toolbar.getByTestId('material-column-visibility'),toolbar.getByTestId('material-export-visible'),toolbar.getByTestId('material-personal-marks-filter')];
 report.toolbar=[];
 for(const control of controls)report.toolbar.push(await control.evaluate(el=>{
  const rgba=v=>{const x=v.match(/[\d.]+/g)?.map(Number)||[0,0,0];return[x[0],x[1],x[2],x[3]??1]};
  const over=(front,back)=>front.slice(0,3).map((v,i)=>v*front[3]+back[i]*(1-front[3]));
  const chain=[];for(let node=el;node;node=node.parentElement)chain.push(rgba(getComputedStyle(node).backgroundColor));let bg=[0,0,0];for(const layer of chain.reverse())bg=over(layer,bg);
  const style=getComputedStyle(el),fg=over(rgba(style.color),bg),luma=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0),a=luma(fg),b=luma(bg);
  return{text:el.textContent,aria:el.getAttribute('aria-label'),color:style.color,bg:style.backgroundColor,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
 }));
 assert.equal(new Set(report.toolbar.map(x=>x.bg)).size,7,'Seven toolbar actions have distinct semantic surfaces');assert.ok(report.toolbar.every(x=>x.contrast>=4.5),JSON.stringify(report.toolbar));
 await controls[0].click();const option=page.getByRole('option').nth(1);const optionText=await option.innerText();await option.click();assert.match(await controls[0].innerText(),new RegExp(optionText.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));await toolbar.getByTestId('material-active-filters').getByRole('button',{name:'全部清除',exact:true}).click();
 await controls[3].click();const sorts=page.getByRole('option');await sorts.nth(1).click();
 await summary.nth(1).click();await toolbar.getByTestId('material-active-filters').waitFor();await summary.nth(0).click();
 await controls[4].click();const settings=page.getByTestId('material-table-settings');await settings.waitFor();assert.ok(await settings.getByRole('checkbox').count()>10);await settings.getByRole('button',{name:'取消',exact:true}).click();await settings.waitFor({state:'hidden'});
 await controls[6].click();assert.equal(await controls[6].getAttribute('aria-pressed'),'true');await controls[6].click();assert.equal(await controls[6].getAttribute('aria-pressed'),'false');
 const downloadPromise=page.waitForEvent('download');await controls[5].click();const download=await downloadPromise,file=path.join(evidence,'visible-columns-'+width+'.xlsx');await download.saveAs(file);assert.ok(fs.statSync(file).size>1000);report.export={name:download.suggestedFilename(),bytes:fs.statSync(file).size};
 await page.screenshot({path:path.join(evidence,'toolbar-'+width+'.png')});
}
(async()=>{
 fs.mkdirSync(evidence,{recursive:true});let server,browser;const report={result:'running',baseline:baselineOnly,checks:[]};
 try{const{createServer}=await import('vite'),mock=path.resolve('tests/support/materialBomPagePdfAiMock.js'),snapshots=new Map();
 if(baselineOnly)for(const file of ['BomVersionCenter.tsx','bomVersionCenter.css','BomPageTrackerDialog.tsx','bomPageTracker.css']){const rel='src/components/material-requests/'+file;snapshots.set(path.resolve(rel).replaceAll('\\','/'),execFileSync('git',['show','HEAD:'+rel],{encoding:'utf8'}));}
 server=await createServer({configFile:false,root:process.cwd(),cacheDir:path.join(evidence,baselineOnly?'.vite-before':'.vite-after'),resolve:{alias:[{find:/^@\/(components\/auth\/UserContext|hooks\/usePermissions|components\/test-projects\/TestProjectProvider|integrations\/supabase\/client)$/,replacement:mock},{find:/^\.\/(materialBomStorage|useMaterialBomPresence|materialRequestAudit)$/,replacement:mock},{find:'@',replacement:path.resolve('src')}]},worker:{format:'es'},optimizeDeps:{entries:['tests/support/bomVersionUiFixture.jsx','tests/support/materialWorkspaceFixture.jsx'],include:['react/jsx-dev-runtime']},server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd(),fs.realpathSync('node_modules')]}},plugins:[{name:'density-baseline',enforce:'pre',load(id){return snapshots.get(id.split('?')[0].replaceAll('\\','/'))}},{name:'density-fixtures',configureServer(vite){vite.middlewares.use((req,res,next)=>{const pathname=req.url?.split('?')[0];if(pathname!=='/'&&pathname!=='/versions')return next();res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/'+(pathname==='/versions'?'bomVersionUiFixture.jsx':'materialWorkspaceFixture.jsx')+'"></script></html>')})}}]});await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;browser=await chromium.launch({channel:'chrome'});
 for(const width of baselineOnly?[1543,1280]:(process.env.BOM_DENSITY_WIDTHS||'1543,1280,390').split(',').map(Number)){
 const context=await browser.newContext({viewport:{width,height:884},baseURL:origin,isMobile:width<1024,hasTouch:width<1024,reducedMotion:'reduce',locale:'zh-TW'});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);const result={width};report.checks.push(result);
 try{if(!process.env.BOM_DENSITY_TOOLBAR_ONLY)await versionFlow(page,width,result);if(process.env.BOM_DENSITY_TOOLBAR_ONLY){await page.goto('/?qaMainRows&qaPages');await page.getByTestId('material-table-card').waitFor();await toolbarFlow(page,width,result);}else await trackerFlow(page,width,result);assert.deepEqual(errors,[]);result.result='passed';}catch(e){await page.screenshot({path:path.join(evidence,'failure-'+width+'.png')}).catch(()=>{});throw e;}finally{await context.close();}
 }
 report.result='passed';console.log(JSON.stringify(report,null,2));
 }catch(e){report.result='failed';report.error=e.stack;console.error(e);process.exitCode=1;}finally{fs.writeFileSync(baselineOnly?baselinePath:path.join(evidence,'report.json'),JSON.stringify(report,null,2));await browser?.close();await server?.close();}
})();
