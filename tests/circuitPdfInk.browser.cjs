// Actual pointer interaction against generated PDFs and isolated preference rows; no production data or AI calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { jsPDF } = require('jspdf');
const { chromium } = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'))('playwright');
const { createCircuitChangesServer } = require('./support/circuitChangesServer.cjs');
const evidence = path.resolve(process.env.CIRCUIT_INK_EVIDENCE_DIR || '../circuit-ink-evidence');
const dialog = page => page.getByTestId('circuit-changes-dialog');
const panel = page => page.getByTestId('circuit-pdf-panel');
const inkLayer = (page, pane = 'active') => panel(page).locator(`.circuit-pdf-page[data-pane="${pane}"] .circuit-pdf-ink-layer`);
const strokeCount = (page, pane = 'active') => inkLayer(page, pane).locator('[data-ink-id]').count();
const strokeRows = (fixture, doc, page = 1) => fixture.state.inkRows.get(`circuit-pdf-ink:series:qa:${doc}:${page}`)?.column_order?.strokes || [];
const activeRows = (...args) => strokeRows(...args).filter(row => !row.removedAt);

function schematic(label) {
  const pdf = new jsPDF({ unit:'pt', format:[1190,842], orientation:'landscape' });
  for (let page = 1; page <= 3; page++) {
    if (page > 1) pdf.addPage([1190,842], 'landscape');
    pdf.setFontSize(24); pdf.text(`${label} - sheet ${page}`, 50, 60);
    pdf.setFontSize(13); pdf.rect(190,210,130,60); pdf.text('U2',210,235); pdf.line(320,240,750,240); pdf.text('P12V_EN',500,225);
  }
  return Buffer.from(pdf.output('arraybuffer'));
}
async function eventually(read, message, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await read()) return; await new Promise(resolve=>setTimeout(resolve,100)); }
  throw Error(message);
}
async function rendered(page) {
  await page.waitForFunction(()=>{ const surfaces=[...document.querySelectorAll('.circuit-pdf-surface')]; return surfaces.length>0 && surfaces.every(node=>node.dataset.rendering==='false'); });
  await inkLayer(page).waitFor();
  await page.waitForFunction(()=>!document.querySelector('.circuit-pdf-ink-status')?.textContent.includes('載入'));
}
async function tool(page, name) { await panel(page).getByRole('button',{name,exact:true}).click(); }
async function gotoPage(page, value) {
  const input=panel(page).getByLabel('目前頁碼',{exact:true}); await input.fill(String(value)); await input.press('Enter');
  await page.waitForFunction(number=>document.querySelector('input[aria-label="目前頁碼"]')?.value===String(number),value); await rendered(page);
}
async function draw(page, pane='active', from=[.2,.4], to=[.55,.5], during) {
  await tool(page,'畫筆');
  const layer=inkLayer(page,pane); await layer.scrollIntoViewIfNeeded(); const box=await layer.boundingBox();
  if(page.viewportSize().width<1024){
    const cdp=await page.context().newCDPSession(page),touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{id:1,x,y,radiusX:2,radiusY:2,force:1}]});
    await touch('touchStart',box.x+box.width*from[0],box.y+box.height*from[1]);
    for(let index=1;index<=8;index++)await touch('touchMove',box.x+box.width*(from[0]+(to[0]-from[0])*index/8),box.y+box.height*(from[1]+(to[1]-from[1])*index/8));
    if(during)await during();await touch('touchEnd');await cdp.detach();return;
  }
  await page.mouse.move(box.x+box.width*from[0],box.y+box.height*from[1]); await page.mouse.down();
  await page.mouse.move(box.x+box.width*to[0],box.y+box.height*to[1],{steps:12});
  if (during) await during();
  await page.mouse.up();
}
async function erase(page,pane='active',point=[.35,.443]) {
  await tool(page,'橡皮擦'); const layer=inkLayer(page,pane); await layer.scrollIntoViewIfNeeded(); const box=await layer.boundingBox();
  await page.mouse.click(box.x+box.width*point[0],box.y+box.height*point[1]);
}
async function frame(page,pane='active') {
  await tool(page,'框選'); const surface=panel(page).locator(`.circuit-pdf-page[data-pane="${pane}"] .circuit-pdf-surface`);
  await surface.scrollIntoViewIfNeeded(); const box=await surface.boundingBox();
  await page.mouse.move(box.x+box.width*.12,box.y+box.height*.32); await page.mouse.down();
  await page.mouse.move(box.x+box.width*.7,box.y+box.height*.65,{steps:5}); await page.mouse.up();
  await panel(page).getByRole('group',{name:'加入框選區域'}).waitFor();
}
async function redPixels(page, bytes) {
  return page.evaluate(async data=>{
    const image=new Image(); image.src='data:image/png;base64,'+data; await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let red=0;
    for(let at=0;at<pixels.length;at+=4) if(pixels[at]>180&&pixels[at+1]<120&&pixels[at+2]<120&&pixels[at+3]>200)red++;
    return {red,width:image.width,height:image.height};
  },bytes.toString('base64'));
}
async function toolbarFits(page,width) {
  const geometry=await panel(page).locator('.circuit-pdf-row').evaluate(node=>{
    const rect=element=>{const r=element.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
    return{row:rect(node),toolbar:rect(node.parentElement),overflowY:node.scrollHeight-node.clientHeight,buttons:[...node.querySelectorAll('.circuit-pdf-tool-group > button')].map(rect),draw:[...node.querySelectorAll('[data-group="draw"] > button')].map(rect),wrap:getComputedStyle(node).flexWrap};
  });
  assert.equal(geometry.wrap,'nowrap'); assert.ok(geometry.toolbar.height<=(width<1024?62:58),JSON.stringify(geometry));
  assert.ok(geometry.overflowY<=1,'The toolbar must not acquire a second row');
  assert.ok(geometry.buttons.every(b=>b.height>=(width<1024?44:32)&&Math.abs(b.top-geometry.buttons[0].top)<=1),JSON.stringify(geometry));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  if(width<1024)assert.ok(geometry.draw.every(b=>b.left>=-1&&b.right<=width+1),'Phone drawing tools are visible before scrolling');
  if(width<1024){const back=await panel(page).getByRole('button',{name:'返回修改內容',exact:true}).boundingBox();assert.ok(back.width>=44&&back.height>=44,'Phone return button must not shrink: '+JSON.stringify(back));}
  return geometry;
}
async function managerFits(page) {
  await panel(page).getByRole('button',{name:'選擇 PDF 版本',exact:true}).click();
  const manager=panel(page).getByRole('group',{name:'PDF 版本（依圖面日期）'});await manager.waitFor();
  const visible=await manager.evaluate(node=>{const r=node.getBoundingClientRect();const x=Math.round(r.left+r.width/2),y=Math.round(r.top+r.height/2);return {width:r.width,height:r.height,hit:node.contains(document.elementFromPoint(x,y))};});
  assert.ok(visible.width>250&&visible.height>300&&visible.hit,JSON.stringify(visible));
  await manager.getByRole('button',{name:'關閉 PDF 版本管理',exact:true}).click(); await manager.waitFor({state:'hidden'});
}

(async()=>{
  fs.mkdirSync(evidence,{recursive:true});
  const files=['Official_20261101.pdf','Working_20261110.pdf'].map(name=>path.join(evidence,name));files.forEach((file,index)=>fs.writeFileSync(file,schematic(index?'WORKING':'OFFICIAL')));
  const fixture=createCircuitChangesServer(),report={result:'running',checks:[],geometry:[]};
  const at='2026-11-10T00:00:00.000Z',setId='00000000-0000-4000-8000-000000000101';fixture.state.sets.set(setId,{id:setId,seriesId:'series:qa',workspaceId:'bom:qa-board:v2:qa0002',projectId:'qa-project',title:'PDF 畫筆驗證',fromLabel:'V1',toLabel:'V2',createdAt:at,updatedAt:at,createdBy:'00000000-0000-4000-8000-000000000001'});
  const {createServer}=await import('vite');const materialMock=path.resolve('tests/support/materialWorkspaceMock.js');let server,browser;const contexts=[];
  const check=name=>{report.checks.push(name);console.log('✓',name);};
  try{
    server=await createServer({configFile:false,root:process.cwd(),cacheDir:path.join(evidence,'vite-cache'),resolve:{alias:[
      {find:/^@\/(components\/auth\/UserContext|hooks\/usePermissions|components\/test-projects\/TestProjectProvider)$/,replacement:materialMock},
      {find:'@/integrations/supabase/client',replacement:path.resolve('tests/support/circuitChangesSupabaseMock.js')},
      {find:/^\.\/(materialBomStorage|useMaterialBomPresence|materialRequestAudit)$/,replacement:materialMock},{find:'@',replacement:path.resolve('src')},
    ]},worker:{format:'es'},optimizeDeps:{entries:['tests/support/circuitChangesFixture.jsx'],include:['react/jsx-dev-runtime','exceljs','pdfjs-dist']},server:{host:'127.0.0.1',port:0,fs:{allow:[process.cwd(),evidence,fs.realpathSync('node_modules')]}},plugins:[
      {name:'ink-fixture-storage',enforce:'pre',resolveId(source,importer){if(!importer?.replaceAll('\\','/').includes('/circuit-changes/'))return;if(source==='./storage')return path.resolve('tests/support/circuitChangesStorageMock.js');if(source==='./pdfStorage')return path.resolve('tests/support/circuitChangesPdfStorageMock.js');if(source==='./officialPdfStorage')return path.resolve('tests/support/circuitPdfOfficialMock.js');}},
      {name:'ink-fixture-http',configureServer(vite){vite.middlewares.use(fixture.middleware);vite.middlewares.use((req,res,next)=>{if(req.url?.split('?')[0]!=='/')return next();res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/tests/support/circuitChangesFixture.jsx"></script></html>');});}},
    ]});await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
    browser=await chromium.launch({channel:'chrome'});
    const reopen=async(page,width,account='A')=>{
      await page.goto(origin+'/?qaMainRows&qaPages&qaUser='+account);await page.getByTestId('material-table-card').waitFor();
      if(width<1024)await page.getByRole('button',{name:'排序與工具',exact:true}).click();
      await page.getByTestId('material-circuit-changes').filter({visible:true}).click();await dialog(page).waitFor();
      if(width<1024){await page.waitForFunction(()=>{const list=document.querySelector('[data-testid="circuit-changes-dialog"] .circuit-item-list');return list&&list.getAttribute('aria-busy')!=='true';});await page.waitForTimeout(300);await dialog(page).getByRole('button',{name:'看圖面',exact:true}).filter({visible:true}).first().click();}
      const official=fixture.state.pdfOfficials.get('series:qa')?.documentId;
      if(official){await rendered(page);await panel(page).getByRole('combobox',{name:'對照較早的 PDF 版本',exact:true}).selectOption(official);}
    };
    const open=async(width,account='A')=>{const context=await browser.newContext({viewport:{width,height:884},hasTouch:width<1024,isMobile:width<1024,reducedMotion:'reduce',locale:'zh-TW',timezoneId:'Asia/Taipei'});contexts.push(context);await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(25000);await reopen(page,width,account);return{page,errors,context};};
    const desktop=await open(1543),p=desktop.page;
    for(const [index,file] of files.entries()){
      if(index){const chooser=p.waitForEvent('filechooser');await panel(p).getByRole('button',{name:'上傳新 PDF',exact:true}).click();await(await chooser).setFiles(file);}
      else await panel(p).locator('input[aria-label="選擇原理圖 PDF"]').setInputFiles(file);
      await rendered(p);
      if(!index){
        await dialog(p).getByRole('tab', { name: /^官方版本/ }).click();
        await dialog(p).getByRole('button', { name: /^(設定|更換)官方版本$/ }).click();
        await dialog(p).getByRole('button', { name: `設為官方版本：Official_20261101.pdf`, exact: true }).click();
        await dialog(p).getByRole('button', { name: '確定更換', exact: true }).click();
        await dialog(p).locator('.circuit-official-history tbody tr').first().waitFor();
        await dialog(p).getByRole('tab', { name: /^線路 Review/ }).click();
        await eventually(()=>fixture.state.pdfOfficials.size===1,'Official pointer saves');await rendered(p);}
    }
    await panel(p).getByRole('combobox',{name:'對照較早的 PDF 版本',exact:true}).selectOption(fixture.state.pdfOfficials.get('series:qa').documentId);
    await p.waitForFunction(()=>document.querySelectorAll('.circuit-pdf-surface').length===2);await rendered(p);
    const registry=fixture.state.pdfRegistries.get('series:qa'),officialId=fixture.state.pdfOfficials.get('series:qa').documentId,workingId=registry.documents.find(row=>row.name==='Working_20261110.pdf').id;
    report.geometry.push({width:1543,...await toolbarFits(p,1543)});await managerFits(p);
    const hints=await dialog(p).getByRole('textbox',{name:'標題',exact:true}).evaluate(node=>({hint:getComputedStyle(node,'::placeholder').color,value:getComputedStyle(node).color}));
    assert.notEqual(hints.hint,hints.value);const tone=color=>{const n=color.match(/[0-9.]+/g).map(Number);return (n[0]+n[1]+n[2])/3*(n.length>3?n[3]:1);};assert.ok(tone(hints.hint)<tone(hints.value),'placeholders are lighter (dimmer) than typed text: '+JSON.stringify(hints));report.placeholder=hints;
    await dialog(p).getByRole('textbox',{name:'標題',exact:true}).fill('電源訊號調整');await eventually(()=>fixture.state.items.size===1,'The entered title still saves');
    check('1543px one-row compact toolbar, dim hints, version manager visible and upload button opens a real picker');

    const writes=fixture.state.inkWrites;
    await draw(p,'active',[.2,.4],[.55,.5],async()=>{assert.equal(fixture.state.inkWrites,writes,'Dragging must not write on every pointer move');});
    await eventually(()=>activeRows(fixture,workingId).length===1,'Working ink saved');assert.equal(await strokeCount(p,'active'),1);assert.equal(await strokeCount(p,'compare'),0);
    const stroke=activeRows(fixture,workingId)[0];assert.ok(stroke.points.length>3);assert.equal(stroke.byName,'QA 目前使用者');
    assert.ok(stroke.points.every(point=>point.x>=0&&point.x<=1&&point.y>=0&&point.y<=1));check('Real pointer pen draws and writes once after release, with normalized coordinates and actor');
    await draw(p,'compare',[.2,.4],[.55,.5]);await eventually(()=>activeRows(fixture,officialId).length===1,'Official-page overlay saved');
    assert.equal(await strokeCount(p,'active'),1);assert.equal(await strokeCount(p,'compare'),1);check('Official and working PDFs retain independent page annotations');
    await tool(p,'放大');await rendered(p);assert.equal(await strokeCount(p,'active'),1);await tool(p,'縮小');await rendered(p);assert.equal(await strokeCount(p,'active'),1);
    for(let step=0;step<4;step++)await tool(p,'放大');await rendered(p);await tool(p,'移動');
    // Beside a comparison each page scrolls in its own viewport (linked pan, b875962a), not the stage.
    const stage=panel(p).locator('.circuit-pdf-page[data-pane="active"] .circuit-pdf-viewport');await stage.evaluate(node=>{node.scrollLeft=0;node.scrollTop=0});const stageBox=await stage.boundingBox(),beforePanWrites=fixture.state.inkWrites;
    await p.mouse.move(stageBox.x+stageBox.width*.7,stageBox.y+180);await p.mouse.down();await p.mouse.move(stageBox.x+stageBox.width*.4,stageBox.y+140,{steps:8});await p.mouse.up();
    assert.ok(await stage.evaluate(node=>node.scrollLeft)>10,'The hand tool actually pans the PDF');assert.equal(fixture.state.inkWrites,beforePanWrites,'Panning does not write ink');
    await tool(p,'符合寬度');await rendered(p);
    await gotoPage(p,2);assert.equal(await strokeCount(p,'active'),0);assert.equal(await strokeCount(p,'compare'),0);
    await draw(p,'active');await eventually(()=>activeRows(fixture,workingId,2).length===1,'Second page ink saved');
    await gotoPage(p,1);assert.equal(await strokeCount(p,'active'),1);assert.equal(await strokeCount(p,'compare'),1);check('Zoom preserves placement; page 2 has separate strokes and page 1 returns unchanged');

    await draw(p,'active',[.24,.55],[.6,.6]);await eventually(()=>activeRows(fixture,workingId).length===2,'Second stroke saved');
    await tool(p,'撤回最後一筆畫筆');await eventually(()=>activeRows(fixture,workingId).length===1,'Undo records removal');assert.equal(await strokeCount(p,'active'),1);
    await erase(p);await eventually(()=>activeRows(fixture,workingId).length===0,'Eraser persists tombstone');assert.equal(await strokeCount(p,'active'),0);
    const removed=strokeRows(fixture,workingId).find(row=>row.id===stroke.id);assert.ok(removed.removedAt);assert.equal(removed.removedByName,'QA 目前使用者');
    await draw(p,'active');await eventually(()=>activeRows(fixture,workingId).length===1,'Replacement stroke saves');check('Undo removes last visible stroke; eraser removes clicked stroke with persistent audit metadata');

    await frame(p);await panel(p).getByRole('button',{name:'前後同區域加入',exact:true}).click();
    await eventually(()=>[...fixture.state.items.values()][0]?.content.images.length===2,'Both captured change images save');
    const item=[...fixture.state.items.values()][0];
    for(const image of item.content.images){const file=fixture.state.files.get(image.path);assert.ok(file);const pixels=await redPixels(p,file.bytes);assert.ok(pixels.red>100,`${image.side} crop must contain red pen pixels: ${JSON.stringify(pixels)}`);report[image.side+'Capture']=pixels;}
    check('Actual PDF capture embeds both official and working pen strokes into saved sharp PNG images');
    await p.screenshot({path:path.join(evidence,'desktop-1543-ink-capture.png')});

    await reopen(p,1543);await rendered(p);await gotoPage(p,1);assert.equal(await strokeCount(p,'active'),1);assert.equal(await strokeCount(p,'compare'),1);
    check('Reload and reopen restore both PDF overlays from preference storage');
    fixture.state.inkFailWrites=true;
    await draw(p,'active',[.3,.55],[.65,.6]);await panel(p).getByRole('button',{name:'重試儲存畫筆標註',exact:true}).waitFor();
    await p.screenshot({path:path.join(evidence,'failed-save-actionable-retry.png')});
    assert.equal(await strokeCount(p,'active'),2);assert.equal(activeRows(fixture,workingId).length,1);
    const pendingCount=()=>p.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('circuit-pdf-ink-outbox:')).length);
    assert.ok(await pendingCount());await reopen(p,1543);await rendered(p);await gotoPage(p,1);assert.equal(await strokeCount(p,'active'),2);await panel(p).getByRole('button',{name:'重試儲存畫筆標註',exact:true}).waitFor();
    fixture.state.inkFailWrites=false;await panel(p).getByRole('button',{name:'重試儲存畫筆標註',exact:true}).click();
    await eventually(()=>activeRows(fixture,workingId).length===2,'Retry persists outbox');await eventually(async()=>!(await pendingCount()),'Saved outbox clears');check('Failed save retains a local outbox across reload; explicit retry persists and clears it');

    const viewer=await open(1173,'view');await rendered(viewer.page);await gotoPage(viewer.page,1);
    assert.equal(await strokeCount(viewer.page),2);for(const name of ['畫筆','橡皮擦','撤回最後一筆畫筆'])assert.equal(await panel(viewer.page).getByRole('button',{name,exact:true}).count(),0,name+' is not offered to a viewer');
    const beforeViewWrites=fixture.state.inkWrites;await tool(viewer.page,'框選');await tool(viewer.page,'移動');assert.equal(fixture.state.inkWrites,beforeViewWrites);
    report.geometry.push({width:1173,...await toolbarFits(viewer.page,1173)});await managerFits(viewer.page);await viewer.page.screenshot({path:path.join(evidence,'compact-1173-readonly.png')});check('1173px readonly account sees saved ink and can navigate without gaining edit controls');

    const mobile=await open(390);await rendered(mobile.page);await gotoPage(mobile.page,1);
    await panel(mobile.page).locator('.circuit-pdf-row').evaluate(node=>node.scrollLeft=0);
    report.geometry.push({width:390,...await toolbarFits(mobile.page,390)});
    await draw(mobile.page,'active',[.24,.65],[.6,.7]);await eventually(()=>activeRows(fixture,workingId).length===3,'Phone pen saves');
    await tool(mobile.page,'撤回最後一筆畫筆');await eventually(()=>activeRows(fixture,workingId).length===2,'Phone undo saves');
    await managerFits(mobile.page);await panel(mobile.page).locator('.circuit-pdf-row').evaluate(node=>node.scrollLeft=0);
    await panel(mobile.page).getByRole('button',{name:'返回修改內容',exact:true}).click();await panel(mobile.page).waitFor({state:'hidden'});await dialog(mobile.page).locator('.circuit-item-list').waitFor();
    await dialog(mobile.page).getByTestId('circuit-change-item').first().click();assert.ok(await dialog(mobile.page).getByRole('textbox',{name:'標題',exact:true}).isVisible());
    await dialog(mobile.page).getByRole('button',{name:'看圖面',exact:true}).filter({visible:true}).first().click();await rendered(mobile.page);await panel(mobile.page).locator('.circuit-pdf-row').evaluate(node=>node.scrollLeft=0);await mobile.page.screenshot({path:path.join(evidence,'mobile-390-tools.png')});
    check('390px phone emulation has visible 44px drawing tools, one toolbar row, usable pen/undo and version manager');
    assert.deepEqual(desktop.errors,[]);assert.deepEqual(viewer.errors,[]);assert.deepEqual(mobile.errors,[]);report.result='passed';report.inkWrites=fixture.state.inkWrites;
    console.log(JSON.stringify({result:report.result,checks:report.checks.length,evidence},null,2));
  }catch(error){report.result='failed';report.error=error.stack;console.error(error);process.exitCode=1;for(const context of contexts)for(const page of context.pages())await page.screenshot({path:path.join(evidence,'failure-'+contexts.indexOf(context)+'.png')}).catch(()=>{});}
  finally{fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));for(const context of contexts)await context.close().catch(()=>{});await browser?.close();fixture.close();await server?.close();}
})();
