// Opt-in live verification: only a unique temporary QA BOM is written, then removed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const {createClient}=require('@supabase/supabase-js');
const {chromium}=createRequire(path.resolve(process.env.AUDIT_QA_DIR||'../qa-tools','package.json'))('playwright');
const evidence=path.resolve(process.env.MATERIAL_REALTIME_EVIDENCE_DIR||'../material-live-realtime-evidence');
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).map(line=>line.match(/^([^#=]+)=(.*)$/)).filter(Boolean).map(([,key,value])=>[key.trim(),value.trim().replace(/^['"]|['"]$/g,'')]));
const editor=page=>page.locator('.material-record-dialog');
const seed=JSON.parse(fs.readFileSync('tests/fixtures/materialWorkbook.synthetic.json','utf8'));

async function switchBom(page,name){
  await page.getByTestId('material-table-card').waitFor({timeout:120000});
  const select=page.getByRole('combobox',{name:'切換 BOM',exact:true});
  await select.click();await page.getByRole('option').filter({hasText:name}).click();
  await page.waitForFunction(name=>document.querySelector('[aria-label="切換 BOM"]')?.textContent.includes(name),name);
}
async function openRecord(page,mobile,recordId,mpn){
  if(mobile)await page.locator(`[data-testid="material-mobile-list-row"][data-record-id="${recordId}"]`).getByTestId('material-mobile-row-tracking').tap();
  else await page.getByRole('button',{name:'編輯料件 '+mpn,exact:true}).click();
  await editor(page).waitFor();await editor(page).getByRole('tab',{name:'料件資料',exact:true}).click();
}
async function save(page,partNumber,status){
  await editor(page).locator('#material-internal-pn').fill(partNumber);
  await editor(page).getByRole('tab',{name:/狀態追蹤/}).click();
  await editor(page).getByRole('radio',{name:status,exact:true}).check();
  const sent=Date.now();await editor(page).getByTestId('material-record-save-footer').getByRole('button',{name:/儲存/}).click();
  await editor(page).waitFor({state:'hidden'});return sent;
}
async function waitValue(page,mobile,recordId,value){
  await page.waitForFunction(([mobile,id,value])=>{
    const node=mobile?document.querySelector(`[data-testid="material-mobile-list-row"][data-record-id="${id}"]`):document.querySelector('table.material-table-crosshair tbody');
    return node?.textContent.includes(value);
  },[mobile,recordId,value],{timeout:20000});
}

(async()=>{
  assert.equal(process.env.MATERIAL_LIVE_VERIFY,'1','Set MATERIAL_LIVE_VERIFY=1 to authorize this isolated live QA BOM');
  assert.equal(new URL(env.VITE_SUPABASE_URL).hostname,'rfppeuzuoxtqkpbwehbq.supabase.co','Unexpected live project');
  const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_ANON_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY,{db:{schema:'workspace'},auth:{persistSession:false,autoRefreshToken:false}});
  const id='__codex_sync_probe__:'+crypto.randomUUID(),name='系統同步驗證（自動清理） '+id.slice(-8),recordId='sync-probe-row',mpn='SYNC-PROBE-MPN';
  const record={...seed.records[0],id:recordId,sourceGroupKey:recordId,sourceRow:1,isGroupStart:true,name:'臨時同步驗證料件',qty:1,refDes:'R-SYNC',refGroup:'R-SYNC',manufacturer:'QA isolated test',manufacturerPartNumber:mpn,manufacturerPartNumberAlt:'',virtualAlternative:'QA-VIRTUAL',partNumber:'QA-REAL-START',trackingStatus:'未處理',trackingHistory:[],trackingNote:'',note:'',partSpec:'Temporary verification',requestOwnerId:'',requestOwnerName:'',requestTicket:'',requestUrl:''};
  const report={workspaceId:id,temporary:true,backendProject:'rfppeuzuoxtqkpbwehbq',authMode:'existing DEV demo-admin; two independent browser contexts',checks:[],errors:[],cleanup:null};
  let server,browser,created=false;const contexts=[];
  fs.mkdirSync(evidence,{recursive:true});
  try{
    created=true;
    const workspace=await client.from('material_bom_workspaces').insert({id,name,source_file:'isolated-realtime-verification.xlsx',sheet_name:'QA',generated_at:new Date().toISOString(),record_count:1});
    if(workspace.error)throw workspace.error;
    const row=await client.from('material_bom_records').insert({workspace_id:id,record_id:recordId,order_index:0,data:record});if(row.error)throw row.error;console.log('Created isolated temporary QA BOM');
    const {createServer}=await import('vite');server=await createServer({configFile:path.resolve('vite.config.ts'),server:{host:'127.0.0.1',port:0}});await server.listen();
    const origin='http://127.0.0.1:'+server.httpServer.address().port,base=origin+'/station-status-hub/';
    browser=await chromium.launch({channel:'chrome'});
    const desktopContext=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'}),phoneContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});contexts.push(desktopContext,phoneContext);
    const desktop=await desktopContext.newPage(),phone=await phoneContext.newPage(),navigations={desktop:0,phone:0};let receivedQaFrames=0;
    phone.on('websocket',socket=>socket.on('framereceived',frame=>{try{const raw=JSON.parse(String(frame.payload)),value=Array.isArray(raw)?{event:raw[3],payload:raw[4]}:raw;if(value.event==='postgres_changes'&&value.payload?.data?.record?.workspace_id===id)receivedQaFrames++;}catch{}}));
    for(const [label,page] of [['desktop',desktop],['phone',phone]]){page.setDefaultTimeout(20000);page.on('pageerror',error=>report.errors.push(error.message));page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations[label]++});}
    await Promise.all([desktop,phone].map(page=>page.goto(base+'?demo=admin&workspace=material-requests',{waitUntil:'domcontentloaded',timeout:60000})));
    for(const page of [desktop,phone]){await switchBom(page,name);await page.waitForFunction(()=>document.querySelector('[data-testid="material-table-card"]')?.getAttribute('data-realtime-connected')==='true');}
    await waitValue(desktop,false,recordId,'QA-REAL-START');await waitValue(phone,true,recordId,'QA-REAL-START');const initialNavigations={...navigations};console.log('Both independent pages joined live Realtime and selected QA BOM');
    await openRecord(desktop,false,recordId,mpn);let sent=await save(desktop,'QA-LIVE-A1','已發信');await waitValue(phone,true,recordId,'QA-LIVE-A1');await waitValue(phone,true,recordId,'已發信');
    assert.ok(receivedQaFrames>0,'The receiving page must receive a real Postgres WebSocket frame');report.checks.push({action:'desktop save -> mobile auto-update',elapsedMs:Date.now()-sent,receivedQaFrames});console.log('Verified desktop to mobile');
    await openRecord(phone,true,recordId,mpn);sent=await save(phone,'QA-LIVE-B2','已完成');await waitValue(desktop,false,recordId,'QA-LIVE-B2');
    report.checks.push({action:'mobile save -> desktop auto-update',elapsedMs:Date.now()-sent});console.log('Verified mobile to desktop');
    await openRecord(phone,true,recordId,mpn);const draft=editor(phone).locator('#material-spec');await draft.fill('手機端未儲存草稿：必須保留');
    await phone.evaluate(async base=>{const {supabase}=await import(base+'src/integrations/supabase/client.ts');supabase.realtime.disconnect();supabase.realtime.connect=()=>{};},base);
    await phone.waitForFunction(async base=>{const {supabase}=await import(base+'src/integrations/supabase/client.ts');return ['closing','closed'].includes(supabase.realtime.connectionState());},base);
    const socketState=await phone.evaluate(async base=>(await import(base+'src/integrations/supabase/client.ts')).supabase.realtime.connectionState(),base);
    assert.ok(['closing','closed'].includes(socketState),'The receiving socket must not be open for fallback verification');
    await phone.waitForFunction(()=>document.querySelector('[data-testid="material-table-card"]')?.getAttribute('data-realtime-connected')==='false');
    const framesBeforeFallback=receivedQaFrames;
    await openRecord(desktop,false,recordId,mpn);sent=await save(desktop,'QA-LIVE-C3','料號申請中');await waitValue(phone,true,recordId,'QA-LIVE-C3');
    assert.equal(await draft.inputValue(),'手機端未儲存草稿：必須保留');
    assert.equal(receivedQaFrames,framesBeforeFallback,'No real QA WebSocket event may arrive during fallback');report.checks.push({action:'receiver WebSocket disabled -> HTTP delta catchup, draft retained',elapsedMs:Date.now()-sent,socketState,receivedQaFrames:receivedQaFrames-framesBeforeFallback});console.log('Verified recovery with actual receiving WebSocket disconnected');
    await editor(phone).getByTestId('material-record-save-footer').getByRole('button',{name:/儲存/}).tap();
    await editor(phone).getByRole('alert').filter({hasText:/已由其他使用者更新|版本衝突/}).waitFor();assert.equal(await draft.inputValue(),'手機端未儲存草稿：必須保留');
    const latest=await client.from('material_bom_records').select('data').eq('workspace_id',id).eq('record_id',recordId).single();if(latest.error)throw latest.error;assert.equal(latest.data.data.partNumber,'QA-LIVE-C3');
    report.checks.push({action:'stale mobile form rejected, latest live data and local draft preserved'});
    await editor(phone).getByTestId('material-record-save-footer').getByRole('button',{name:'取消',exact:true}).tap();await editor(phone).waitFor({state:'hidden'});
    assert.deepEqual(navigations,initialNavigations,'Neither receiving page may reload or navigate during synchronization');report.navigations=navigations;
    await desktop.screenshot({path:path.join(evidence,'live-desktop.png')});await phone.screenshot({path:path.join(evidence,'live-mobile.png')});assert.deepEqual(report.errors,[]);report.result='passed';
  }catch(error){report.result='failed';report.failure=error.message;throw error;}
  finally{
    for(const context of contexts)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});if(server)await server.close().catch(()=>{});
    if(created){
      const removed=await client.from('material_bom_workspaces').delete().eq('id',id);if(removed.error)report.cleanup={ok:false,error:removed.error.message};
      else{const check=await client.from('material_bom_workspaces').select('id',{count:'exact',head:true}).eq('id',id);report.cleanup={ok:!check.error&&check.count===0,remaining:check.count,error:check.error?.message??null};}
    }
    client.realtime.disconnect();fs.writeFileSync(path.join(evidence,'live-two-pages.json'),JSON.stringify(report,null,2));
    if(created&&!report.cleanup?.ok){console.error('Temporary QA BOM cleanup needs attention: '+id);process.exitCode=1;}
  }
  console.log(JSON.stringify(report));
})().catch(error=>{console.error(error.message);process.exitCode=1});
