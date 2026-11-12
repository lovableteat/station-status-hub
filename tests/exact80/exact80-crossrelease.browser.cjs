// Exact production static bytes, synthetic services/data. PR CI only.
// Never a deployment step. Evidence contains summaries/screenshots, not artifacts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const {BASE,BLOCKED_OLD,sha,loadInventory,readVerified,createResearchServer,createNetworkSink,redactEvidence,sanitizeEvidence}=require('./exact80-server.cjs');
const fixture=require('./exact80-fixtures.cjs');
const manifest=require('./exact80-manifest.json');
const {MAINT,PCB,DASH,CORE,CANDIDATE_CORE}=require('./exact80-paths.cjs');
const draft='SYNTHETIC UNSENT DRAFT: 精確舊頁不可重整或遺失';
const syntheticPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
function inventories(){
 const old=loadInventory(process.env.EXACT80_DIST,manifest.oldAllowedBoot);
 const candidate=loadInventory(process.env.EXACT80_CANDIDATE_DIST,manifest.candidateFiles);
 const extras=new Map(manifest.postCutoverExtra.map(x=>[x.path,readVerified(process.env.EXACT80_DIST,x.path,x.sha256)]));
 return{oldFiles:old,candidateFiles:candidate,extras};
}
function endpointFromOld(oldFiles){
 const text=oldFiles.get(CORE[0]).toString();
 const urls=[...new Set([...text.matchAll(/"(https:\/\/[a-z0-9-]+\.supabase\.co)"/g)].map(m=>m[1]))];
 assert.equal(urls.length,1);return urls[0]; // Used only as intercepted request identity; never fetched.
}
async function createHarness(browser,viewport,inventory,{extras=false,candidateBoot=false}={}){
 const h=createResearchServer({...inventory,extras:extras?inventory.extras:new Map()});
 await new Promise(r=>h.server.listen(0,'127.0.0.1',r));
 h.origin=`http://127.0.0.1:${h.server.address().port}`;h.backend=endpointFromOld(inventory.oldFiles);
 h.calls=[];h.forbidden=[];h.errors=[];h.logs=[];h.documentLoads=0;h.denyRaw=false;h.denyProtected=false;
 h.context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500,serviceWorkers:'block',reducedMotion:'reduce'});
 await h.context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin===h.origin&&req.method()==='GET')return route.continue();
  if(u.origin!==h.backend){h.forbidden.push({method:req.method(),pathname:u.pathname,kind:'unknown-origin'});return route.abort();}
  const record={pathname:u.pathname,method:req.method(),search:u.search,headers:req.headers()};
  if(req.method()==='POST'){try{record.body=req.postDataJSON();}catch{record.body=null;}}
  const result=fixture.responseFor(record,{denyRaw:h.denyRaw,denyProtected:h.denyProtected});
  // Do not report Authorization, API keys, request URLs or auth bodies.
  h.calls.push({pathname:u.pathname,method:req.method(),kind:result.kind,phase:h.phase});
  if(result.kind==='forbidden')h.forbidden.push({pathname:u.pathname,method:req.method(),kind:'unmatched-service'});
  return route.fulfill({status:result.status||200,contentType:'application/json',body:JSON.stringify(result.data),headers:{'access-control-allow-origin':'*','cache-control':'no-store'}});
 });
 await h.context.routeWebSocket('**/*',ws=>{
  const u=new URL(ws.url());
  if(u.hostname!==new URL(h.backend).hostname||u.pathname!=='/realtime/v1/websocket'){h.forbidden.push({pathname:u.pathname,kind:'unknown-websocket'});ws.close();return;}
  // No connectToServer call: every websocket is a synthetic local peer.
  ws.onMessage(message=>{
   let value;try{value=JSON.parse(String(message));}catch{h.forbidden.push({kind:'malformed-websocket'});return;}
   const reply=fixture.realtimeResponse(value);
   h.calls.push({kind:reply.kind,event:reply.event,phase:h.phase});
   if(reply.kind==='forbidden'){h.forbidden.push({kind:'unmatched-realtime',event:reply.event});ws.close();return;}
   ws.send(JSON.stringify(reply.reply));
  });
 });
 if(candidateBoot)h.cutover();
 await h.context.addInitScript(({session,user,actor,project})=>{
  sessionStorage.setItem('bringup-auth-active-storage-key','bringup-auth:synthetic-bootstrap');
  sessionStorage.setItem('bringup-auth:synthetic-bootstrap',JSON.stringify(session));
  sessionStorage.setItem('bringup-auth-session-version','2026-07-31-tab-isolation-v2');
  sessionStorage.setItem('user',JSON.stringify({userId:actor,username:'synthetic-editor',role:'admin',displayName:'Synthetic editor',avatarPath:null}));
  localStorage.setItem('station-status-hub:active-test-project:v2',project);
  window.__crossReleaseDocument={id:crypto.randomUUID(),timeOrigin:performance.timeOrigin};
 },{session:fixture.session(),actor:fixture.ACTOR,project:fixture.PROJECT});
 h.page=await h.context.newPage();h.page.setDefaultTimeout(15000);
 h.page.on('pageerror',e=>h.errors.push(redactEvidence(e.message)));
 h.page.on('console',e=>{if(e.type()==='error')h.logs.push(redactEvidence(e.text()));});
 h.page.on('domcontentloaded',()=>h.documentLoads++);
 h.identity=()=>h.page.evaluate(()=>window.__crossReleaseDocument);
 h.boot=async workspace=>{
  const query=fixture.workspaceQuery(workspace);
  await h.page.goto(h.origin+BASE+'?'+query,{waitUntil:'load'});
  await h.page.locator('[data-mobile-app-header]').waitFor();
  if(workspace==='station-status')await h.page.locator('#mf-new-note').waitFor();
  else await h.page.getByTestId('pcb-designer-workspace').waitFor();
 };
 h.verifyResident=async filename=>{
  assert.ok(h.responses.some(r=>r.phase===(candidateBoot?'candidate':'old')&&r.filename===filename&&r.status===200),`Original response observed before probe: ${filename}`);
  const before=h.responses.length;const handle=await h.page.evaluateHandle(url=>import(url),h.origin+BASE+filename);
  assert.equal(h.responses.slice(before).filter(x=>x.filename===filename).length,0,'Resident probe must not cause a module network load');return handle;
 };
 h.checkResident=async(filename,handle)=>{
  const before=h.responses.length;
  assert.equal(await h.page.evaluate(async({url,original})=>(await import(url))===original,{url:h.origin+BASE+filename,original:handle}),true);
  assert.equal(h.responses.slice(before).filter(x=>x.filename===filename).length,0,'The original evaluated ESM module map, not HTTP cache, resolves the import');
 };
 h.assertBlocked=async()=>{
  for(const filename of BLOCKED_OLD){const response=await h.context.request.get(h.origin+BASE+filename);assert.equal(response.status(),404,filename);}
  assert.equal(h.responses.filter(r=>r.phase==='candidate'&&r.status===200&&h.blockedHashes.has(r.sha256)).length,0);
 };
 h.close=async()=>{await h.context.close();await new Promise(r=>h.server.close(r));};
 return h;
}
async function selectWorkspace(page,label,viewport,workspaceId){
 let button=page.getByRole('button',{name:label,exact:true}).filter({visible:true});
 if(await button.count()){await button.first().click();return;}
 if(viewport.width<500){
  await page.locator('[data-mobile-dock-id="more"]').click();
  const sheet=page.locator('[data-mobile-more-sheet="true"]');await sheet.waitFor();
  const target=sheet.locator(`[data-mobile-more-id="${workspaceId}"]`);
  assert.ok((await target.innerText()).includes(label),'Original drawer item includes label plus description');
  await target.click();await sheet.waitFor({state:'hidden'});return;
 }
 await page.locator('header').getByRole('button',{name:'更多',exact:true}).filter({visible:true}).click();
 const item=page.getByRole('menuitem',{name:label,exact:true}).filter({visible:true});
 if(await item.count())await item.click();else await page.getByRole('button',{name:label,exact:true}).filter({visible:true}).click();
}
async function maintenanceSnapshot(page){
 const previews=await page.locator('.mf-pending-file img').evaluateAll(async images=>Promise.all(images.map(async img=>{
  if(!img.src.startsWith('blob:'+location.origin+'/'))throw Error('Pending preview must be a local synthetic blob');
  const bytes=await(await fetch(img.src)).arrayBuffer();
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return{name:img.alt,bytes:bytes.byteLength,sha256:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')};
 })));
 return{note:await page.locator('#mf-new-note').inputValue(),files:await page.locator('.mf-pending-file span[title]').allTextContents(),previews};
}
async function navigationFailure(h,trigger){
 await trigger();
 const recovery=h.page.locator('[data-module-load-recovery="true"]');await recovery.waitFor({state:'attached'});
 // May be behind a still-open dialog; no force click through another editor.
 return recovery;
}
const cases=[
 {name:'mounted-maintenance-draft-and-file-no-retention',workspace:'station-status',run:async(h,viewport,result)=>{
  await h.page.locator('#mf-new-note').fill(draft);
  await h.page.locator('.mf-composer input[type="file"]').setInputFiles({name:'synthetic-unsent.png',mimeType:'image/png',buffer:syntheticPng});
  const before=await maintenanceSnapshot(h.page),module=await h.verifyResident(MAINT);
  assert.deepEqual(before.previews,[{name:'synthetic-unsent.png',bytes:syntheticPng.length,sha256:sha(syntheticPng)}]);
  assert.equal(h.responses.filter(r=>r.filename===PCB).length,0,'Destination PCB was genuinely not loaded');
  h.cutover();await h.checkResident(MAINT,module);
  const recovery=await navigationFailure(h,()=>selectWorkspace(h.page,'PCB Designer',viewport,'pcb-designer'));
  assert.deepEqual(await maintenanceSnapshot(h.page),before);
  await recovery.getByRole('button',{name:'重試載入此功能',exact:true}).click();await recovery.waitFor();
  assert.deepEqual(await maintenanceSnapshot(h.page),before);
  await recovery.getByRole('button',{name:'留在目前畫面',exact:true}).click();
  assert.deepEqual(await maintenanceSnapshot(h.page),before);
  const refreshed=h.page.waitForResponse(response=>new URL(response.url()).pathname==='/rest/v1/rpc/maintenance_workspace'&&response.request().method()==='POST'&&response.status()===200);
  await h.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await(await refreshed).finished();
  await h.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  result.completedMaintenanceRefresh=true;
  assert.deepEqual(await maintenanceSnapshot(h.page),before);
  result.draft=before;result.scope='Real mounted composer plus local PNG preview bytes after completed maintenance read; no upload, not every file format';await module.dispose();
 }},
 {name:'first-dashboard-from-warm-maintenance-three-exact-extras',workspace:'station-status',extras:true,run:async(h,viewport,result)=>{
  for(const filename of manifest.warmDashboard.genuinelyNotLoadedBeforeCutover)assert.equal(h.responses.filter(r=>r.filename===filename).length,0);
  const resident=[];for(const filename of manifest.warmDashboard.requiredAlreadyResidentJs)resident.push([filename,await h.verifyResident(filename)]);
  h.cutover();
  // Actual old desktop/mobile sidebar button and dynamic import.
  await h.page.getByRole('button',{name:'問題儀表板',exact:true}).filter({visible:true}).first().click();
  await h.page.getByRole('heading',{name:'問題儀表板',exact:true}).waitFor();
  assert.ok(h.responses.some(r=>r.filename===DASH&&r.phase==='candidate'&&r.status===200&&r.source==='research-extra'));
  for(const[filename,module]of resident){await h.checkResident(filename,module);await module.dispose();}
  result.trigger='Actual desktop/mobile maintenance sidebar button';
  result.scope='Warm Index/Auth already evaluated; dashboard only, backend permissions unchanged';
 }},
 {name:'mounted-pcb-unsaved-settings-dialog-no-retention',workspace:'pcb-designer',run:async(h,viewport,result)=>{
  await h.page.waitForFunction(()=>document.querySelector('.pcb-editing-lock')?.textContent.includes('你正在編輯'));
  let settings=h.page.getByRole('button',{name:'專案設定',exact:true}).filter({visible:true});
  if(!(await settings.count())){await h.page.getByRole('button',{name:'開啟 PCB 專案操作',exact:true}).click();settings=h.page.getByRole('menuitem',{name:'專案設定',exact:true});}
  await settings.click();const dialog=h.page.getByRole('dialog');await dialog.waitFor();
  const name=dialog.getByLabel('名稱',{exact:true}),description=dialog.getByLabel('描述',{exact:true});
  await name.fill(draft);await description.fill('SYNTHETIC dialog description, not yet committed');
  const before={name:await name.inputValue(),description:await description.inputValue()},module=await h.verifyResident(PCB);
  assert.equal(h.responses.filter(r=>r.filename===MAINT).length,0,'Maintenance was genuinely not loaded');
  h.cutover();await h.checkResident(PCB,module);
  await navigationFailure(h,()=>h.page.evaluate(()=>dispatchEvent(new CustomEvent('navigate',{detail:{module:'issues'}}))));
  assert.deepEqual({name:await name.inputValue(),description:await description.inputValue()},before);
  result.draft=before;result.scope='Actual unsaved PCB settings dialog only; not full edited board persistence, CAD or WebGL';await module.dispose();
 }},
 {name:'raw-permission-revocation-characterization-not-release-proof',workspace:'station-status',run:async(h,viewport,result)=>{
  await h.page.locator('#mf-new-note').fill(draft);h.cutover();h.denyRaw=true;
  await h.page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await h.page.waitForFunction(()=>!document.querySelector('#mf-new-note'));
  assert.ok(h.calls.some(c=>c.kind==='raw-denial'));
  result.characterization={oldProviderStillRequiresRawPermissions:true,composerUnmounted:true};
  h.denyRaw=false;await h.page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await h.page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='維修中心'));
  await h.page.evaluate(id=>dispatchEvent(new CustomEvent('navigate',{detail:{module:'issues',params:{openIssue:id}}})),fixture.ISSUE);
  await h.page.locator('#mf-new-note').waitFor();
  result.characterization.noteAfterRestoredPermission=await h.page.locator('#mf-new-note').inputValue();
  result.characterization.unsentDraftSurvived=result.characterization.noteAfterRestoredPermission===draft;
  result.scope='Expected negative characterization of old client; a passing observation is NOT a safe permission cutover';
 }},
];
async function candidateDraft(h,workspace,viewport){
 if(workspace==='station-status'){
  await h.page.locator('#mf-new-note').fill(draft);
  await h.page.locator('.mf-composer input[type="file"]').setInputFiles({name:'synthetic-unsent.png',mimeType:'image/png',buffer:syntheticPng});
  await h.page.locator('.mf-pending-file img').waitFor();
  const initial=await maintenanceSnapshot(h.page);assert.equal(initial.note,draft);assert.deepEqual(initial.files,['synthetic-unsent.png']);
  assert.deepEqual(initial.previews,[{name:'synthetic-unsent.png',bytes:syntheticPng.length,sha256:sha(syntheticPng)}]);
  return()=>maintenanceSnapshot(h.page);
 }
 await h.page.waitForFunction(()=>document.querySelector('.pcb-editing-lock')?.textContent.includes('你正在編輯'));
 let settings=h.page.getByRole('button',{name:'專案設定',exact:true}).filter({visible:true});
 if(!(await settings.count())){await h.page.getByRole('button',{name:'開啟 PCB 專案操作',exact:true}).click();settings=h.page.getByRole('menuitem',{name:'專案設定',exact:true});}
 await settings.click();const dialog=h.page.getByRole('dialog');await dialog.waitFor();
 await dialog.getByLabel('名稱',{exact:true}).fill(draft);
 await dialog.getByLabel('描述',{exact:true}).fill('SYNTHETIC uncommitted protected-client dialog');
 return async()=>({name:await dialog.getByLabel('名稱',{exact:true}).inputValue(),description:await dialog.getByLabel('描述',{exact:true}).inputValue()});
}
async function observeProfileRefresh(h){
 const refreshed=h.page.waitForResponse(response=>new URL(response.url()).pathname==='/rest/v1/rpc/list_system_user_profiles'&&response.request().method()==='POST'&&response.status()===200);
 await h.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await(await refreshed).finished();
 await h.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
for(const workspace of ['station-status','pcb-designer']){
 cases.push({name:`new-client-${workspace}-protected-reads-with-old-grants`,workspace,candidateBoot:true,run:async(h,viewport,result)=>{
  const read=await candidateDraft(h,workspace,viewport),before=await read();
  await observeProfileRefresh(h);assert.deepEqual(await read(),before);
  result.draft=before;result.scope='Exact new candidate cold boot and completed protected profile refresh; old raw read fixture remains available but must not be used';
 }});
 cases.push({name:`new-client-${workspace}-protected-denial-characterization`,workspace,candidateBoot:true,run:async(h,viewport,result)=>{
  const read=await candidateDraft(h,workspace,viewport),before=await read();
  h.denyProtected=true;await h.page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  const editor=workspace==='station-status'?h.page.locator('#mf-new-note'):h.page.getByTestId('pcb-designer-workspace');
  await editor.waitFor({state:'hidden'});assert.ok(h.calls.some(c=>c.kind==='protected-profile-denial'));
  h.denyProtected=false;await observeProfileRefresh(h);
  await h.page.evaluate(({workspace,issue})=>dispatchEvent(new CustomEvent('navigate',{detail:workspace==='station-status'?{module:'issues',params:{openIssue:issue}}:{module:'pcb-designer'}})),{workspace,issue:fixture.ISSUE});
  await editor.waitFor();
  let after;
  if(workspace==='station-status')after=await maintenanceSnapshot(h.page);
  else{
   await h.page.waitForFunction(()=>document.querySelector('.pcb-editing-lock')?.textContent.includes('你正在編輯'));
   let settings=h.page.getByRole('button',{name:'專案設定',exact:true}).filter({visible:true});
   if(!(await settings.count())){await h.page.getByRole('button',{name:'開啟 PCB 專案操作',exact:true}).click();settings=h.page.getByRole('menuitem',{name:'專案設定',exact:true});}
   await settings.click();const dialog=h.page.getByRole('dialog');await dialog.waitFor();
   after={name:await dialog.getByLabel('名稱',{exact:true}).inputValue(),description:await dialog.getByLabel('描述',{exact:true}).inputValue()};
  }
  result.characterization={protectedDenialUnmountedEditor:true,unsentDraftSurvived:JSON.stringify(before)===JSON.stringify(after),before,after};
  result.scope='Negative characterization of protected API denial; fail-closed is required but passing this observation is NOT proof that uncommitted UI drafts survive';
 }});
}
(async()=>{
 const inventory=inventories();
 if(process.env.EXACT80_BUILD_ONLY==='1'){console.log(JSON.stringify({status:'input-verification-only',browserExecuted:false,oldSelectedFiles:inventory.oldFiles.size,candidateServableFiles:inventory.candidateFiles.size,experimentalExtras:inventory.extras.size,sourceCommit:manifest.sourceCommit,candidateCommit:manifest.candidateCommit}));return;}
 assert.equal(process.env.GITHUB_ACTIONS,'true','Only authorized PR CI may launch Chromium');
 assert.equal(process.env.GITHUB_EVENT_NAME,'pull_request','No local/push/deployment browser launch');
 const qa=createRequire(path.resolve(process.env.AUDIT_QA_DIR,'package.json'));
 const evidence=path.resolve(process.env.EXACT80_EVIDENCE_DIR||path.join(process.env.RUNNER_TEMP,'exact80-crossrelease'));fs.mkdirSync(evidence,{recursive:true});
 const report={status:'running',sourceCommit:manifest.sourceCommit,sourceArtifactSha256:manifest.sourceArtifactSha256,candidateCommit:manifest.candidateCommit,unexercisedProductionBaselines:manifest.otherUnexercisedProductionBaselines,syntheticOnly:true,results:[],limits:['Original immutable production JS runs against intercepted synthetic services, not hosted production Auth/PostgREST/Realtime.','Module-map retention cannot patch resident vulnerable code or prove there are no real unsaved drafts.','Old artifact bytes never enter evidence, commits or a public deployment.','Viewport emulation is not a physical mobile-device test.','Protected-denial observations characterize uncommitted UI inputs, not authorization to deploy or revoke raw grants.']};
 const write=()=>fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(sanitizeEvidence(report),null,2));write();
 let browser;const sink=createNetworkSink();
 try{
  await new Promise(resolve=>sink.server.listen(0,'127.0.0.1',resolve));
  browser=await qa('playwright').chromium.launch({headless:true,args:[
   `--proxy-server=http://127.0.0.1:${sink.server.address().port}`,
   '--proxy-bypass-list=127.0.0.1',
   '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
   '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  ]});
  for(const viewport of [{width:1280,height:800},{width:390,height:844}])for(const scenario of cases){
   const result={name:scenario.name,viewport,status:'running'};report.results.push(result);write();let h;
   try{
    h=await createHarness(browser,viewport,inventory,scenario);await h.boot(scenario.workspace);
    const originalDocument=await h.page.evaluateHandle(()=>document),identity=await h.identity();
    const cores=[];for(const filename of (scenario.candidateBoot?CANDIDATE_CORE:CORE))cores.push([filename,await h.verifyResident(filename)]);
    await scenario.run(h,viewport,result);
    for(const[filename,module]of cores){await h.checkResident(filename,module);await module.dispose();}
    await h.assertBlocked();
    assert.deepEqual(await h.identity(),identity);assert.equal(h.documentLoads,1);assert.equal(await h.page.evaluate(original=>document===original,originalDocument),true);await originalDocument.dispose();
    assert.deepEqual(h.forbidden,[],'Every non-loopback request must be fulfilled by a known synthetic fixture');assert.deepEqual(h.errors,[]);
    if(scenario.candidateBoot){assert.equal(h.calls.filter(c=>c.kind==='raw-permissions-read').length,0,'New client must not fall back to raw permissions even while backend grants are unchanged');assert.ok(h.calls.some(c=>c.kind==='protected-profile-read'));}
    for(const message of h.logs)assert.ok(/Failed to load resource:.*(?:404|403)|Failed to load current database permissions:/.test(message), `Unexpected console error: ${message}`);
    result.safety={documentRetained:true,documentLoads:h.documentLoads,forbiddenRequests:h.forbidden.length,unapprovedHttpOrRealtimeRequests:h.forbidden.length,syntheticLeaseRequests:h.calls.filter(c=>c.kind==='synthetic-lease').length,rawProfileReads:h.calls.filter(c=>c.kind==='raw-profile-read').length,rawPermissionReads:h.calls.filter(c=>c.kind==='raw-permissions-read').length,protectedProfileReads:h.calls.filter(c=>c.kind==='protected-profile-read').length};
    result.staticResponses=h.responses.filter(r=>r.phase==='candidate');result.requests=h.calls;result.consoleErrors=h.logs;
    await h.page.screenshot({path:path.join(evidence,`${viewport.width}-${scenario.name}.png`)});result.status='passed';
   }catch(error){result.status='failed';result.error=String(error.stack);if(h){result.forbidden=h.forbidden;result.calls=h.calls;result.staticResponses=h.responses;result.browserErrors=h.errors;result.consoleErrors=h.logs;result.body=await h.page.locator('body').innerText().catch(()=>null);await h.page.screenshot({path:path.join(evidence,`${viewport.width}-${scenario.name}-failed.png`)}).catch(()=>{});}}
   finally{write();if(h)await h.close();}
  }
  assert.equal(report.results.length,cases.length*2);assert.deepEqual(report.results.filter(x=>x.status!=='passed').map(x=>`${x.viewport.width}:${x.name}`),[]);
  report.status='passed';console.log(JSON.stringify({status:report.status,cases:report.results.length,syntheticOnly:true,evidence}));
 }catch(error){report.status='failed';throw error;}
 finally{if(browser)await browser.close();report.transport={mode:'loopback-deny-proxy-and-DNS-deny',blockedAttempts:sink.attempts};write();if(sink.server.listening)await new Promise(resolve=>sink.server.close(resolve));}
})().catch(error=>{console.error(redactEvidence(error?.stack||error));process.exitCode=1});
