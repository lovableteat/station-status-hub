const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const m=require('./manifest.json'),p=require('./paths.cjs'),h=require('./crossrelease.browser.cjs'),inputs=require('./inputs.cjs'),server=require('./server.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8'),browser=read('crossrelease.browser.cjs');
test('published68 source and independently built candidate are pinned, metadata only',()=>{
 assert.equal(inputs.sha(Buffer.from(read('manifest.json'))),'9078631d467feb9346fe8d0e7ed062c74880525798070db8b58472ff33033b13');
 assert.equal(m.sourceCommit,'68a06547fda6c66dd3eb9a89b4579fc870e1b062');assert.equal(m.sourceRun,43254900838);assert.equal(m.sourceArtifact,13961468119);
 assert.equal(m.sourceArtifactSha256,'95b5bd3f23312ccf9eaf4b9cb8eb5b34a29a6d6e450f2d565c55e00bd448bed7');
 assert.equal(m.candidateCommit,'149184847764466db200250aff8c716dde46720a');assert.equal(m.candidateTree,'3a01a407ab4ad6b3e1d31a6bcf8c83cbc46489f9');
 assert.equal(Object.keys(m.candidateFiles).length,334);assert.equal(m.candidateStaticIdentity.bytes,61784693);
 assert.equal(inputs.sha(Buffer.from(JSON.stringify(m.candidateFiles))),m.candidateStaticIdentity.pathHashInventorySha256);
 assert.equal(m.publicationApproved,false);assert.equal(m.researchOnly,true);assert.equal(m.sourceUnderTest.browserCoverageStatus,'not-run-for-this-candidate-pair');
 assert.doesNotMatch(read('manifest.json'),/https:\/\/[a-z0-9-]+\.supabase\.co|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sourceMappingURL|export\s+default|import\(/);
});
test('historical evidence is unchanged, not relabeled as latest evidence',()=>{
 for(const[file,hash]of [['manifest.json','5cd517b7c2bb283edcdd4d94b0c3fb16113e879cc8bc7531521e1f1cba5389e1'],['crossrelease.browser.cjs','27d00cada9bd4558cb087b6f863857bb29fd7a14fe02dbaea9982f29adbc272a']])assert.equal(inputs.sha(fs.readFileSync(path.join(__dirname,'../exact80cf614',file))),hash);
 assert.match(browser,/historical80-to-f6 negative study remains unchanged/);
});
test('boot closure, real entry mapping and only two nonresident dashboard extras are pinned',()=>{
 assert.equal(Object.keys(m.oldAllowedBoot).length,52);assert.equal(m.derivation.recheckedOldBootFiles,52);
 assert.deepEqual(p.CORE,['ENTRY','AUTH','INDEX'].map(k=>m.derivation.bootRoots[k]));
 assert.deepEqual(p.CANDIDATE_CORE,['ENTRY','AUTH','INDEX'].map(k=>m.candidateEntryPaths[k]));
 assert.equal(m.postCutoverExtra.length,2);assert.equal(m.warmDashboard.requiredAlreadyResidentJs.length,7);
 for(const extra of m.postCutoverExtra){assert.equal(m.oldAllowedBoot[extra.path].sha256,extra.sha256);assert.equal(m.candidateFiles[extra.path],undefined);assert.ok(!m.revokedHashes.includes(extra.sha256));}
 for(const css of m.warmDashboard.cssCurrentReuse)assert.equal(m.candidateFiles[css.path],css.sha256);
 assert.deepEqual(m.warmDashboard.genuinelyNotLoadedBeforeCutover,m.postCutoverExtra.map(x=>x.path));
 for(const file of Object.keys(m.oldAllowedBoot))assert.ok(server.safePath(file));
});
test('old latest executable bytes cannot be renamed into candidate or retained extras',()=>{
 for(const hash of m.revokedHashes)assert.ok(!Object.values(m.candidateFiles).includes(hash));
 const bytes=Buffer.from('synthetic old latest unsafe'),filename=p.BLOCKED_OLD[0];
 assert.throws(()=>server.createResearchServer({oldFiles:new Map([[filename,bytes]]),candidateFiles:new Map([['assets/renamed.js',bytes]]),extras:new Map()}),/Revoked bytes/);
 assert.throws(()=>server.createResearchServer({oldFiles:new Map([[filename,bytes]]),candidateFiles:new Map(),extras:new Map([[filename,bytes]])}),/Forbidden retained/);
});
test('no local, push, target-PR or implicit browser launch is allowed',()=>{
 for(const env of [{},{GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'push'},{GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'pull_request_target'}])assert.throws(()=>h.executionMode(env));
 assert.equal(h.executionMode({EXACT68_PAIR_BUILD_ONLY:'1'}),'build-only');assert.equal(h.executionMode({GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'pull_request'}),'browser');
 assert.ok(browser.indexOf("if(mode==='build-only')")<browser.indexOf('.chromium.launch('));
});
test('all 16 viewport cases retain positive recovery and explicit negative raw revocation',()=>{
 assert.equal(h.caseNames.length,8);assert.equal(h.caseNames.filter(x=>x.includes('positive-recovery')).length,2);assert.equal(h.caseNames.filter(x=>x.includes('protected-reads-with-old-grants')).length,2);
 assert.ok(h.caseNames.includes('raw-permission-revocation-characterization-not-release-proof'));
 assert.match(browser,/assert\.equal\(result\.characterization\.unsentDraftSurvived,false/);
 for(const text of ['new WeakMap','value instanceof File','crypto.subtle.digest','sameActorRestored:true',"state:'detached'","beforeUnload(h.page),true",'document===original','h.documentLoads,1','assert.deepEqual(after,before'])assert.ok(browser.includes(text),text);
 assert.equal(h.LABELS.length,7);assert.ok(browser.includes("fillPcbDraft(dialog,'1e')"));assert.ok(browser.includes("fillPcbDraft(dialog,'19')"));assert.match(browser,/pressSequentially\(width\)/);
 assert.doesNotMatch(browser,/setDocumentDraftActor|page\.setContent|addScriptTag|force:\s*true/);
});
test('network denial, synthetic service allowlist and evidence redaction remain intact',()=>{
 for(const text of ['--proxy-server=http://127.0.0.1:','MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',"serviceWorkers:'block'","h.context.route('**/*'","h.context.routeWebSocket('**/*'",'assert.deepEqual(sink.attempts,[],','sanitizeEvidence(report)'])assert.ok(browser.includes(text),text);
 assert.doesNotMatch(browser,/\.connectToServer\(|recordHar|tracing\.start|storageState\(|innerText\(\)\.catch/);
 assert.match(browser,/raw-permissions-read'\)\.length,0/);
});
test('candidate verification rejects incomplete inventory, changed bytes and symlinks',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'exact68-negative-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.writeFileSync(path.join(root,'index.html'),'synthetic');assert.throws(()=>inputs.verifyCandidateDirectory(root),/pinned candidate paths/);
 fs.symlinkSync(path.join(root,'index.html'),path.join(root,'alias'));assert.throws(()=>inputs.pathsUnder(root),/symlink/);
});
test('build verifies clean exact commit/tree/lock before and after and never logs config',()=>{
 const build=read('build-candidate.mjs');
 for(const text of ["git(['rev-parse','HEAD'])","git(['rev-parse','HEAD^{tree}'])","git(['status','--porcelain=v1','--untracked-files=all'])",'manifest.candidateLockSha256','verifyCandidateDirectory'])assert.ok(build.includes(text));
 assert.equal(build.split('verifySource();').length-1,2);assert.doesNotMatch(build,/fetch\(|console\.log\(config/);
});
test('separate workflow is same-repository PR-only and cannot deploy or mutate production',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../../.github/workflows/latest68-crossrelease.yml'),'utf8');
 for(const text of ["github.event_name == 'pull_request'",'github.event.pull_request.number == 49','head.repo.full_name == github.repository','contents: read','actions: read','ref: '+require('../history-source-map.json')[m.candidateCommit].commit,'retention-days: 3','/artifacts/'+m.sourceArtifact+'/zip'])assert.ok(workflow.includes(text),text);
 assert.doesNotMatch(workflow,/secrets\.|(?:pages|contents|id-token): write|actions\/deploy|supabase\s+(?:db|functions)|pull_request_target|continue-on-error|--location-trusted|upload-pages-artifact|workflow_dispatch|\n  push:/);
 assert.deepEqual(workflow.split('          path: |\n')[1].trim().split('\n').map(x=>x.trim()),['${{ runner.temp }}/exact68-evidence/report.json','${{ runner.temp }}/exact68-evidence/*.png']);
});
