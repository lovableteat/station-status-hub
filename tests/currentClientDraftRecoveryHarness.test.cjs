const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const h=require('./currentClientDraftRecovery.browser.cjs');
const f=require('./currentClientDraftRecovery.fixtures.cjs');
const messageId='50000000-0000-4000-8000-000000000001',fileId='60000000-0000-4000-8000-000000000001';
const request=(pathname,body={},extra={})=>({pathname,method:'POST',body,search:'',headers:{'content-profile':'workspace'},...extra});
const note=request('/rest/v1/rpc/maintenance_add_note',{p_issue_id:f.ISSUE,p_message_id:messageId,p_body:f.NOTE});
const objectPath=`${f.ISSUE}/${messageId}/${fileId}`;
const upload=request('/storage/v1/object/issue-attachments/'+objectPath,null,{headers:{'content-type':'image/png'},rawBody:f.PNG});
const attachment=request('/rest/v1/rpc/maintenance_add_attachment',{p_issue_id:f.ISSUE,p_message_id:messageId,p_file:{id:fileId,file_path:objectPath,file_name:f.FILE_NAME,file_size:f.PNG.length,file_type:'image/png'}});
function acceptedFixture(){const x=f.createFixture();x.state.allowMaintenanceSuccess=true;assert.equal(x.respond(note).kind,'synthetic-note-write');assert.equal(x.respond(upload).kind,'synthetic-attachment-upload');assert.equal(x.respond(attachment).kind,'synthetic-attachment-metadata');return x;}
test('local/default execution cannot reach a browser path',()=>{
 assert.throws(()=>h.executionMode({}),/authorized PR CI/);
 assert.throws(()=>h.executionMode({GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'push'}),/No local/);
 assert.throws(()=>h.executionMode({GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'pull_request_target'}),/No local/);
 assert.throws(()=>h.executionMode({CURRENT_DRAFT_RECOVERY_BUILD_ONLY:'true'}),/authorized PR CI/);
});
test('explicit build-only always exits before the browser branch',()=>{
 assert.equal(h.executionMode({CURRENT_DRAFT_RECOVERY_BUILD_ONLY:'1'}),'build-only');
 assert.equal(h.executionMode({CURRENT_DRAFT_RECOVERY_BUILD_ONLY:'1',GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'pull_request'}),'build-only');
 assert.equal(h.executionMode({GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'pull_request'}),'browser');
});
test('build and evidence cannot overwrite the checkout',()=>{
 assert.throws(()=>h.outside('/tmp/repo','/tmp/repo'),/outside/);
 assert.throws(()=>h.outside('/tmp/repo','/tmp/repo/dist'),/outside/);
 assert.equal(h.outside('/tmp/repo','/tmp/private-runner/dist'),'/tmp/private-runner/dist');
});
test('only stable clean source identity can be browser commit evidence',()=>{
 const source={commit:'a'.repeat(40),sourceTree:'b'.repeat(40),dirty:false,statusSha256:'c'.repeat(64),lockSha256:'d'.repeat(64)};
 assert.doesNotThrow(()=>h.assertSourceStable(source,{...source},'browser'));
 const dirty={...source,dirty:true};assert.throws(()=>h.assertSourceStable(dirty,dirty,'browser'),/clean checkout/);
 assert.doesNotThrow(()=>h.assertSourceStable(dirty,dirty,'build-only'));
 for(const key of ['commit','sourceTree','statusSha256','lockSha256'])assert.throws(()=>h.assertSourceStable(source,{...source,[key]:'changed'},'browser'),/changed during/);
});
test('servable inventory is deterministic path/byte/hash metadata without source bytes',()=>{
 const a=new Map([['z.js',Buffer.from('synthetic-z')],['a.js',Buffer.from('synthetic-a')]]),b=new Map([...a].reverse());
 assert.deepEqual(h.inventoryFor(a),h.inventoryFor(b));assert.equal(h.inventoryFor(a).summary.files,2);
 assert.equal(h.inventoryFor(a).summary.bytes,22);assert.match(h.inventoryFor(a).summary.sha256,/^[a-f0-9]{64}$/);
 assert.equal(JSON.stringify(h.inventoryFor(a)).includes('synthetic-'),false);
 b.set('a.js',Buffer.from('changed'));assert.notEqual(h.inventoryFor(a).summary.sha256,h.inventoryFor(b).summary.sha256);
});
test('synthetic profile denial retains the matching actor contract and raw fixture availability',()=>{
 const x=f.createFixture(),profile=request('/rest/v1/rpc/list_system_user_profiles');
 assert.equal(x.respond(profile).data[0].id,f.ACTOR);x.state.denyProtected=true;
 assert.equal(x.respond(profile).kind,'protected-profile-denial');assert.equal(x.respond(profile).status,403);
 x.state.denyProtected=false;assert.equal(x.respond(profile).data[0].id,f.ACTOR);
 assert.equal(x.respond(request('/rest/v1/system_users',null,{method:'GET',search:'?select=permissions'})).kind,'raw-permissions-read');
});
test('all default business mutations and unknown origins/contracts fail closed',()=>{
 const x=f.createFixture();
 for(const req of [note,upload,attachment,request('/rest/v1/rpc/save_pcb_designer_workspace_locked'),request('/rest/v1/rpc/maintenance_update_fault'),request('/rest/v1/system_users',{}, {method:'PATCH'}),request('/storage/v1/object/unknown/x')])assert.equal(x.respond(req).kind,'forbidden');
 x.state.allowMaintenanceSuccess=true;
 assert.equal(x.respond(request('/rest/v1/rpc/save_pcb_designer_workspace_locked')).kind,'forbidden','PCB local settings success does not authorize a remote save');
 assert.deepEqual(x.state.writes,[]);
});
test('only the exact synthetic note PNG and metadata can complete successfully',()=>{
 const x=acceptedFixture();f.assertSuccessfulMaintenance(x.state);
 const thread=x.respond(request('/rest/v1/rpc/maintenance_thread',{p_issue_id:f.ISSUE}));
 assert.equal(thread.data.messages[0].body,f.NOTE.trim());assert.equal(thread.data.messages[0].actor_id,f.ACTOR);
 assert.equal(thread.data.attachments[0].file_path,objectPath);
});
test('maintenance thread only accepts the exact workspace issue contract',()=>{
 const x=f.createFixture(),read=request('/rest/v1/rpc/maintenance_thread',{p_issue_id:f.ISSUE});
 assert.equal(x.respond(read).kind,'read');
 for(const other of [{...read,headers:{}},{...read,headers:{'content-profile':'public'}},{...read,body:null},{...read,body:[]},{...read,body:{...read.body,unexpected:true}},{...read,search:'?select=*'},{...read,body:{p_issue_id:'wrong'}}])assert.equal(x.respond(other).kind,'forbidden');
});
test('wrong actor/issue, schema, order and object bytes are not accepted',()=>{
 const x=f.createFixture();x.state.allowMaintenanceSuccess=true;
 assert.equal(x.respond({...note,headers:{'content-profile':'public'}}).kind,'forbidden');
 assert.equal(x.respond({...note,body:{...note.body,p_issue_id:'wrong'}}).kind,'forbidden');
 assert.equal(x.respond({...note,body:{...note.body,p_actor_id:f.ACTOR}}).kind,'forbidden');
 assert.equal(x.respond(upload).kind,'forbidden');
 x.respond(note);assert.equal(x.respond({...upload,rawBody:Buffer.from('not PNG')}).kind,'forbidden');
 assert.equal(x.respond(attachment).kind,'forbidden');x.respond(upload);
 assert.equal(x.respond({...attachment,body:{...attachment.body,p_file:{...attachment.body.p_file,file_name:'different.png'}}}).kind,'forbidden');
 assert.equal(x.respond({...attachment,body:{...attachment.body,p_file:{...attachment.body.p_file,actor_id:f.ACTOR}}}).kind,'forbidden');
});
test('multipart upload uses the real single PNG payload, not a synthetic success stub',()=>{
 const boundary='synthetic-boundary',raw=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="cacheControl"\r\n\r\n3600\r\n--${boundary}\r\nContent-Disposition: form-data; name=""; filename="${f.FILE_NAME}"\r\nContent-Type: image/png\r\n\r\n`),f.PNG,Buffer.from(`\r\n--${boundary}--\r\n`)]);
 assert.deepEqual(f.uploadedFileBytes({headers:{'content-type':`multipart/form-data; boundary=${boundary}`},rawBody:raw}),f.PNG);
 assert.equal(f.uploadedFileBytes({headers:{'content-type':'multipart/form-data'},rawBody:raw}),null);
 assert.equal(f.uploadedFileBytes({headers:{'content-type':'image/png'}}),null);
});
test('only an uploaded synthetic object can be signed/read, with a bounded TTL',()=>{
 const x=acceptedFixture(),target='/storage/v1/object/sign/issue-attachments/'+objectPath;
 assert.equal(x.respond(request(target,{expiresIn:300})).kind,'synthetic-attachment-sign');
 assert.equal(x.respond(request(target,{expiresIn:3600})).kind,'forbidden');
 assert.equal(x.respond(request(target,null,{method:'GET',search:'?token=wrong'})).kind,'forbidden');
 assert.deepEqual(x.respond(request(target,null,{method:'GET',search:'?token=synthetic-signed-token'})).bytes,f.PNG);
 assert.equal(x.respond(request(target+'/different',{expiresIn:300})).kind,'forbidden');
});
test('retry identities are idempotent but unexpected duplicate UI sends remain visible',()=>{
 const x=acceptedFixture();x.respond(note);x.respond(attachment);
 assert.equal(x.state.messages.length,1);assert.equal(x.state.attachments.length,1);
 assert.throws(()=>f.assertSuccessfulMaintenance(x.state),/Expected values/);
});
test('full-bundle loader refuses seeds/maps/BOM and output symlinks',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'current-draft-loader-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'index.html'),'synthetic');fs.writeFileSync(path.join(dir,'MaterialRequestPage-probe.js'),'BOM excluded');fs.writeFileSync(path.join(dir,'plain.js.map'),'map excluded');
 fs.mkdirSync(path.join(dir,'assets'));fs.writeFileSync(path.join(dir,'assets/ApiManagementPage-probe.js'),'unrelated API route excluded');
 const excluded=[];assert.deepEqual([...h.collectFiles(dir,{excluded}).keys()],['index.html']);
 assert.equal(excluded.length,3);assert.match(excluded.find(x=>x.file==='assets/ApiManagementPage-probe.js').reason,/hardcoded production endpoint/);
 assert.ok(excluded.every(x=>x.bytes>0&&/^[a-f0-9]{64}$/.test(x.sha256)));
 fs.writeFileSync(path.join(dir,'seed.js'),'materialRequestSeed');assert.throws(()=>h.collectFiles(dir),/Seed reference/);fs.unlinkSync(path.join(dir,'seed.js'));
 fs.symlinkSync(path.join(dir,'index.html'),path.join(dir,'alias.js'));assert.throws(()=>h.collectFiles(dir),/symlink/);
});
test('the explicit API exclusion never waives the servable endpoint guard',()=>{
 const files=new Map([['assets/index-test.js',Buffer.from(f.BACKEND)]]);
 assert.doesNotThrow(()=>h.assertSyntheticBundle(files));
 files.set('assets/unexpected.js',Buffer.from('https://unexpected-project.supabase.co'));
 assert.throws(()=>h.assertSyntheticBundle(files),/Production project endpoint/);
 assert.throws(()=>h.assertSyntheticBundle(new Map([['assets/index.js',Buffer.from('no synthetic config')]])),/synthetic endpoint/);
});
test('current static server is GET-only, loopback-tested and has no legacy phase',async()=>{
 const x=h.createCurrentServer(new Map([['index.html',Buffer.from('synthetic current')],['assets/test.mjs',Buffer.from('export default 1')],['assets/MaterialRequestPage-x.js',Buffer.from('must not serve')],['assets/ApiManagementPage-x.js',Buffer.from('must not serve')]]));
 await new Promise(resolve=>x.server.listen(0,'127.0.0.1',resolve));
 try{const origin=`http://127.0.0.1:${x.server.address().port}/station-status-hub/`;
  assert.equal(await(await fetch(origin)).text(),'synthetic current');
  const module=await fetch(origin+'assets/test.mjs');assert.equal(module.headers.get('content-type'),'text/javascript');assert.equal(module.headers.get('cache-control'),'no-store');
  assert.equal((await fetch(origin+'assets/MaterialRequestPage-x.js')).status,404);assert.equal((await fetch(origin,{method:'POST'})).status,404);
  assert.equal((await fetch(origin+'assets/ApiManagementPage-x.js')).status,404,'Even a caller-provided map cannot supply the unrelated API route');
 }finally{await new Promise(resolve=>x.server.close(resolve));}
});
test('six scenarios cover maintenance clear/success and real keyboard raw PCB values',()=>{
 assert.equal(h.SCENARIOS.length,6);assert.equal(h.LABELS.length,7);
 assert.deepEqual(h.SCENARIOS.filter(x=>x.workspace==='pcb-designer').map(x=>x.rawWidth),['1e','-','12.','19']);
 assert.equal(h.PCB_ERROR,'板框尺寸必須介於 20 到 1000 mm。');
});
test('source guard: full current bundle, synthetic config and guard before Chromium',()=>{
 const source=fs.readFileSync(path.join(__dirname,'currentClientDraftRecovery.browser.cjs'),'utf8');
 assert.match(source,/await build\(\{root,configFile/);assert.match(source,/VITE_SUPABASE_SCHEMA='workspace'/);assert.match(source,/VITE_REALTIME_COLLABORATION_V2='true'/);
 assert.ok(source.indexOf("if(mode==='build-only')")<source.indexOf('.chromium.launch('));
 assert.ok(source.indexOf('executionMode(env)')<source.indexOf('.chromium.launch('));
 for(const token of ['EXACT96_DIST','EXACT80_DIST','download_workflow','recordHar','tracing.start','storageState:'])assert.equal(source.includes(token),false,token);
 assert.match(source,/--proxy-server=/);assert.match(source,/MAP \* ~NOTFOUND, EXCLUDE 127\.0\.0\.1/);assert.match(source,/serviceWorkers:'block'/);
 assert.match(source,/routeWebSocket\('\*\*\/\*'/);assert.equal(source.includes('.connectToServer('),false);
 assert.match(source,/compiledCompleteApplication:true,servedSubset:true/);assert.equal(source.includes('completeCurrentViteBundle'),false);
});
test('source guard: actual app identity, native File telemetry and exact raw snapshots',()=>{
 const source=fs.readFileSync(path.join(__dirname,'currentClientDraftRecovery.browser.cjs'),'utf8');
 assert.equal(source.includes('setDocumentDraftActor'),false,'Never stub the application identity owner');
 assert.match(source,/value instanceof File/);assert.match(source,/new WeakMap/);assert.match(source,/sha256.*Array\.from/s);
 assert.match(source,/pressSequentially\(rawWidth\)/);assert.match(source,/raw-permissions-read.*length,0/);
 assert.match(source,/beforeUnload\(h\.page\),dirty/);assert.match(source,/JSON and PNG/);
 assert.equal(source.includes('page.setContent'),false);assert.equal(source.includes('addScriptTag'),false);
});
