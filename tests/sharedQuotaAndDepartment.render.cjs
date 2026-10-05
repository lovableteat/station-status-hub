const test = require('node:test');
const assert = require('node:assert/strict');
const { React, create, act, loader, browser, deferred, flush } = require('./support/renderHarness.cjs');
const content = root => JSON.stringify(root.toJSON());
const summary = (key,model,minute=3,day=8) => ({ generated_at:'2026-10-05T06:00:00Z', tracking_started_at:'2026-10-01T00:00:00Z', targets:[{api_key_id:key,provider:'gemini',model,minute_attempts:minute,pacific_day_attempts:day}] });

test('every AI user sees shared usage; failed refresh cannot claim zero available',async(t)=>{
  const win=browser(); let fail=false; const reads=[];
  const load=loader({window:win,globals:{AbortSignal},mocks:{'@/integrations/supabase/client':{supabase:{rpc(name,args){ reads.push([name,args]);return {abortSignal(){return Promise.resolve(fail?{error:{message:'offline'}}:{data:summary('key','gemini-3.5-flash-lite'),error:null});}};}}}}});
  const { AiQuotaStatus }=load('src/components/api-management/AiQuotaStatus.tsx');
  let root;
  t.after(()=>{if(root)root.unmount();});
  await act(async()=>{root=create(React.createElement(AiQuotaStatus,{apiKeyId:'key',provider:'gemini',model:'gemini-3.5-flash-lite'}));});
  await flush();
  assert.match(content(root),/全員共用 API 額度/);
  assert.match(content(root),/"3"/);assert.match(content(root),/"8"/);
  assert.match(content(root),/不是官方剩餘額/);
  assert.deepEqual(JSON.parse(JSON.stringify(reads[0])),['get_ai_model_usage_summary',{p_api_key_ids:['key']}]);
  fail=true;
  await act(async()=>{win.dispatchEvent(new Event('ai-usage-recorded'));});await flush();
  assert.match(content(root),/暫時無法更新/);
  assert.doesNotMatch(content(root),/估算可用範圍/);
  await act(async()=>{root.unmount();});
});

test('switching API/model rejects late previous-key response',async(t)=>{
  const old=deferred(); const win=browser();
  const load=loader({window:win,globals:{AbortSignal},mocks:{'@/integrations/supabase/client':{supabase:{rpc(name,args){return {abortSignal(){return args.p_api_key_ids[0]==='old'?old.promise:Promise.resolve({data:summary('new','gemini-3.8-flash',1,2),error:null});}};}}}}});
  const {AiQuotaStatus}=load('src/components/api-management/AiQuotaStatus.tsx');let root;
  t.after(()=>{if(root)root.unmount();});
  await act(async()=>{root=create(React.createElement(AiQuotaStatus,{apiKeyId:'old',provider:'gemini',model:'gemini-3.5-flash-lite'}));});
  await act(async()=>{root.update(React.createElement(AiQuotaStatus,{apiKeyId:'new',provider:'gemini',model:'gemini-3.8-flash'}));});await flush();
  await act(async()=>{old.resolve({data:summary('old','gemini-3.5-flash-lite',999,999),error:null});});await flush();
  assert.doesNotMatch(content(root),/999/);
  assert.match(content(root),/20 次/);
  await act(async()=>{root.unmount();});
});

test('department progress remains visible without reports and filters use the same status/search',async()=>{
  const {DepartmentProgress,filterDepartmentProgress}=loader()('src/components/performance/DepartmentProgress.tsx');
  const rows=[{chief_id:'a',chief_name:'課長甲',department:'研發部',section:'產品課',total_members:4,completed_members:4,awaiting_members:0,returned_members:0,drafting_members:0,not_started_members:0,report_status:'not_submitted'},{chief_id:'b',chief_name:'課長乙',department:'研發部',section:'工程課',total_members:3,completed_members:1,awaiting_members:2,returned_members:0,drafting_members:0,not_started_members:0,report_status:'submitted'}];
  const root=create(React.createElement(DepartmentProgress,{rows}));
  assert.match(content(root),/課長甲/);assert.match(content(root),/尚未送交彙整/);assert.match(content(root),/已完成評核/);
  assert.deepEqual(filterDepartmentProgress(rows,'產品','not_submitted').map(r=>r.chief_id),['a']);
  assert.deepEqual(filterDepartmentProgress(rows,'產品','submitted'),[]);
  root.unmount();
});
