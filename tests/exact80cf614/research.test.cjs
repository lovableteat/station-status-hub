const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createRequire}=require('node:module');
const {JSDOM}=createRequire(path.resolve(process.env.AUDIT_QA_DIR||'../qa-tools','package.json'))('jsdom');
const m=require('./manifest.json'),p=require('./paths.cjs'),h=require('./crossrelease.browser.cjs'),inputs=require('./inputs.cjs');
const original=require('../exact80/exact80-manifest.json'),server=require('../exact80/exact80-server.cjs'),fixture=require('../exact80/exact80-fixtures.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8'),browser=read('crossrelease.browser.cjs');
test('exact80 and fixed cf614 with complete byte inventory are independently pinned',()=>{
 assert.equal(inputs.sha(Buffer.from(read('manifest.json'))),'5cd517b7c2bb283edcdd4d94b0c3fb16113e879cc8bc7531521e1f1cba5389e1');
 assert.equal(m.sourceCommit,'80f2c4c071c3c88a85d247b7c3d48b303ccdd57c');assert.equal(m.sourceArtifact,13932556496);
 assert.equal(m.sourceArtifactSha256,'0ea50b92cad632805040cf4e4c8acba49097eed58a086cbcd41c5c466851bdd6');
 assert.equal(m.candidateCommit,'cf6142474a7974d6a71ef0679dc549685171c40e');assert.equal(m.candidateTree,'0932c4057c1d8cc42c92c24b3fcdafd7c677ea95');
 assert.equal(Object.keys(m.candidateFiles).length,334);assert.equal(m.candidateStaticIdentity.bytes,61718358);
 assert.equal(inputs.sha(Buffer.from(JSON.stringify(m.candidateFiles))),m.candidateStaticIdentity.pathHashInventorySha256);
 assert.equal(m.publicationApproved,false);assert.equal(m.researchOnly,true);assert.equal(m.sourceUnderTest.browserCoverageStatus,'not-run-for-this-candidate-pair');
});
test('frozen exact80-to-f6 manifest and negative browser study remain byte-identical',()=>{
 assert.equal(inputs.sha(fs.readFileSync(path.join(__dirname,'../exact80/exact80-manifest.json'))),'642a6688f66a814253f2c0ad3f3693ea763b1b8ce3fcf2eea47f902116975821');
 assert.equal(inputs.sha(fs.readFileSync(path.join(__dirname,'../exact80/exact80-crossrelease.browser.cjs'))),'6f877961f3cf471238e16c1482a3aeb2a441011135c2c51f7fd9f4b6d288d70c');
 assert.equal(original.candidateCommit,'f6fadefcf503d9326af88757a2d2d42a8dd45ad1');assert.deepEqual(m.oldAllowedBoot,original.oldAllowedBoot);
 assert.equal(m.frozenPredecessor.protectedDenialCharacterizationRemainsNegative,true);
});
test('original boot53 and candidate entry mapping are not a renamed f6 assumption',()=>{
 assert.equal(Object.keys(m.oldAllowedBoot).length,53);assert.equal(m.derivation.recheckedOldBootFiles,53);
 assert.deepEqual(p.CORE,['ENTRY','AUTH','INDEX'].map(k=>m.derivation.bootRoots[k]));
 assert.deepEqual(p.CANDIDATE_CORE,['ENTRY','AUTH','INDEX'].map(k=>m.candidateEntryPaths[k]));
 for(const k of ['ENTRY','AUTH','INDEX','MAINT','DASH','PCB'])assert.notEqual(m.candidateEntryPaths[k],original.candidateEntryPaths[k]);
 for(const file of p.CANDIDATE_CORE)assert.ok(m.candidateFiles[file]);
 for(const file of Object.keys(m.oldAllowedBoot))assert.ok(server.safePath(file));
});
test('Dashboard3 remains conditional research, with six resident dependencies and four exact CSS reuses',()=>{
 assert.deepEqual(m.postCutoverExtra,original.postCutoverExtra);assert.equal(m.postCutoverExtra.length,3);
 assert.equal(m.postCutoverExtra.reduce((sum,x)=>sum+x.bytes,0),10777);assert.equal(m.warmDashboard.requiredAlreadyResidentJs.length,6);
 for(const extra of m.postCutoverExtra){assert.equal(m.candidateFiles[extra.path],undefined);assert.equal(m.oldAllowedBoot[extra.path].sha256,extra.sha256);assert.ok(!m.revokedHashes.includes(extra.sha256));}
 assert.equal(m.warmDashboard.cssCurrentReuse.length,4);for(const css of m.warmDashboard.cssCurrentReuse)assert.equal(m.candidateFiles[css.path],css.sha256);
 for(const flag of ['notACompleteRetainedClosure','notColdStartSupport','notSecurityRepairForResidentCode'])assert.equal(m.warmDashboard[flag],true);
 assert.ok(m.warmDashboard.selectedSourceHashes.every(x=>x.sameCf614Source));
});
test('revoked identities still cover old Auth/Admin/PCB/HTML/BOM and cannot enter candidate',()=>{
 assert.deepEqual(m.blockedOldPaths,original.blockedOldPaths);assert.deepEqual(m.revokedHashes,original.revokedHashes);
 for(const hash of m.revokedHashes)assert.equal(Object.values(m.candidateFiles).includes(hash),false);
 const oldBytes=Buffer.from('synthetic old unsafe'),oldName=p.BLOCKED_OLD[1];
 assert.throws(()=>server.createResearchServer({oldFiles:new Map([[oldName,oldBytes]]),candidateFiles:new Map([['assets/renamed.js',oldBytes]]),extras:new Map()}),/Revoked bytes/);
 assert.equal(Object.keys(m.candidateFiles).filter(server.safePath).length,332);
});
test('manifest is metadata only, no executable bundle or configuration values',()=>{
 const text=read('manifest.json');assert.doesNotMatch(text,/https:\/\/[a-z0-9-]+\.supabase\.co|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sourceMappingURL|export\s+default|import\(/);
 assert.equal(m.publicBuildConfiguration.valuesLogged,false);assert.equal(m.publicBuildConfiguration.schema,'workspace');assert.equal(m.publicBuildConfiguration.realtimeV2,true);
});
test('local default, push and pull_request_target cannot launch Chromium',()=>{
 for(const env of [{},{GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'push'},{GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'pull_request_target'}])assert.throws(()=>h.executionMode(env));
 assert.equal(h.executionMode({EXACT80_CF614_BUILD_ONLY:'1'}),'build-only');
 assert.equal(h.executionMode({GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'pull_request'}),'browser');
 assert.ok(browser.indexOf("if(mode==='build-only')")<browser.indexOf('.chromium.launch('));
});
test('16 planned viewport cases keep old negative separate from fixed candidate positives',()=>{
 assert.equal(h.caseNames.length,8);assert.equal(h.caseNames.filter(x=>x.includes('positive-recovery')).length,2);
 assert.equal(h.caseNames.filter(x=>x.includes('protected-reads-with-old-grants')).length,2);
 assert.ok(h.caseNames.includes('raw-permission-revocation-characterization-not-release-proof'));
 assert.match(browser,/assert\.equal\(result\.characterization\.unsentDraftSurvived,false/);
 assert.match(browser,/assert\.deepEqual\(after,before,'Exact cf614 must restore/);
});
test('candidate positive uses same actual Document/actor, native File identity and outside-gate warning',()=>{
 for(const text of ['new WeakMap','value instanceof File','crypto.subtle.digest','sameActorRestored:true',"state:'detached'","beforeUnload(h.page),true",'document===original','h.documentLoads,1'])assert.ok(browser.includes(text));
 assert.match(browser,/raw-permissions-read'\)\.length,0/);assert.equal(h.LABELS.length,7);assert.equal(h.PCB_RAW[1].includes('\n'),false);
 assert.ok(browser.includes("fillPcbDraft(dialog,'1e')"));assert.ok(browser.includes("fillPcbDraft(dialog,'19')"));assert.match(browser,/pressSequentially\(width\)/);
 assert.doesNotMatch(browser,/setDocumentDraftActor|page\.setContent|addScriptTag|force:\s*true/);
});
test('real DOM status label contains option text but the scoped native select contract is exact',()=>{
 const dom=new JSDOM('<form id="pcb"><label data-pcb-field-tone="draft">\n 狀態\n <select><option value="draft">草稿</option><option value="review">審核中</option><option value="approved">已核准</option></select></label></form><label data-pcb-field-tone="draft">狀態<select><option>outside</option></select></label>');
 try{
  const form=dom.window.document.querySelector('#pcb'),fields=form.querySelectorAll(h.STATUS_SELECTOR);assert.equal(fields.length,1);
  const select=fields[0];assert.ok(select instanceof dom.window.HTMLSelectElement);
  assert.match(select.parentElement.textContent,/狀態\s*草稿審核中已核准/);assert.notEqual(select.parentElement.textContent.trim(),'狀態');
  assert.equal(h.pcbStatusControlContract(select),true);select.value='review';assert.equal(select.value,'review');
  select.parentElement.firstChild.textContent='不是狀態';assert.equal(h.pcbStatusControlContract(select),false);
  select.parentElement.firstChild.textContent='狀態';select.parentElement.removeAttribute('data-pcb-field-tone');assert.equal(h.pcbStatusControlContract(select),false);
  select.parentElement.setAttribute('data-pcb-field-tone','review');form.append(select.parentElement.cloneNode(true));assert.equal(form.querySelectorAll(h.STATUS_SELECTOR).length,2);
  assert.match(browser,/assert\.equal\(await field\.count\(\),1/);assert.match(browser,/field\.evaluate\(pcbStatusControlContract\)/);
  assert.match(browser,/LABELS\.map\(async label=>\(await pcbField\(dialog,label\)\)\.inputValue\(\)\)/);assert.match(browser,/const field=await pcbField\(dialog,LABELS\[i\]\)/);
 }finally{dom.window.close();}
});
test('transport remains synthetic with deny proxy/DNS/WS and no source/HAR evidence',()=>{
 for(const text of ['--proxy-server=http://127.0.0.1:','MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',"serviceWorkers:'block'","h.context.route('**/*'","h.context.routeWebSocket('**/*'",'assert.deepEqual(sink.attempts,[],','JSON/PNG','sanitizeEvidence(report)'])assert.ok(browser.includes(text),text);
 assert.doesNotMatch(browser,/\.connectToServer\(|recordHar|tracing\.start|storageState\(|innerText\(\)\.catch|request\.headers.*h\.calls/);
 for(const name of ['maintenance_add_note','maintenance_add_attachment','save_pcb_designer_workspace_locked'])assert.equal(fixture.responseFor({pathname:'/rest/v1/rpc/'+name,method:'POST',headers:{},body:{},search:''}).kind,'forbidden');
});
test('public configuration parser accepts only a unique matching anon identity',()=>{
 const token=(role='anon',ref='synthetic-config')=>[Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'),Buffer.from(JSON.stringify({role,iss:'supabase',ref})).toString('base64url'),'synthetic-signature'].join('.');
 const sample=(role,ref)=>JSON.stringify('https://synthetic-config.supabase.co')+';'+JSON.stringify(token(role,ref));
 assert.equal(inputs.parsePublicConfiguration(sample()).schema,'workspace');
 assert.throws(()=>inputs.parsePublicConfiguration(sample('service_role')),/anon configuration/);
 assert.throws(()=>inputs.parsePublicConfiguration(sample('anon','different')),/anon configuration/);
 assert.throws(()=>inputs.parsePublicConfiguration(sample()+';"https://second-project.supabase.co"'),/unique/);
});
test('input verification rejects symlinks and an incomplete candidate without a browser',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cf614-fixture-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'index.html'),'synthetic');assert.throws(()=>inputs.verifyCandidateDirectory(root),/pinned candidate paths/);
 fs.symlinkSync(path.join(root,'index.html'),path.join(root,'alias'));assert.throws(()=>inputs.pathsUnder(root),/symlink/);
});
test('CI build helper pins HEAD/tree/lock, rechecks clean source and hashes every output',()=>{
 const build=read('build-candidate.mjs');
 for(const text of ["git(['rev-parse','HEAD'])","git(['rev-parse','HEAD^{tree}'])","git(['status','--porcelain=v1','--untracked-files=all'])",'manifest.candidateLockSha256',"VITE_SUPABASE_SCHEMA='workspace'","VITE_REALTIME_COLLABORATION_V2='true'",'verifyCandidateDirectory'])assert.ok(build.includes(text));
 assert.equal(build.split('verifySource();').length-1,2);assert.doesNotMatch(build,/fetch\(|https:\/\/[a-z0-9-]+\.supabase\.co|console\.log\(config/);
});
test('suggested job is same-repository PR-only and uploads only JSON/PNG evidence',()=>{
 const proposal=read('README.md').split('```yaml\n')[1].split('```')[0];
 for(const text of ["github.event_name == 'pull_request'",'github.event.pull_request.number == 49','head.repo.full_name == github.repository','contents: read','actions: read','ref: '+m.candidateCommit,'node --test tests/exact80cf614/research.test.cjs','retention-days: 3'])assert.ok(proposal.includes(text));
 assert.doesNotMatch(proposal,/secrets\.|(?:pages|contents|id-token): write|actions\/deploy|supabase\s+(?:db|functions)|pull_request_target|continue-on-error|--location-trusted|upload-pages-artifact/);
 assert.deepEqual(proposal.split('          path: |\n')[1].trim().split('\n').map(x=>x.trim()),['${{ runner.temp }}/exact80-cf614-evidence/report.json','${{ runner.temp }}/exact80-cf614-evidence/*.png']);
});


test('installed PR job exactly matches its reviewed read-only proposal and orders QA dependencies first',()=>{
 const proposal=read('README.md').split('```yaml\n')[1].split('```')[0].trimEnd();
 const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/audit-regression.yml'),'utf8');
 const installed=workflow.slice(workflow.indexOf('  exact80_cf614:\n')).trimEnd();
 assert.equal(installed,proposal);
 assert.ok(installed.indexOf('jsdom@29.1.1 playwright@1.58.2')<installed.indexOf('node --test tests/exact80cf614/research.test.cjs'));
});
