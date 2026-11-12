// Full current-checkout Vite bundle. Only an authorized pull_request CI may
// launch Chromium. Local execution is restricted to explicit build-only mode.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {createRequire}=require('node:module');
const {execFileSync}=require('node:child_process');
const fixture=require('./currentClientDraftRecovery.fixtures.cjs');
const {BASE,sha,safePath,createNetworkSink,redactEvidence,sanitizeEvidence}=require('./exact80/exact80-server.cjs');
const LABELS=['名稱','描述','所屬大專案','版本號','寬度 (mm)','高度 (mm)','狀態'];
const PCB_ERROR='板框尺寸必須介於 20 到 1000 mm。';
const PCB_RAW=['  SYNTHETIC retained PCB  ',' synthetic description 原始 whitespace ',' SYNTHETIC group ',' v2 raw ','19','88.500','review'];
const SCENARIOS=[{workspace:'station-status',mode:'clear'},{workspace:'station-status',mode:'success'},
 ...['1e','-','12.'].map(rawWidth=>({workspace:'pcb-designer',mode:'cancel',rawWidth})),
 {workspace:'pcb-designer',mode:'success',rawWidth:'19'}];
function executionMode(env){
 if(env.CURRENT_DRAFT_RECOVERY_BUILD_ONLY==='1')return'build-only';
 assert.equal(env.GITHUB_ACTIONS,'true','Chromium is restricted to authorized PR CI; use explicit build-only locally');
 assert.equal(env.GITHUB_EVENT_NAME,'pull_request','No local, push or deployment Chromium launch');return'browser';
}
function outside(root,value){const resolved=path.resolve(value);assert.ok(resolved!==root&&!resolved.startsWith(root+path.sep),'Build/evidence must stay outside the checkout');return resolved;}
function sourceIdentity(root){
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 const status=execFileSync('git',['status','--porcelain=v1','-z','--untracked-files=all'],{cwd:root});
 return{commit:git(['rev-parse','HEAD']),sourceTree:git(['rev-parse','HEAD^{tree}']),dirty:status.length>0,statusSha256:sha(status),lockSha256:sha(fs.readFileSync(path.join(root,'package-lock.json')))};
}
function assertSourceStable(before,after,mode){
 assert.deepEqual(after,before,'Source identity or checkout state changed during the run');
 if(mode==='browser')assert.equal(before.dirty,false,'PR browser evidence requires a clean checkout; ignored build outputs are excluded');
}
function inventoryFor(files){
 const entries=[...files].map(([file,bytes])=>({file,bytes:bytes.length,sha256:sha(bytes)})).sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
 return{entries,summary:{files:entries.length,bytes:entries.reduce((sum,x)=>sum+x.bytes,0),sha256:sha(Buffer.from(JSON.stringify(entries)))}};
}
function servablePath(value){return safePath(value)&&!/(?:^|\/)ApiManagementPage(?:-[A-Za-z0-9_-]+)?\.m?js$/.test(value);}
function collectFiles(directory,{excluded=[]}={}){
 const result=new Map();
 function visit(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
  const file=path.join(folder,entry.name);assert.ok(!entry.isSymbolicLink(),'No output symlinks');
  if(entry.isDirectory())visit(file);else if(entry.isFile()){
   const relative=path.relative(directory,file).split(path.sep).join('/'),bytes=fs.readFileSync(file);
   assert.ok(!/materialRequestSeed/i.test(relative),'Seed output forbidden');
   if(/\.(?:js|mjs|html)$/.test(relative))assert.ok(!/materialRequestSeed/i.test(bytes.toString()),'Seed reference forbidden');
   if(servablePath(relative))result.set(relative,bytes);
   else excluded.push({file:relative,bytes:bytes.length,sha256:sha(bytes),reason:/ApiManagementPage/.test(relative)?'Unrelated lazy API-management route has a hardcoded production endpoint; never served':/MaterialRequestPage/.test(relative)?'BOM route outside the maintenance/PCB fixture scope; never served':'Unsafe path or source map; never served'});
  }
 }}visit(directory);assert.ok(result.has('index.html'));return result;
}
function assertSyntheticBundle(files){
 const text=[...files].filter(([p])=>/\.(?:js|mjs)$/.test(p)).map(([,b])=>b.toString()).join('\n');
 assert.ok(text.includes(fixture.BACKEND),'Full bundle must use the synthetic endpoint');
 assert.ok(!/https:\/\/[a-z0-9-]+\.supabase\.co/i.test(text),'Production project endpoint must not enter this build');
}
async function buildCurrent(root,directory){
 process.env.VITE_SUPABASE_URL=fixture.BACKEND;process.env.VITE_SUPABASE_ANON_KEY=fixture.ANON_KEY;
 process.env.VITE_SUPABASE_SCHEMA='workspace';process.env.VITE_REALTIME_COLLABORATION_V2='true';
 const previous=process.cwd();process.chdir(root);
 try{const {build}=await import('vite');await build({root,configFile:path.join(root,'vite.config.ts'),mode:'production',logLevel:'error',build:{outDir:directory,emptyOutDir:true,sourcemap:false}});}
 finally{process.chdir(previous);}
 const excluded=[];const files=collectFiles(directory,{excluded});
 assertSyntheticBundle(files);
 return{files,excludedInventory:excluded.sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0)};
}
function createCurrentServer(files){
 const responses=[];
 const server=http.createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://synthetic.invalid').pathname);}catch{res.writeHead(400).end();return;}
  const file=pathname===BASE||pathname===BASE+'index.html'?'index.html':pathname.startsWith(BASE)?pathname.slice(BASE.length):null;
  const bytes=req.method==='GET'&&file&&servablePath(file)?files.get(file):undefined;
  const extension=file?.split('.').pop();const type=({html:'text/html; charset=utf-8',js:'text/javascript',mjs:'text/javascript',css:'text/css',svg:'image/svg+xml',webp:'image/webp',png:'image/png',ico:'image/x-icon',wasm:'application/wasm'})[extension]||'application/octet-stream';
  responses.push({file,status:bytes?200:404,sha256:bytes?sha(bytes):null});
  res.writeHead(bytes?200:404,{'content-type':bytes?type:'text/plain','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(bytes||'Unavailable synthetic input');
 });return{server,responses};
}
async function harness(browser,viewport,files){
 const h={...createCurrentServer(files),...fixture.createFixture(),calls:[],forbidden:[],errors:[],logs:[],documentLoads:0};
 try{
 await new Promise(resolve=>h.server.listen(0,'127.0.0.1',resolve));h.origin=`http://127.0.0.1:${h.server.address().port}`;
 h.context=await browser.newContext({viewport,isMobile:viewport.width<500,hasTouch:viewport.width<500,serviceWorkers:'block',reducedMotion:'reduce'});
 await h.context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===h.origin&&req.method()==='GET')return route.continue();
  if(url.origin!==fixture.BACKEND){h.forbidden.push({kind:'unknown-origin',method:req.method(),pathname:url.pathname});return route.abort();}
  const record={pathname:url.pathname,method:req.method(),search:url.search,headers:req.headers(),rawBody:req.postDataBuffer()};
  if(req.method()==='POST'){try{record.body=req.postDataJSON();}catch{record.body=null;}}
  const reply=h.respond(record);h.calls.push({kind:reply.kind,method:req.method(),pathname:url.pathname});
  if(reply.kind==='forbidden')h.forbidden.push({kind:reply.kind,method:req.method(),pathname:url.pathname});
  return route.fulfill({status:reply.status||200,contentType:reply.contentType||'application/json',body:reply.bytes||JSON.stringify(reply.data),headers:{'access-control-allow-origin':'*','cache-control':'no-store'}});
 });
 await h.context.routeWebSocket('**/*',ws=>{
  const url=new URL(ws.url());
  if(url.hostname!==new URL(fixture.BACKEND).hostname||url.pathname!=='/realtime/v1/websocket'){h.forbidden.push({kind:'unknown-websocket'});ws.close();return;}
  ws.onMessage(message=>{let value;try{value=JSON.parse(String(message));}catch{h.forbidden.push({kind:'malformed-websocket'});ws.close();return;}
   const reply=fixture.realtimeResponse(value);h.calls.push({kind:reply.kind,event:reply.event});
   if(reply.kind==='forbidden'){h.forbidden.push({kind:'unmatched-realtime',event:reply.event});ws.close();return;}
   ws.send(JSON.stringify(reply.reply)); // Synthetic peer only; never connectToServer.
  });
 });
 await h.context.addInitScript(({session,actor,project})=>{
  sessionStorage.setItem('bringup-auth-active-storage-key','bringup-auth:synthetic-bootstrap');
  sessionStorage.setItem('bringup-auth:synthetic-bootstrap',JSON.stringify(session));
  sessionStorage.setItem('bringup-auth-session-version','2026-07-31-tab-isolation-v2');
  sessionStorage.setItem('user',JSON.stringify({userId:actor,username:'synthetic-editor',role:'admin',displayName:'Synthetic editor',avatarPath:null}));
  localStorage.setItem('station-status-hub:active-test-project:v2',project);
  window.__currentDraftDocument={id:crypto.randomUUID(),timeOrigin:performance.timeOrigin};
  // Observe native objects without replacing File, app state or blob bytes.
  const native=URL.createObjectURL.bind(URL),ids=new WeakMap();let next=0;
  window.__currentDraftFileObservations={};
  URL.createObjectURL=value=>{const url=native(value);if(!ids.has(value))ids.set(value,++next);
   window.__currentDraftFileObservations[url]={objectId:ids.get(value),nativeFile:value instanceof File,name:value.name||null,size:value.size,type:value.type,lastModified:value.lastModified||null};return url;};
 },{session:fixture.session(),actor:fixture.ACTOR,project:fixture.PROJECT});
 h.page=await h.context.newPage();h.page.setDefaultTimeout(20000);
 h.page.on('pageerror',error=>h.errors.push(redactEvidence(error.message)));
 h.page.on('console',message=>{if(message.type()==='error')h.logs.push(redactEvidence(message.text()));});
 h.page.on('domcontentloaded',()=>h.documentLoads++);
 h.close=async()=>{await h.context.close();await new Promise(resolve=>h.server.close(resolve));};return h;
 }catch(error){if(h.context)await h.context.close();if(h.server.listening)await new Promise(resolve=>h.server.close(resolve));throw error;}
}
async function beforeUnload(page){return page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;});}
async function refreshProfile(h){
 const response=h.page.waitForResponse(r=>new URL(r.url()).pathname==='/rest/v1/rpc/list_system_user_profiles'&&r.request().method()==='POST'&&r.status()===(h.state.denyProtected?403:200));
 await h.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await(await response).finished();
 await h.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
const editor=(page,workspace)=>workspace==='station-status'?page.locator('#mf-new-note'):page.getByTestId('pcb-designer-workspace');
async function boot(h,workspace){await h.page.goto(h.origin+BASE+'?'+fixture.workspaceQuery(workspace),{waitUntil:'load'});await editor(h.page,workspace).waitFor();await h.page.locator('[data-mobile-app-header]').waitFor();}
async function denyAndRestore(h,workspace,{dirty=true}={}){
 const before=await h.page.evaluate(()=>window.__currentDraftDocument);
 h.state.denyProtected=true;await refreshProfile(h);await editor(h.page,workspace).waitFor({state:'detached'});
 assert.ok(h.calls.some(x=>x.kind==='protected-profile-denial'));
 assert.equal(await beforeUnload(h.page),dirty,'Document-level draft warning must outlive the permission-gated editor');
 h.state.denyProtected=false;await refreshProfile(h);
 await h.page.evaluate(({workspace,issue})=>dispatchEvent(new CustomEvent('navigate',{detail:workspace==='station-status'?{module:'issues',params:{openIssue:issue}}:{module:'pcb-designer'}})),{workspace,issue:fixture.ISSUE});
 await editor(h.page,workspace).waitFor();
 assert.deepEqual(await h.page.evaluate(()=>window.__currentDraftDocument),before);assert.equal(h.documentLoads,1);
 assert.equal(await h.page.evaluate(()=>JSON.parse(sessionStorage.getItem('user')).userId),fixture.ACTOR,'Restore must be the same actor');
}
async function maintenanceSnapshot(page){
 const previews=await page.locator('.mf-pending-file img').evaluateAll(async images=>Promise.all(images.map(async img=>{
  if(!img.src.startsWith('blob:'+location.origin+'/'))throw Error('Expected a native local preview');
  const bytes=await(await fetch(img.src)).arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
  return{...window.__currentDraftFileObservations[img.src],previewName:img.alt,byteLength:bytes.byteLength,sha256:Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')};
 })));
 return{note:await page.locator('#mf-new-note').inputValue(),names:await page.locator('.mf-pending-file span[title]').allTextContents(),previews};
}
async function maintenanceCase(h,mode){
 await h.page.locator('#mf-new-note').fill(fixture.NOTE);
 await h.page.locator('.mf-composer input[type="file"]').setInputFiles({name:fixture.FILE_NAME,mimeType:'image/png',buffer:fixture.PNG});
 await h.page.locator('.mf-pending-file img').waitFor();
 const before=await maintenanceSnapshot(h.page);assert.equal(before.note,fixture.NOTE);assert.equal(before.previews.length,1);
 assert.equal(before.previews[0].nativeFile,true);assert.equal(before.previews[0].sha256,sha(fixture.PNG));assert.equal(before.previews[0].byteLength,fixture.PNG.length);
 assert.equal(await beforeUnload(h.page),true);await denyAndRestore(h,'station-status');
 await h.page.locator('.mf-pending-file img').waitFor();
 assert.deepEqual(await maintenanceSnapshot(h.page),before,'Text, native File identity, metadata and PNG bytes must all survive');
 if(mode==='clear'){
  await h.page.locator('#mf-new-note').fill('');await h.page.getByRole('button',{name:'移除 '+fixture.FILE_NAME,exact:true}).click();
 }else{
  h.state.allowMaintenanceSuccess=true;await h.page.locator('.mf-composer').getByRole('button',{name:'送出',exact:true}).click();
  await h.page.waitForFunction(()=>document.querySelector('#mf-new-note')?.value===''&&!document.querySelector('.mf-pending-file'));
  fixture.assertSuccessfulMaintenance(h.state);
 }
 await h.page.locator('.mf-pending-file').waitFor({state:'detached'});assert.equal(await h.page.locator('#mf-new-note').inputValue(),'');
 assert.equal(await beforeUnload(h.page),false);await denyAndRestore(h,'station-status',{dirty:false});
 assert.deepEqual(await maintenanceSnapshot(h.page),{note:'',names:[],previews:[]});
 return{before,restoredNativeFileIdentity:true,clearMethod:mode==='clear'?'Explicit empty note and remove all files (no invented maintenance Cancel)':'Successful synthetic note/upload/metadata receipts',clearedAfterSecondGate:true};
}
async function openPcbSettings(page){
 await page.waitForFunction(()=>document.querySelector('.pcb-editing-lock')?.textContent.includes('你正在編輯'));
 let settings=page.getByRole('button',{name:'專案設定',exact:true}).filter({visible:true});
 if(!(await settings.count())){await page.getByRole('button',{name:'開啟 PCB 專案操作',exact:true}).click();settings=page.getByRole('menuitem',{name:'專案設定',exact:true});}
 await settings.click();const form=page.locator('form[data-pcb-dialog-form="project-settings"]');await form.waitFor();return form;
}
const PCB_STATUS_SELECTOR='label[data-pcb-field-tone] > select';
function pcbStatusLabel(select){
 if(select?.tagName!=='SELECT'||select.labels?.length!==1)return null;
 return Array.from(select.labels[0].childNodes).filter(node=>node.nodeType===3).map(node=>node.textContent).join('').trim();
}
function pcbField(form,label){return label==='狀態'?form.locator(PCB_STATUS_SELECTOR):form.getByLabel(label,{exact:true});}
async function pcbSnapshot(form){
 const status=pcbField(form,'狀態');assert.equal(await status.count(),1);assert.equal(await status.evaluate(pcbStatusLabel),'狀態');
 return{raw:await Promise.all(LABELS.map(label=>pcbField(form,label).inputValue())),errors:await form.getByRole('alert').allTextContents()};
}
async function pcbCase(h,mode,rawWidth){
 let form=await openPcbSettings(h.page);const baseline=await pcbSnapshot(form);
 for(let i=0;i<LABELS.length;i++){const field=pcbField(form,LABELS[i]);if(i===6)await field.selectOption(PCB_RAW[i]);else if(i===4){await field.fill('');await field.pressSequentially(rawWidth);}else await field.fill(PCB_RAW[i]);}
 assert.equal(await form.getByLabel('寬度 (mm)',{exact:true}).inputValue(),rawWidth,'Keyboard tokens must remain raw, not coerce to a number');
 assert.equal(await form.evaluate(node=>node.checkValidity()),true,'Raw width must reach the custom validator, not fail native validation');
 await form.getByRole('button',{name:'儲存',exact:true}).click();await form.getByRole('alert').filter({hasText:PCB_ERROR}).waitFor();
 const before=await pcbSnapshot(form);assert.deepEqual(before.raw,PCB_RAW.map((value,index)=>index===4?rawWidth:value));assert.deepEqual(before.errors,[PCB_ERROR]);
 assert.equal(await beforeUnload(h.page),true);await denyAndRestore(h,'pcb-designer');form=await openPcbSettings(h.page);
 assert.deepEqual(await pcbSnapshot(form),before,'All7 raw strings and original error must survive the same-actor gate');
 if(mode==='cancel'){
  await form.getByRole('button',{name:'取消',exact:true}).click();await form.waitFor({state:'detached'});
  assert.equal(await beforeUnload(h.page),false,'Cancel discards settings only; this case has no saved CAD change');
  form=await openPcbSettings(h.page);assert.deepEqual(await pcbSnapshot(form),baseline);
 }else{
  await form.getByLabel('寬度 (mm)',{exact:true}).fill('120');await form.getByRole('button',{name:'儲存',exact:true}).click();await form.waitFor({state:'detached'});
  form=await openPcbSettings(h.page);const after=await pcbSnapshot(form);
  assert.equal(after.raw[4],'120');assert.equal(after.raw[0],before.raw[0].trim());assert.deepEqual(after.errors,[]);
  assert.notDeepEqual(after,before,'Successful local CAS must clear the old invalid settings draft');
  // A successful settings apply dirties the CAD workspace. Do NOT claim all
  // document beforeunload warnings disappear without a cloud save.
 }
 return{before,clearedBy:mode,scope:'Seven raw settings/error only; successful local reducer receipt is not a cloud save or a complete board/CAD persistence test'};
}
async function main(env=process.env){
 const mode=executionMode(env),root=path.resolve(__dirname,'..');
 const work=outside(root,env.CURRENT_DRAFT_RECOVERY_WORKDIR||path.join(env.RUNNER_TEMP||os.tmpdir(),'current-draft-recovery-'+process.pid));
 const evidence=outside(root,env.CURRENT_DRAFT_RECOVERY_EVIDENCE_DIR||path.join(work,'evidence')),dist=path.join(work,'dist');
 assert.ok(evidence!==dist&&!evidence.startsWith(dist+path.sep));fs.mkdirSync(evidence,{recursive:true});
 const source=sourceIdentity(root);assertSourceStable(source,source,mode);
 const {files,excludedInventory}=await buildCurrent(root,dist);assertSourceStable(source,sourceIdentity(root),mode);
 const inventory=inventoryFor(files);fs.writeFileSync(path.join(evidence,'servable-inventory.json'),JSON.stringify(inventory,null,2));
 const report={status:'built',...source,sourceEvidence:mode==='browser'?'Clean PR checkout; identity verified before/after build and after browser run':'Local build-only checkout; not exact committed-browser evidence',syntheticOnly:true,compiledCompleteApplication:true,servedSubset:true,compiledFiles:files.size+excludedInventory.length,excludedInventory,servableInventory:inventory.summary,servableFiles:files.size,browserExecuted:false,results:[],limits:['Current checkout only; no historical artifact downloaded or old study changed.','Complete compilation does not mean all routes are served: BOM and unrelated API-management route are denied; only maintenance/PCB flows are tested.','Document RAM recovery is not reload/restart persistence or evidence that a real user has no unsaved work.','Viewport emulation is not a physical mobile test.','Beforeunload checks dispatch a cancelable event in real Chromium; no native OS dialog claim.']};
 const write=()=>fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(sanitizeEvidence(report),null,2));write();
 if(mode==='build-only'){console.log(JSON.stringify({status:'build-only-passed',browserExecuted:false,...source,servableInventory:inventory.summary,sourceEvidence:report.sourceEvidence}));return report;}
 const qa=createRequire(path.resolve(env.AUDIT_QA_DIR,'package.json'));
 const sink=createNetworkSink();let browser;
 try{
  await new Promise(resolve=>sink.server.listen(0,'127.0.0.1',resolve));
  browser=await qa('playwright').chromium.launch({headless:true,args:[`--proxy-server=http://127.0.0.1:${sink.server.address().port}`,'--proxy-bypass-list=127.0.0.1','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});report.browserExecuted=true;
  for(const viewport of [{width:1280,height:800},{width:390,height:844}])for(const scenario of SCENARIOS){
   const result={name:`${scenario.workspace}-${scenario.mode}${scenario.rawWidth?'-'+scenario.rawWidth:''}`,viewport,status:'running'};report.results.push(result);write();let h;
   try{
    h=await harness(browser,viewport,files);await boot(h,scenario.workspace);
    const document=await h.page.evaluateHandle(()=>window.document);
    result.recovery=scenario.workspace==='station-status'?await maintenanceCase(h,scenario.mode):await pcbCase(h,scenario.mode,scenario.rawWidth);
    assert.equal(await h.page.evaluate(original=>document===original,document),true);await document.dispose();assert.equal(h.documentLoads,1);
    assert.deepEqual(h.forbidden,[]);assert.deepEqual(h.errors,[]);assert.equal(h.calls.filter(x=>x.kind==='raw-permissions-read').length,0,'New client must not fall back to raw permissions');
    assert.ok(h.calls.some(x=>x.kind==='protected-profile-read'));assert.ok(h.calls.some(x=>x.kind==='protected-profile-denial'));
    for(const line of h.logs)assert.match(line,/Failed to load resource:.*403|Failed to load current database permissions:/,'Unexpected console error');
    if(scenario.mode!=='success'||scenario.workspace!=='station-status')assert.deepEqual(h.state.writes,[]);
    result.safety={documentLoads:h.documentLoads,rawPermissionReads:0,forbiddenRequests:0,nativeFileMeasured:scenario.workspace==='station-status',businessWrites:h.state.writes.map(x=>x.kind)};
    result.requests=h.calls;result.staticResponses=h.responses;result.consoleErrors=h.logs;
    await h.page.screenshot({path:path.join(evidence,`${viewport.width}-${result.name}.png`)});result.status='passed';
   }catch(error){result.status='failed';result.error=String(error.stack);if(h){result.requests=h.calls;result.forbidden=h.forbidden;result.browserErrors=h.errors;result.consoleErrors=h.logs;await h.page.screenshot({path:path.join(evidence,`${viewport.width}-${result.name}-failed.png`)}).catch(()=>{});}}
   finally{write();if(h)await h.close();}
  }
  assert.equal(report.results.length,SCENARIOS.length*2);assert.deepEqual(report.results.filter(x=>x.status!=='passed').map(x=>`${x.viewport.width}:${x.name}`),[]);
  assert.deepEqual(sink.attempts,[],'No traffic may escape the browser synthetic request handlers');assertSourceStable(source,sourceIdentity(root),mode);report.status='passed';return report;
 }catch(error){report.status='failed';throw error;}
 finally{if(browser)await browser.close();report.transport={mode:'loopback-deny-proxy-and-DNS-deny',blockedAttempts:sink.attempts};write();if(sink.server.listening)await new Promise(resolve=>sink.server.close(resolve));assert.ok(fs.readdirSync(evidence).every(x=>/\.(?:json|png)$/.test(x)),'Evidence must contain only JSON and PNG');}
}
module.exports={executionMode,outside,sourceIdentity,assertSourceStable,inventoryFor,servablePath,collectFiles,assertSyntheticBundle,buildCurrent,createCurrentServer,main,LABELS,PCB_ERROR,PCB_RAW,SCENARIOS,PCB_STATUS_SELECTOR,pcbStatusLabel};
if(require.main===module)main().catch(error=>{console.error(redactEvidence(error?.stack||error));process.exitCode=1;});
