const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BASE, sha, safePath, createResearchServer } = require('./exact80-server.cjs');
const oldFiles = new Map([['index.html',Buffer.from('old document')],['assets/old-auth.js',Buffer.from('old auth')],['assets/old-safe.js',Buffer.from('safe')]]);
const candidateFiles = new Map([['index.html',Buffer.from('new document')],['assets/new.js',Buffer.from('new code')]]);
const make = overrides => createResearchServer({ oldFiles, candidateFiles, extras:new Map([['assets/old-safe.js',Buffer.from('safe')]]),blockedOld:['assets/old-auth.js'], ...overrides });
test('veto traversal, BOM names and source maps',()=>{for(const s of ['../x','a/../x','/foo','a\\x','a//b','assets/materialRequestSeed-q.js','assets/MaterialRequestPage-a.js','a.js.map'])assert.equal(safePath(s),false);assert.equal(safePath('assets/plain.js'),true)});
test('reject an old excluded executable under a new alias',()=>assert.throws(()=>make({candidateFiles:new Map([['assets/new-name.js',Buffer.from('old auth')]])}),/Revoked/));
test('reject republishing old auth via extras',()=>assert.throws(()=>make({extras:new Map([['assets/old-auth.js',Buffer.from('old auth')]])}),/Forbidden retained/));
test('reject replacement under old hash path',()=>assert.throws(()=>make({extras:new Map([['assets/old-safe.js',Buffer.from('patched replacement')]])}),/exact original/));
test('candidate cannot change a retained same path',()=>assert.throws(()=>make({candidateFiles:new Map([['assets/old-safe.js',Buffer.from('different')]])}),/rewriting/));
test('same origin server switches document/assets and denies excluded bytes',async()=>{
 const h=make();await new Promise(r=>h.server.listen(0,'127.0.0.1',r));
 try {const origin=`http://127.0.0.1:${h.server.address().port}`;
 assert.equal(await(await fetch(origin+BASE)).text(),'old document');
 assert.equal((await fetch(origin+BASE+'assets/old-auth.js')).status,200);
 h.cutover();assert.equal(await(await fetch(origin+BASE)).text(),'new document');
 assert.equal((await fetch(origin+BASE+'assets/old-auth.js')).status,404);
 const response=await fetch(origin+BASE+'assets/old-safe.js');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(sha(Buffer.from(await response.arrayBuffer())),sha(Buffer.from('safe')));
 assert.equal((await fetch(origin+BASE+'assets/materialRequestSeed-any.js')).status,404);
 assert.equal((await fetch(origin+BASE,{method:'POST'})).status,404);
 assert.equal(h.responses.filter(x=>x.phase==='candidate'&&x.sha256===sha(Buffer.from('old auth'))).length,0);
 } finally {await new Promise(r=>h.server.close(r));}
});
const {responseFor,session,pcb}=require('./exact80-fixtures.cjs');
test('synthetic backend refuses unknown read and every business write',()=>{
 for(const request of [{method:'POST',pathname:'/rest/v1/rpc/maintenance_add_note'},{method:'POST',pathname:'/rest/v1/rpc/save_pcb_designer_workspace_locked'},{method:'PATCH',pathname:'/rest/v1/system_users'},{method:'POST',pathname:'/storage/v1/object/issue-attachments/file'},{method:'GET',pathname:'/rest/v1/unknown_table'}])assert.equal(responseFor({...request,headers:{},search:''}).kind,'forbidden');
});
test('synthetic raw denial and non-sensitive reads are distinguished',()=>{
 assert.equal(responseFor({method:'GET',pathname:'/rest/v1/system_users',headers:{},search:'?select=permissions'},{denyRaw:true}).status,403);
 assert.equal(responseFor({method:'GET',pathname:'/rest/v1/system_users',headers:{},search:'?select=id,display_name'},{denyRaw:true}).kind,'raw-profile-read');
});
test('sessions and PCB inputs contain only fixed synthetic identities',()=>{const s=session();assert.equal(s.user.email,'synthetic@example.invalid');assert.equal(s.refresh_token,'synthetic-refresh-not-a-real-credential');assert.equal(pcb.projects[0].id,'synthetic-board')});
test('pinned research extras never include rejected modules or source maps',()=>{const manifest=require('./exact80-manifest.json');assert.equal(manifest.researchOnly,true);assert.equal(manifest.postCutoverExtra.length,3);for(const item of manifest.postCutoverExtra){assert.ok(safePath(item.path));assert.ok(!/PrivateAttachment|Authenticated|AdminPanel|PcbDesigner|MaterialRequest/.test(item.path));assert.equal(manifest.oldAllowedBoot[item.path].sha256,item.sha256)}});

const http = require('node:http');
const { createNetworkSink, redactEvidence, sanitizeEvidence } = require('./exact80-server.cjs');
const { realtimeResponse } = require('./exact80-fixtures.cjs');
test('transport backstop rejects HTTP and CONNECT without forwarding',async()=>{
 const sink=createNetworkSink();await new Promise(resolve=>sink.server.listen(0,'127.0.0.1',resolve));
 try{
  const port=sink.server.address().port;
  assert.equal((await fetch(`http://127.0.0.1:${port}/synthetic`)).status,403);
  const status=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,method:'CONNECT',path:'synthetic.invalid:443'});req.on('connect',(res,socket)=>{socket.destroy();resolve(res.statusCode);});req.on('error',reject);req.end();});
  assert.equal(status,403);assert.deepEqual(sink.attempts,[{kind:'http',method:'GET',blocked:true},{kind:'connect',method:'CONNECT',blocked:true}]);
 }finally{await new Promise(resolve=>sink.server.close(resolve));}
});
test('all failure report fields and nested credentials are redacted without corrupting JSON',()=>{
 const token=['eyJsynthetic','payload','signature'].join('.');
 const value={error:'https://synthetic.invalid/path?apikey=value '+token,browserErrors:['wss://synthetic.invalid/realtime?apikey=value'],body:'apikey=synthetic-sensitive Bearer synthetic-sensitive',nested:{Authorization:'synthetic-sensitive',access_token:token},count:3};
 value.quoted = JSON.stringify({refresh_token:'synthetic-opaque-secret',apiKey:'synthetic-opaque-secret',authorization:'synthetic-opaque-secret'});
 const safe=sanitizeEvidence(value),encoded=JSON.stringify(safe);assert.doesNotMatch(encoded,/synthetic-opaque-secret/);assert.doesNotMatch(encoded,/synthetic-sensitive|eyJsynthetic|synthetic\.invalid/);assert.equal(JSON.parse(encoded).count,3);assert.match(redactEvidence(value.body),/redacted-credential/);
});
test('Realtime fixture acknowledges only known protocol and presence, never broadcast/business events',()=>{
 for(const value of [[null,'1','realtime:synthetic','broadcast',{event:'save',payload:{}}],[null,'1','realtime:synthetic','save',{}],[null,'1','realtime:synthetic','presence',{event:'unrecognized'}],{}])assert.equal(realtimeResponse(value).kind,'forbidden');
 for(const value of [[null,'1','phoenix','heartbeat',{}],[null,'1','realtime:synthetic','phx_join',{config:{postgres_changes:[{table:'synthetic'}]}}],[null,'1','realtime:synthetic','presence',{event:'track',payload:{synthetic:true}}]])assert.notEqual(realtimeResponse(value).kind,'forbidden');
 assert.equal(realtimeResponse([null,'1','realtime:synthetic','phx_join',{config:{postgres_changes:[{table:'synthetic'}]}}]).reply[4].response.postgres_changes[0].id,1);
});

test('renamed vulnerable 96/741/80 executables stay vetoed without transferred browser coverage',()=>{
 const m=require('./exact80-manifest.json'),{REVOKED}=require('./exact80-server.cjs');
 assert.equal(m.publicationApproved,false);
 assert.equal(m.additionalRevokedExecutables.length,18);
 assert.ok(m.otherUnexercisedProductionBaselines.every(x=>x.coveredByThis80ToF6Suite===false));
 for(const item of m.additionalRevokedExecutables){assert.ok(REVOKED.has(item.sha256));assert.ok(!Object.values(m.candidateFiles).includes(item.sha256));}
});

test('PCB boot does not inherit station module routing precedence',()=>{
 const {workspaceQuery,PROJECT,ISSUE}=require('./exact80-fixtures.cjs');
 assert.deepEqual(Object.fromEntries(workspaceQuery('pcb-designer')),{project:PROJECT,workspace:'pcb-designer'});
 assert.deepEqual(Object.fromEntries(workspaceQuery('station-status')),{project:PROJECT,workspace:'station-status',module:'issues',openIssue:ISSUE});
 assert.throws(()=>workspaceQuery('unmodeled-workspace'),/Unmodeled/);
});
