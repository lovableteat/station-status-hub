// Run materialWorkspace.browser.cjs first; all data and mutations remain in its isolated mock.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(process.env.AUDIT_QA_DIR||'../qa-tools','package.json'))('playwright');
const origin=process.env.MATERIAL_QA_URL||'http://127.0.0.1:8096';
const evidence=path.resolve(process.env.MATERIAL_B_EVIDENCE_DIR||'../material-mobile-b-evidence');
fs.mkdirSync(evidence,{recursive:true});

async function open(browser,width=1440,height=900){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width<768?3:1,isMobile:width<768,hasTouch:width<768,reducedMotion:'reduce',locale:'zh-TW',timezoneId:'Asia/Taipei'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/?qaMainRows&qaPages');
 await page.getByTestId('material-table-card').waitFor();
 await page.waitForFunction(compact=>document.querySelectorAll(compact?'[data-testid="material-mobile-list-row"]':'table.material-table-crosshair tbody tr').length>0,width<1024);
 await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
 await page.evaluate(()=>document.fonts.ready);
 return{context,page,errors};
}
async function structure(page){return page.evaluate(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}};
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
 return{viewport:{w:innerWidth,h:innerHeight,pageWidth:document.documentElement.scrollWidth},
  overview:[...document.querySelectorAll('[data-material-zone="overview"], [data-testid="material-table-card"], [data-testid="material-table-toolbar"], [data-testid="material-pagination"]')].map(e=>({id:e.dataset.testid||e.dataset.materialZone,rect:rect(e)})),
  table:[...document.querySelectorAll('table.material-table-crosshair')].filter(visible).map(t=>({rect:rect(t),heads:[...t.querySelectorAll('thead th')].map(e=>({text:e.innerText,rect:rect(e)})),rows:[...t.querySelectorAll('tbody tr')].map(r=>({text:r.innerText,rect:rect(r),cells:[...r.querySelectorAll('td')].map(c=>({key:c.dataset.materialCell||'',text:c.innerText,rect:rect(c)}))}))})),
  buttons:[...document.querySelectorAll('button')].filter(visible).map(e=>({name:e.getAttribute('aria-label')||e.innerText,rect:rect(e),disabled:e.disabled}))};
 });}
async function pixels(page,before,after){if(before.equals(after))return{different:0,total:0,exact:true};return page.evaluate(async([a,b])=>{
 const decode=async data=>{const binary=atob(data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);return{w:bitmap.width,h:bitmap.height,pixels:ctx.getImageData(0,0,bitmap.width,bitmap.height).data}};
 const first=await decode(a),second=await decode(b);if(first.w!==second.w||first.h!==second.h)return{different:-1,total:first.w*first.h,exact:false};let different=0;for(let i=0;i<first.pixels.length;i+=4){if(first.pixels[i]!==second.pixels[i]||first.pixels[i+1]!==second.pixels[i+1]||first.pixels[i+2]!==second.pixels[i+2]||first.pixels[i+3]!==second.pixels[i+3])different++}return{different,total:first.w*first.h,exact:different===0};
 },[before.toString('base64'),after.toString('base64')]);}
async function desktop(browser,baseline){const{context,page,errors}=await open(browser);try{
 const state=await structure(page),file=path.join(evidence,baseline?'desktop-before.png':'desktop-after.png');const png=await page.screenshot({path:file});
 if(baseline){fs.writeFileSync(path.join(evidence,'desktop-before.json'),JSON.stringify(state,null,2));console.log('Desktop baseline: '+file);}
 else{const prior=JSON.parse(fs.readFileSync(path.join(evidence,'desktop-before.json'),'utf8'));assert.deepEqual(state,prior,'desktop structure and geometry changed');const comparison=await pixels(page,fs.readFileSync(path.join(evidence,'desktop-before.png')),png);fs.writeFileSync(path.join(evidence,'desktop-comparison.json'),JSON.stringify({structureEqual:true,pixels:comparison,errors},null,2));assert.ok(comparison.exact,'desktop pixels changed: '+JSON.stringify(comparison));console.log('Desktop geometry and pixels unchanged');}
 assert.deepEqual(errors,[]);
 }finally{await context.close()}}

async function mobileGeometry(page){return page.evaluate(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return{w:r.width,h:r.height,x:r.x,y:r.y}};
 const rows=[...document.querySelectorAll('[data-testid="material-mobile-list-row"]')];
 const numbers=[...document.querySelectorAll('.material-mobile-list-number-value:not(.is-empty)')];
 const statusParts=rows.map(row=>{const origin=rect(row);return Object.fromEntries([['dot','.material-mobile-list-status-dot'],['label','.material-mobile-list-status-label'],['arrow','.material-mobile-list-status > svg']].map(([key,selector])=>{const r=rect(row.querySelector(selector));return[key,{x:r.x-origin.x,y:r.y-origin.y,w:r.w,h:r.h}]}))});
 return{width:innerWidth,pageWidth:document.documentElement.scrollWidth,rows:rows.map(e=>rect(e).h),numbers:numbers.map(e=>({text:e.textContent,font:getComputedStyle(e).fontSize,fits:e.scrollWidth<=e.clientWidth})),marks:rows.map(e=>rect(e.querySelector('.material-mobile-list-mark'))),tracking:rows.map(e=>rect(e.querySelector('[data-testid="material-mobile-row-tracking"]'))),statusParts};
 });}
async function mobile(browser){
 const report={widths:[],checks:[],errors:[]};
 try{
  for(const width of[375,390,430,498,536]){const{context,page,errors}=await open(browser,width,844);try{
   const measure=await mobileGeometry(page);assert.equal(measure.width,measure.pageWidth);assert.ok(measure.rows.length>0&&measure.rows.every(h=>h===68));assert.ok(measure.numbers.every(n=>n.font==='16px'&&n.fits));assert.ok(measure.marks.every(r=>r.w===44&&r.h===44));assert.ok(measure.tracking.every(r=>r.w===104&&r.h===48));assert.deepEqual(errors,[]);report.widths.push(measure);
   for(const parts of measure.statusParts){assert.equal(parts.label.w,78,'status badges must use the same column width');assert.equal(parts.label.h,38,'one- and two-line status badges must have equal heights');assert.deepEqual(parts,measure.statusParts[0],'dots, badges and arrows must align across status lengths');}
   assert.equal(await page.locator('.material-mobile-list-name').count(),measure.rows.length);assert.equal(await page.locator('.material-mobile-list-fields').count(),0,'list summary shows names without Item or the scrolling field strip');
   if([390,498,536].includes(width))await page.screenshot({path:path.join(evidence,`mobile-${width}-main.png`)});
  }finally{await context.close()}}
  const{context,page,errors}=await open(browser,390,844);try{
   const rows=page.getByTestId('material-mobile-list-row'),first=rows.first(),recordId=await first.getAttribute('data-record-id');
   const target=()=>page.locator(`[data-testid="material-mobile-list-row"][data-record-id="${recordId}"]`);
   const pressed=async value=>page.waitForFunction(([id,expected])=>document.querySelector(`[data-testid="material-mobile-list-row"][data-record-id="${id}"] .material-mobile-list-mark`)?.getAttribute('aria-pressed')===expected,[recordId,String(value)]);
   await first.getByRole('button',{name:'加入我的標記',exact:true}).tap();await pressed(true);
   await page.getByRole('group',{name:'料件範圍',exact:true}).getByRole('button',{name:/我的標記/}).tap();assert.equal(await rows.count(),1);assert.equal(await rows.first().getAttribute('data-record-id'),recordId);
   await page.getByRole('button',{name:'QA 帳號 B（檢視）',exact:true}).tap();await page.getByRole('group',{name:'料件範圍',exact:true}).getByRole('button',{name:/^全部/}).tap();await target().waitFor();await pressed(false);
   await page.getByRole('button',{name:'QA 帳號 A',exact:true}).tap();await target().waitFor();await pressed(true);await target().getByRole('button',{name:'移除我的標記',exact:true}).tap();await pressed(false);report.checks.push('private mark, marked filter, account isolation and unmark');
   const columns=page.getByTestId('material-column-visibility').filter({visible:true}).first();await columns.tap();const settings=page.getByTestId('material-table-settings');await settings.waitFor();assert.equal(await settings.getByRole('checkbox').count(),17);
   await page.screenshot({path:path.join(evidence,'mobile-390-columns.png')});
   await settings.getByRole('checkbox',{name:'實體料號',exact:true}).tap();await settings.getByRole('button',{name:'取消',exact:true}).tap();await settings.waitFor({state:'hidden'});assert.equal(await first.locator('.material-mobile-list-number').count(),2);
   await columns.tap();await settings.getByRole('checkbox',{name:'實體料號',exact:true}).tap();await settings.getByRole('checkbox',{name:'Manufacturer',exact:true}).tap();await settings.getByRole('button',{name:'套用設定',exact:true}).tap();await settings.waitFor({state:'hidden'});
   assert.equal(await first.locator('.material-mobile-list-number').count(),1);assert.equal(await first.locator('.material-mobile-list-name').count(),1);assert.ok((await mobileGeometry(page)).rows.every(h=>h===68));
   await columns.tap();await settings.getByRole('button',{name:'全部顯示',exact:true}).tap();await settings.getByRole('button',{name:'套用設定',exact:true}).tap();await settings.waitFor({state:'hidden'});assert.equal(await first.locator('.material-mobile-list-number').count(),2);assert.ok((await mobileGeometry(page)).rows.every(h=>h===68));report.checks.push('existing 17 columns, cancel/apply/all-show and equal heights');
   const search=page.getByRole('textbox',{name:'快速搜尋料號',exact:true});await search.fill('QA-PHYSICAL-CAP');await page.waitForFunction(()=>document.querySelectorAll('[data-testid="material-mobile-list-row"]').length===1);
   await rows.first().getByTestId('material-mobile-row-open').tap();const detail=page.getByTestId('material-mobile-detail');await detail.waitFor();const detailHeading=await detail.locator('.material-mobile-detail-heading').evaluate(e=>{const box=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,cy:r.y+r.height/2}};return{header:box(e),title:box(e.querySelector('h2')),close:box(e.querySelector('[aria-label="關閉料件詳情"]')),viewport:innerWidth}});assert.ok(detailHeading.header.h<=88&&detailHeading.close.x>detailHeading.viewport/2&&Math.abs(detailHeading.close.cy-detailHeading.title.cy)<30,'detail close button must sit beside title');assert.ok(detailHeading.close.w>=44&&detailHeading.close.h>=44);report.detailHeading=detailHeading;assert.equal(await detail.getByTestId('material-mobile-location').count(),2);assert.ok((await detail.innerText()).includes('QA-ALT-ODM'));assert.ok((await detail.innerText()).includes('QA-ALT-FOOTPRINT'));
   await page.screenshot({path:path.join(evidence,'mobile-390-details.png')});
   const note=detail.locator('details.material-mobile-note');await note.locator('summary').tap();await note.getByTestId('material-note-input').fill('QA B 手機備註');await note.getByTestId('material-note-input').press('Enter');await note.locator('[aria-label="Note 已儲存"]').waitFor();
   const alternate=detail.getByRole('button').filter({has:page.getByText('QA-ALT-ODM',{exact:true})});await alternate.tap();const editor=page.locator('.material-record-dialog');await editor.waitFor();assert.ok((await editor.getByTestId('material-record-mpn').innerText()).includes('QA-ALT-ODM'));await editor.getByTestId('material-record-save-footer').getByRole('button',{name:'關閉',exact:true}).tap();await editor.waitFor({state:'hidden'});await detail.waitFor({state:'hidden'});assert.equal(await search.inputValue(),'QA-PHYSICAL-CAP');report.checks.push('merged two locations, alternatives, Note save and alternate detail return');
   const trackedRecordId=await rows.first().getAttribute('data-record-id'),tracked=page.locator(`[data-testid="material-mobile-list-row"][data-record-id="${trackedRecordId}"]`),status=tracked.locator('.material-mobile-list-status-label'),before=await status.innerText();await tracked.getByTestId('material-mobile-row-tracking').tap();await editor.waitFor();const statusChoices=await editor.getByRole('radio').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')));assert.ok(statusChoices.includes('已發信')&&statusChoices.includes('已完成'));report.statusChoices=statusChoices;
   await page.screenshot({path:path.join(evidence,'mobile-390-update.png')});await editor.getByRole('radio',{name:'已發信',exact:true}).check();await editor.getByTestId('material-record-save-footer').getByRole('button',{name:'取消',exact:true}).tap();await editor.waitFor({state:'hidden'});assert.equal(await status.innerText(),before);
   await tracked.getByTestId('material-mobile-row-tracking').tap();await editor.getByRole('radio',{name:'已發信',exact:true}).check();await editor.getByRole('button',{name:'儲存資料與追蹤',exact:true}).tap();await editor.waitFor({state:'hidden'});assert.equal(await status.innerText(),'已發信');assert.ok((await mobileGeometry(page)).rows.every(h=>h===68));report.trackingRecordId=trackedRecordId;report.checks.push('existing status choices, cancel preserves value and save follows the correct record through display regrouping');
   await page.setViewportSize({width:390,height:500});await tracked.getByTestId('material-mobile-row-tracking').tap();await editor.getByRole('textbox',{name:'追蹤說明',exact:true}).focus();const footer=await editor.getByRole('button',{name:'儲存資料與追蹤',exact:true}).evaluate(e=>{const r=e.getBoundingClientRect();return{top:r.top,bottom:r.bottom,viewport:innerHeight}});assert.ok(footer.top>=0&&footer.bottom<=footer.viewport);report.shortViewport=footer;await editor.getByTestId('material-record-save-footer').getByRole('button',{name:'取消',exact:true}).tap();report.checks.push('500px viewport keeps save/cancel reachable');
   assert.deepEqual(errors,[]);report.errors.push(...errors);
  }catch(error){await page.screenshot({path:path.join(evidence,'mobile-failure.png')});throw error}finally{await context.close()}
  report.result='passed';console.log('Mobile B: '+report.checks.join('; '));
 }catch(error){report.result='failed';report.errors.push(error.message);throw error}finally{fs.writeFileSync(path.join(evidence,'mobile-checks.json'),JSON.stringify(report,null,2))}
}

(async()=>{const browser=await chromium.launch({channel:'chrome'});try{if(process.argv.includes('--baseline'))await desktop(browser,true);else if(process.argv.includes('--mobile'))await mobile(browser);else await desktop(browser,false);}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
