const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {createRequire}=require('node:module');
const qa=createRequire(path.resolve(process.env.AUDIT_QA_DIR||'../qa-tools','package.json'));
const {chromium}=qa('playwright');
const ts=require('typescript');
(async()=>{
 const code=ts.transpileModule(fs.readFileSync('src/lib/workspaceHistory.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const server=http.createServer((_,res)=>{res.setHeader('Content-Type','text/html');res.end('<title>Isolated history regression</title>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
 try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/?workspace=home`);
  await page.evaluate(code=>{window.exports={};(0,eval)(code);window.history.replaceState({routerMarker:'preserved'},'');window.accept=false;window.acceptedUrls=[];exports.watchWorkspaceHistory(()=>acceptedUrls.push(location.search));window.addEventListener('workspace-before-navigate',e=>{if(!accept)e.preventDefault();});exports.pushWorkspaceHistory('?workspace=station');exports.pushWorkspaceHistory('?workspace=pcb');},code);
  await page.evaluate(()=>history.back());await page.waitForTimeout(150);assert.match(page.url(),/workspace=pcb$/);assert.equal(await page.evaluate(()=>history.state.routerMarker),'preserved');assert.equal(await page.evaluate(()=>acceptedUrls.length),0);
  await page.evaluate(()=>{accept=true;history.back();});await page.waitForURL('**/?workspace=station');
  await page.evaluate(()=>history.back());await page.waitForURL('**/?workspace=home');
  await page.evaluate(()=>history.forward());await page.waitForURL('**/?workspace=station');
  await page.evaluate(()=>history.forward());await page.waitForURL('**/?workspace=pcb');
  assert.deepEqual(await page.evaluate(()=>acceptedUrls),['?workspace=station','?workspace=home','?workspace=station','?workspace=pcb']);
  const recoveryCode=ts.transpileModule(fs.readFileSync('src/components/pcb-designer/core/recoveryClient.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const identity=tab=>tab.evaluate(code=>{window.exports={};(0,eval)(code);return exports.pcbRecoveryClient();},recoveryCode);
  const first=await identity(page);const opened=page.context().waitForEvent('page');await page.evaluate(()=>window.open('/?workspace=pcb','_blank'));const second=await opened;await second.waitForLoadState();assert.notEqual(await identity(second),first,'opener-cloned sessionStorage cannot share recovery identity');
  await page.reload();assert.equal(await identity(page),first,'refresh retains this tab recovery');
  console.log(JSON.stringify({browser:'real Chromium history and opener-created tabs',cancelRestoresCursor:true,backConfirmRetainsStation:true,forwardRetainsBothEntries:true,routerStatePreserved:true,separateTabRecovery:true,refreshRecoveryIdentity:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
