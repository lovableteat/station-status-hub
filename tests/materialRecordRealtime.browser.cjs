// Start materialWorkspace.browser.cjs first; this uses isolated QA records only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve(process.env.AUDIT_QA_DIR||'../qa-tools','package.json'))('playwright');
const origin=process.env.MATERIAL_QA_URL||'http://127.0.0.1:8096';
const evidence=path.resolve(process.env.MATERIAL_REALTIME_EVIDENCE_DIR||'../material-realtime-evidence');
const row=(page,id)=>page.locator(`[data-testid="material-mobile-list-row"][data-record-id="${id}"]`);
const waitRow=(page,id,text)=>page.waitForFunction(([id,text])=>document.querySelector(`[data-testid="material-mobile-list-row"][data-record-id="${id}"]`)?.textContent.includes(text),[id,text]);
const patch=(page,id,fields,missing=false)=>page.evaluate(([id,fields,missing])=>window.__qaLiveRecords.patch(id,fields,missing),[id,fields,missing]);
const editor=page=>page.locator('.material-record-dialog');
async function closeEditor(page){await editor(page).getByTestId('material-record-save-footer').getByRole('button',{name:'取消',exact:true}).click();await editor(page).waitFor({state:'hidden'});}
(async()=>{const browser=await chromium.launch({channel:'chrome'});let context;try{
 fs.mkdirSync(evidence,{recursive:true});context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(origin).origin?route.continue():route.abort());
 const desktop=await context.newPage(),phone=await context.newPage(),errors=[];await desktop.setViewportSize({width:1440,height:960});
 for(const page of [desktop,phone]){page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));}
 await Promise.all([desktop,phone].map(page=>page.goto(origin+'/?qaLiveRecords')));
 console.log('Loaded isolated pages'); await row(phone,'qa-5').waitFor();await desktop.getByRole('button',{name:'編輯料件 QA-MPN-5',exact:true}).click();
 await editor(desktop).waitFor();await editor(desktop).locator('#material-internal-pn').fill('LIVE-PN-500');
 await editor(desktop).getByRole('tab',{name:/狀態追蹤/}).click();await editor(desktop).getByRole('radio',{name:'已發信',exact:true}).check();
 const firstLoadCount=await phone.evaluate(()=>window.__qaLiveRecords.loads);
 await desktop.evaluate(() => {
   window.__qaBomRecordSaveGate = new Promise(resolve => { window.__qaReleaseBomRecordSave = resolve; });
 });
 await editor(desktop).getByRole('button',{name:'儲存資料與追蹤',exact:true}).click();
 const saving = editor(desktop).getByRole('button',{name:'儲存中…',exact:true});
 await saving.waitFor();
 assert.equal(await saving.getAttribute('aria-busy'),'true');
 assert.equal(await saving.isDisabled(),true);
 assert.equal(await desktop.getByText('料件已更新',{exact:true}).count(),0);
 await desktop.screenshot({path:path.join(evidence,'record-saving-desktop.png')});
 await desktop.evaluate(() => window.__qaReleaseBomRecordSave());
 await editor(desktop).waitFor({state:'hidden'});
 await desktop.getByText('料件已更新',{exact:true}).waitFor();
 await desktop.screenshot({path:path.join(evidence,'record-success-desktop.png')});
 console.log('Saved PN and status'); await waitRow(phone,'qa-5','LIVE-PN-500');await waitRow(phone,'qa-5','已發信');
 assert.equal(await phone.getByRole('button',{name:'載入最新資料',exact:true}).count(),0);
 assert.equal(await phone.evaluate(()=>window.__qaLiveRecords.loads),firstLoadCount,'ordinary row edits must not reload the complete BOM');
 console.log('Verified row sync'); await desktop.evaluate(()=>window.__qaLiveRecords.touch());await phone.waitForFunction(()=>window.__qaLiveRecords.touches>0);
 assert.equal(await phone.evaluate(()=>window.__qaLiveRecords.loads),firstLoadCount,'a workspace revision touch must not reload the complete BOM');

 await phone.getByRole('button',{name:'排序與工具',exact:true}).tap();await phone.getByTestId('material-mobile-tools').getByRole('button',{name:/待處理料/}).tap();
 const pending=phone.getByTestId('pending-materials-dialog');await pending.waitFor();
 await patch(desktop,'qa-5',{requestOwnerId:'qa-live-owner',requestOwnerName:'CE 即時負責人'});
 await phone.waitForFunction(()=>document.querySelector('[data-pending-record-id="qa-5"]')?.textContent.includes('CE 即時負責人'));
 await pending.locator('[data-ui="dialog-close"]').tap();await pending.waitFor({state:'hidden'});

 console.log('Verified owner and timestamp touch'); const search=phone.locator('[data-testid="material-mobile-command-center"] [aria-label="快速搜尋料號"]');await search.fill('QA');
 await row(phone,'qa-5').getByTestId('material-mobile-row-tracking').tap();await editor(phone).getByRole('tab',{name:'料件資料',exact:true}).click();
 const draft=editor(phone).locator('#material-spec');await draft.fill('手機端尚未儲存的草稿');await draft.focus();
 await patch(desktop,'qa-3',{partNumber:'OTHER-ROW-LIVE'});await waitRow(phone,'qa-3','OTHER-ROW-LIVE');
 assert.equal(await draft.inputValue(),'手機端尚未儲存的草稿');assert.equal(await draft.evaluate(element=>document.activeElement===element),true);
 assert.equal(await search.inputValue(),'QA');
 await phone.bringToFront();
 const beforeMiss=await phone.evaluate(()=>({loads:window.__qaLiveRecords.loads,catchups:window.__qaLiveRecords.catchups})),missedAt=Date.now();
 await desktop.evaluate(()=>window.__qaLiveRecords.silentPatch('qa-3',{partNumber:'MISSED-PUSH-LIVE'}));
 await phone.waitForFunction(()=>document.querySelector('[data-testid="material-mobile-list-row"][data-record-id="qa-3"]')?.textContent.includes('MISSED-PUSH-LIVE'),null,{timeout:5000});
 const missedPushRecoveryMs=Date.now()-missedAt;
 assert.ok(missedPushRecoveryMs<=5000,`missed push recovered in ${missedPushRecoveryMs}ms`);
 assert.ok(await phone.evaluate(count=>window.__qaLiveRecords.catchups>count,beforeMiss.catchups),'missing push must recover through catchup');
 assert.equal(await phone.evaluate(()=>window.__qaLiveRecords.loads),beforeMiss.loads,'missing push must not reload the full BOM');
 assert.equal(await draft.inputValue(),'手機端尚未儲存的草稿');assert.equal(await search.inputValue(),'QA');
 console.log(`Recovered missing push in ${missedPushRecoveryMs}ms without full reload`);
 await patch(desktop,'qa-5',{partNumber:'REMOTE-WINS'});await waitRow(phone,'qa-5','REMOTE-WINS');
 await editor(phone).getByTestId('material-record-save-footer').getByRole('button',{name:/儲存/}).tap();
 await editor(phone).getByRole('alert').filter({hasText:'QA record revision conflict'}).waitFor();
 assert.equal(await draft.inputValue(),'手機端尚未儲存的草稿');assert.equal(await phone.evaluate(()=>window.__qaLiveRecords.record('qa-5').partNumber),'REMOTE-WINS');
 console.log('Verified conflict'); await closeEditor(phone);await waitRow(phone,'qa-5','REMOTE-WINS');

 await row(phone,'qa-5').getByTestId('material-mobile-row-tracking').tap();await editor(phone).getByRole('tab',{name:'料件資料',exact:true}).click();
 await draft.fill('背景重讀也必須保留草稿');const beforeFallback=await phone.evaluate(()=>window.__qaLiveRecords.loads);
 await patch(desktop,'qa-3',{partNumber:'FALLBACK-LIVE'},true);
 await phone.waitForFunction(count=>window.__qaLiveRecords.loads>count,beforeFallback);await waitRow(phone,'qa-3','FALLBACK-LIVE');
 assert.equal(await draft.inputValue(),'背景重讀也必須保留草稿');assert.equal(await search.inputValue(),'QA');
 await closeEditor(phone);assert.equal(await phone.getByRole('button',{name:'載入最新資料',exact:true}).count(),0);
 await phone.screenshot({path:path.join(evidence,'record-live-phone.png')});await desktop.screenshot({path:path.join(evidence,'record-live-desktop.png')});assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(evidence,'record-live-results.json'),JSON.stringify({missedPushRecoveryMs,checks:['PN/status/owner live updates','missed push catchup without full BOM reload','draft and filter retained','stale form rejected','missing payload background refresh'],errors},null,2));
 console.log('Record realtime: PN/status/owner sync, no full reload for ordinary edits, draft/focus/filter preserved, stale form rejected and missing payload refreshed in background');
}finally{if(context)await context.close();await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
