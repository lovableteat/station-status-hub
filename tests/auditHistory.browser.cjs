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
 const bundle=await require('esbuild').build({
  entryPoints:['tests/support/historyProviderFixture.jsx'],bundle:true,write:false,
  jsx:'automatic',format:'iife',platform:'browser',define:{'import.meta.env.DEV':'false'},
  plugins:[{name:'isolated-auth',setup(build){
   // Render the actual provider; the optional previous source proves the regression.
   build.onLoad({filter:/TestProjectProvider\.tsx$/},args=>({
    contents:fs.readFileSync(process.env.AUDIT_PROVIDER_BEFORE||args.path,'utf8'),loader:'tsx',
   }));
   build.onResolve({filter:/^@\/(components\/auth\/UserContext|hooks\/use-toast)$/},
    args=>({path:args.path,namespace:'audit-auth'}));
   build.onLoad({filter:/.*/,namespace:'audit-auth'},args=>({
    contents:args.path.endsWith('UserContext')?'export const useUser=()=>({user:{userId:"audit"}})'
     :'const toast=()=>{}; export const useToast=()=>({toast})',loader:'js',
   }));
   build.onResolve({filter:/^@\/integrations\/supabase\/client$/},
    ()=>({path:path.resolve('tests/support/historyProviderMock.js')}));
   build.onResolve({filter:/^@\//},args=>build.resolve(path.resolve('src',args.path.slice(2)),
    {resolveDir:process.cwd(),kind:args.kind}));
  }}],
 });
 const server=http.createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}res.setHeader('Content-Type','text/html');res.end('<title>Isolated history regression</title><div id="root"></div>'+ (req.url.startsWith('/provider')?'<script src="/fixture.js"></script>':''));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
 try{
  const context=await browser.newContext();const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/?workspace=home`);
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
  const integrated=await page.context().newPage();integrated.on('pageerror',error=>console.error('fixture pageerror:',error.message));await integrated.goto(`http://127.0.0.1:${server.address().port}/provider?workspace=home&project=A`);await integrated.waitForFunction(()=>window.auditProject?.activeProjectId==='A');
  await integrated.evaluate(()=>{auditHistory.pushWorkspaceHistory('?workspace=pcb&project=A');auditHistory.pushWorkspaceHistory('?workspace=station&project=A');history.back();});await integrated.waitForURL('**/*workspace=pcb*');
  await integrated.evaluate(()=>auditProject.setActiveProjectId('B'));await integrated.waitForFunction(()=>auditProject.activeProjectId==='B');await integrated.evaluate(()=>auditProject.refreshProjects());
  assert.equal(await integrated.evaluate(()=>history.state.workspaceHistoryIndex),1,'actual provider selection and background refresh retain the PCB cursor');assert.equal(await integrated.evaluate(()=>history.state.routerMarker),'preserved');
  await integrated.evaluate(()=>{guardCount=0;allowLeave=false;history.back();});await integrated.waitForFunction(()=>guardCount===1);await integrated.waitForURL('**/*workspace=pcb*');await integrated.waitForTimeout(100);assert.equal(await integrated.evaluate(()=>guardCount),1,'cancellation restores without a PCB/Station prompt loop');assert.match(await integrated.evaluate(()=>auditRouterLocation),/workspace=pcb/);
  await integrated.evaluate(()=>{allowLeave=true;history.back();});await integrated.waitForURL('**/*workspace=home*');await integrated.evaluate(()=>history.forward());await integrated.waitForURL('**/*workspace=pcb*');await integrated.evaluate(()=>history.forward());await integrated.waitForURL('**/*workspace=station*');assert.equal(await integrated.evaluate(()=>history.state.workspaceHistoryIndex),2);
  console.log(JSON.stringify({browser:'real Chromium history, actual TestProjectProvider/BrowserRouter and opener-created tabs',cancelRestoresCursor:true,backConfirmRetainsStation:true,forwardRetainsBothEntries:true,routerStatePreserved:true,separateTabRecovery:true,refreshRecoveryIdentity:true,providerSelectionAndRefresh:true,forwardEntryCancellationNoLoop:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
