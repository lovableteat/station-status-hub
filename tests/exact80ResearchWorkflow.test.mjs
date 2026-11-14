import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
const read=n=>readFileSync(new URL('../'+n,import.meta.url),'utf8');
const full=read('.github/workflows/audit-regression.yml'),workflow=full.slice(full.indexOf('  exact80:\n')).split(/\n  [a-zA-Z0-9_-]+:\n/)[0];
const browser=read('tests/exact80/exact80-crossrelease.browser.cjs'),manifestText=read('tests/exact80/exact80-manifest.json'),m=JSON.parse(manifestText);
test('exact80 is a separate same-repository PR-only research job with no deployment authority',()=>{
 assert.ok(full.indexOf('  exact80:\n')>full.indexOf('  exact96:\n'));
 for(const text of ["github.event_name == 'pull_request'",'github.event.pull_request.number == 49',"github.event.pull_request.head.ref == 'fix/legacy-pcb-protected-reads-20261112'",'head.repo.full_name == github.repository','contents: read\n      actions: read'])assert.ok(workflow.includes(text));
 assert.doesNotMatch(workflow,/secrets\.|(?:pages|contents|id-token): write|actions\/deploy|supabase\s+(?:db|functions)|pull_request_target:|workflow_dispatch:|continue-on-error:/);
 assert.doesNotMatch(workflow.split('    steps:\n')[0],/runner\./);
 for(const variable of ['EXACT80_DIST','EXACT80_EVIDENCE_DIR','AUDIT_QA_DIR'])assert.match(workflow,new RegExp('echo "'+variable+'=\\$RUNNER_TEMP/'));
});
test('actual80 and frozen f6 identities, artifact and complete build inventory stay pinned',()=>{
 assert.equal(createHash('sha256').update(manifestText).digest('hex'),'642a6688f66a814253f2c0ad3f3693ea763b1b8ce3fcf2eea47f902116975821');
 assert.equal(m.sourceCommit,'80f2c4c071c3c88a85d247b7c3d48b303ccdd57c');assert.equal(m.candidateCommit,'f6fadefcf503d9326af88757a2d2d42a8dd45ad1');
 assert.equal(Object.keys(m.candidateFiles).length,334);assert.equal(Object.keys(m.oldAllowedBoot).length,53);assert.equal(m.postCutoverExtra.length,3);
 assert.ok(workflow.includes(`actions/artifacts/${m.sourceArtifact}/zip`));assert.ok(workflow.includes('ref: '+JSON.parse(read('tests/history-source-map.json'))[m.candidateCommit].commit));assert.ok(workflow.includes('cmp package-lock.json .exact80-candidate/package-lock.json'));
 assert.ok(workflow.includes('working-directory: .exact80-candidate'));assert.ok(workflow.includes('EXACT80_CANDIDATE_DIST: ${{ github.workspace }}/.exact80-candidate/dist'));
 const build=read('tests/exact80/build-exact-candidate.mjs');assert.ok(build.includes('manifest.derivation.bootRoots.ENTRY'));assert.ok(build.includes('digest!==manifest.candidateFiles[filename]'));
});
test('old code cannot be uploaded as evidence, renamed under another path, or retained as a general closure',()=>{
 const paths=workflow.split('          path: |\n')[1].trim().split('\n').map(x=>x.trim());assert.deepEqual(paths,['${{ runner.temp }}/exact80-evidence/report.json','${{ runner.temp }}/exact80-evidence/*.png']);
 assert.doesNotMatch(workflow,/--location-trusted|upload-pages-artifact/);assert.match(workflow,/retention-days: 3/);
 assert.equal(m.additionalRevokedExecutables.length,18);for(const entry of m.additionalRevokedExecutables)assert.ok(!Object.values(m.candidateFiles).includes(entry.sha256));
 assert.ok(m.warmDashboard.notACompleteRetainedClosure&&m.warmDashboard.notColdStartSupport&&m.warmDashboard.notSecurityRepairForResidentCode);
 assert.deepEqual(readdirSync(new URL('./exact80/',import.meta.url)).sort(),['build-exact-candidate.mjs','exact80-crossrelease.browser.cjs','exact80-fixtures.cjs','exact80-fixtures.test.cjs','exact80-manifest.json','exact80-paths.cjs','exact80-server.cjs','exact80-server.test.cjs','extract-exact80.py']);
});
test('real browser remains CI-only with synthetic HTTP/Realtime and a non-forwarding DNS/proxy backstop',()=>{
 const build=browser.indexOf("process.env.EXACT80_BUILD_ONLY==='1'"),ci=browser.indexOf("assert.equal(process.env.GITHUB_ACTIONS,'true'"),pr=browser.indexOf("assert.equal(process.env.GITHUB_EVENT_NAME,'pull_request'"),launch=browser.indexOf("qa('playwright').chromium.launch");assert.ok(build>=0&&build<ci&&ci<pr&&pr<launch);
 for(const part of ['--proxy-server=http://127.0.0.1:','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',"serviceWorkers:'block'","h.context.route('**/*'","h.context.routeWebSocket('**/*'",'fixture.realtimeResponse(value)',"reply.kind==='forbidden'"])assert.ok(browser.includes(part));
 assert.doesNotMatch(browser,/\.connectToServer\s*\(|force:\s*true/);assert.ok(browser.includes("u.origin===h.origin&&req.method()==='GET'"));
});
test('candidate cold boot and denials cannot fall back to raw permissions or claim draft safety',()=>{
 assert.ok(browser.includes('scenario.candidateBoot?CANDIDATE_CORE:CORE'));assert.ok(browser.includes("h.calls.filter(c=>c.kind==='raw-permissions-read').length,0"));
 assert.ok(browser.includes('protectedDenialUnmountedEditor:true'));assert.ok(browser.includes('unsentDraftSurvived:JSON.stringify(before)===JSON.stringify(after)'));
 assert.ok(browser.includes('passing this observation is NOT proof'));assert.ok(browser.includes('while backend grants are unchanged'));
 assert.ok(browser.includes('manifest.warmDashboard.requiredAlreadyResidentJs'));assert.ok(browser.includes('Resident probe must not cause a module network load'));
});
test('all evidence fields are redacted and only synthetic drafts are observed',()=>{
 assert.ok(browser.includes('JSON.stringify(sanitizeEvidence(report),null,2)'));assert.ok(browser.includes('console.error(redactEvidence(error?.stack||error))'));
 assert.doesNotMatch(browser,/recordHar|tracing\.start|storageState\(|headers:.*req\.headers\(\).*h\.calls/);
 assert.ok(browser.includes("assert.deepEqual(initial.previews,[{name:'synthetic-unsent.png',bytes:syntheticPng.length,sha256:sha(syntheticPng)}])"));
 assert.ok(browser.includes('await(await refreshed).finished()'));assert.ok(browser.includes("crypto.subtle.digest('SHA-256',bytes)"));
});
