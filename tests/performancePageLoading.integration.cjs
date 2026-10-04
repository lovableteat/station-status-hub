// Run with react-test-renderer 18.3.1 in an isolated package directory.
// node tests/performancePageLoading.integration.cjs tmp/performance-hook-test/package
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const React=require('react');
const {act,create}=require(path.resolve(process.argv[2]));
let user={userId:'employee',username:'employee',displayName:'員工',role:'engineer'};
let contextRole='member',params=new URLSearchParams('performanceTab=self');
let calls=[],fullResolve,rosterResolve,manifestResolve; const rosterResolvers=[];
let hangRoster=false,hangManifest=false;
const listeners=new Map();
const win={addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener:(name,fn)=>listeners.get(name)?.delete(fn),setInterval:()=>1,clearInterval:()=>{}};
const doc={visibilityState:'visible',addEventListener:win.addEventListener,removeEventListener:win.removeEventListener};
const self='RD2_SELF_V1\n'+JSON.stringify({employeeNumber:'LA5',grade:'23',sections:{IDP:{selfScore:95,entries:[{id:'e1',text:'完整實績'}]},OKR:{selfScore:90},KPI:{selfScore:85}}});
const row={id:'review',cycle_id:'2026-q3',employee_id:'employee',employee_name:'員工',reviewer_name:'主管',status:'draft',updated_at:'v1',self_feedback:self,review_index:{selfFeedback:'RD2_SELF_V1\n'+JSON.stringify({employeeNumber:'LA5',grade:'23',sections:{IDP:{selfScore:95},OKR:{selfScore:90},KPI:{selfScore:85}}})}};
const builder=(run)=>({then:(ok,err)=>Promise.resolve().then(run).then(ok,err),order(){return this;},range(){return this;},abortSignal(){return this;}});
const db={from:()=>({select:columns=>({order:()=>builder(()=>{calls.push(columns);return hangManifest?new Promise(resolve=>manifestResolve=resolve):{data:[row]};}),eq:()=>({single:()=>builder(()=>{calls.push('*');return new Promise(resolve=>fullResolve=resolve);})})})}),rpc:name=>builder(()=>{
 calls.push(name);
 if(name==='get_performance_self_context')return {data:[{employee_id:user.userId,display_name:user.displayName,username:user.username,performance_role:contextRole==='member'?'employee':'manager',org_level:contextRole,assigned:true}]};
 if(name==='get_performance_group_locks'){assert.notEqual(contextRole,'member','employees must not wait on manager-only privacy RPC');return {data:[]};}
 if(name==='get_performance_organization')return hangRoster?new Promise(resolve=>{rosterResolve=resolve;rosterResolvers.push(resolve);}):{data:[]};
 throw Error(name);
})};
const child=({children})=>React.createElement('div',null,children);
const children=new Proxy({}, {get:(target,name)=>name==='__esModule'?true:name==='StatTile'?({title,value})=>React.createElement('div',null,title,String(value)):name==='AssessmentEditor'?({initial})=>React.createElement('editor',{initial},'EDITOR READY'):child});
const cache=new Map();
function load(file){
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
 const m={exports:{}};cache.set(file,m);
 const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 const localRequire=spec=>{
  if(spec==='@/components/auth/UserContext')return {useUser:()=>({user,sessionMode:'cloud'})};
  if(spec==='@/hooks/usePermissions')return {usePermissions:()=>({canEditModule:()=>true,isPerformanceManager:true})};
  if(spec==='@/hooks/use-toast')return {useToast:()=>({toast:()=>{}})};
  if(spec==='@/integrations/supabase/client')return {supabase:db};
  if(spec==='react-router-dom')return {useSearchParams:()=>[params,()=>{}]};
  if(spec.startsWith('@/lib/'))return require(path.resolve('src/lib',spec.slice(6)));
  if(spec.startsWith('@/')||spec==='lucide-react'||spec.endsWith('.css'))return children;
  if(spec==='./usePerformancePrivacy')return load(path.join(path.dirname(file),spec+'.ts'));
  if(spec.startsWith('./')&&spec.endsWith('.mjs'))return require(path.join(path.dirname(file),spec));
  if(spec.startsWith('./'))return children;
  return require(spec);
 };
 vm.runInNewContext('(function(require,module,exports){'+source+'\n})',{console,window:win,document:doc,localStorage:{removeItem:()=>{}},setTimeout,clearTimeout,URLSearchParams,AbortController})(localRequire,m,m.exports);
 return m.exports;
}
const {PerformanceAppraisalPage}=load('src/components/performance/PerformanceAppraisalPage.tsx');
const flush=async()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
let rendered;
(async()=>{
 await act(async()=>{rendered=create(React.createElement(PerformanceAppraisalPage));});
 await flush();
 assert.equal(calls.filter(x=>x==='get_performance_group_locks').length,0);
 assert.ok(fullResolve,'only the own review should request content');
 const readsBefore=calls.length;
 user={...user};await act(async()=>rendered.update(React.createElement(PerformanceAppraisalPage)));
 await flush();assert.equal(calls.length,readsBefore,'referential profile updates must not cancel or repeat reads');
 await act(async()=>fullResolve({data:row}));await flush();
 assert.equal(rendered.root.findAllByType('editor').length,1,'employee exits loading after the content arrives');
 assert.equal(rendered.root.findByType('editor').props.initial.self.sections.IDP.entries[0].text,'完整實績');
 for(const fn of listeners.get('focus')||[])fn();await flush();
 assert.equal(calls.filter(x=>x==='*').length,1,'unchanged background refresh does not reload attachment content');
 assert.equal(rendered.root.findAllByType('editor').length,1,'background refresh leaves editor visible');
 await act(async()=>rendered.unmount());
 await act(async()=>{rendered=create(React.createElement(PerformanceAppraisalPage));});await flush();
 assert.equal(calls.filter(x=>x==='*').length,1,'page remount revalidates index and reuses unchanged contents');
 assert.equal(rendered.root.findAllByType('editor').length,1);
 await act(async()=>rendered.unmount());
 console.log('PASS employee flag mismatch, profile update during read, complete content, background refresh and page remount');
 for(const level of ['section_chief','director']){
  calls=[];row.status='submitted';contextRole=level;user={userId:'chief',username:'chief',displayName:'主管',role:'engineer'};params=new URLSearchParams('performanceTab=manager');hangRoster=true;
  await act(async()=>{rendered=create(React.createElement(PerformanceAppraisalPage));});await flush();await flush();
  assert.ok(JSON.stringify(rendered.toJSON()).includes('員工'),'manager list renders while roster is pending');
  assert.equal(calls.filter(x=>x==='*').length,0,'manager list never loads every employee attachment');
  assert.ok(calls.includes('get_performance_group_locks'));
  const count=calls.length;
  user={...user};await act(async()=>rendered.update(React.createElement(PerformanceAppraisalPage)));await flush();
  assert.equal(calls.length,count);
  await act(async()=>rosterResolvers.splice(0).forEach(resolve=>resolve({data:[]}))); await flush();
  await act(async()=>rendered.unmount());
  console.log('PASS '+level+' list independent of slow roster and stable profile');
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
