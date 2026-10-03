import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { refreshAssessmentReviews, loadAssessmentReviewContents, withAssessmentReadDeadline, refreshSectionReportContents, clearAssessmentContentCache } from '../src/components/performance/assessmentRefresh.mjs';
import { submitAssessmentRecord } from '../src/components/performance/assessmentPersistence.mjs';
import { normalizePerformanceReview } from '../src/components/performance/performanceData.mjs';
const row = {id:'test-review',employee_id:'employee',employee_name:'員工',reviewer_name:'chief',
  updated_at:'2026-10-01T00:00:00.123456Z',status:'submitted',self_feedback:'實績'+ 'x'.repeat(4_000_000)};
function mockDb(manifest, contents = []) {
  const calls = [];
  return {calls, from: table => ({select: columns => ({
    order: async () => { calls.push({table,columns}); return {data:manifest}; },
    eq: (column,id) => ({single: async () => { calls.push({table,columns,id}); return {data:contents.find(row => row.id === id)}; }}),
  })})};
}
test('unchanged background refresh downloads no attachment content and reuses row objects', async () => {
  const cached = normalizePerformanceReview(row);
  const db = mockDb([row]);
  const refreshed = await refreshAssessmentReviews(db,[cached]);
  assert.equal(refreshed[0],cached);
  assert.equal(db.calls.length,1);
  assert.ok(!db.calls[0].columns.includes('feedback'));
});
test('changed review stays lightweight and drops revoked rows; only opening it downloads content', async () => {
  const other = {...row,id:'unchanged'};
  const changed = {...row,updated_at:'2026-10-01T01:00:00Z'};
  const db = mockDb([changed,other],[changed]);
  const refreshed = await refreshAssessmentReviews(db,[normalizePerformanceReview(row),normalizePerformanceReview(other),normalizePerformanceReview({...row,id:'revoked'})]);
  assert.equal(db.calls.length,1);
  assert.equal(refreshed[0].contentLoaded,false);
  assert.equal(refreshed[1].contentLoaded,true);
  assert.deepEqual(refreshed.map(row => row.id),[row.id,other.id]);
  assert.equal(refreshed[0].updatedAt,changed.updated_at);
  const complete = await loadAssessmentReviewContents(db,refreshed);
  assert.deepEqual(db.calls[1],{table:'performance_reviews',columns:'*',id:row.id});
  assert.equal(complete[0].selfFeedback,changed.self_feedback);
  assert.equal(complete[1],refreshed[1]);
});
test('same-version rename refreshes metadata without fetching old feedback', async () => {
  const db = mockDb([{...row,employee_name:'新名稱'}]);
  const refreshed = await refreshAssessmentReviews(db,[normalizePerformanceReview(row)]);
  assert.equal(refreshed[0].employeeName,'新名稱');
  assert.equal(refreshed[0].contentLoaded,false);
  assert.equal(db.calls.length,1);
});
test('first load uses only the index, preserving employee number, grade and self scores', async () => {
  const self = 'RD2_SELF_V1\n'+JSON.stringify({employeeNumber:'LA5',grade:'23',sections:{IDP:{selfScore:95},OKR:{selfScore:90},KPI:{selfScore:85}}});
  const db = mockDb([{...row,review_index:{selfFeedback:self,managerFeedback:'RD2_MANAGER_V1\n{"employeeNumber":"LA5"}'}}]);
  const [summary] = await refreshAssessmentReviews(db);
  assert.equal(summary.selfFeedback,self);
  assert.equal(summary.contentLoaded,false);
  assert.ok(summary.selfFeedback.length<500);
  assert.ok(!db.calls[0].columns.includes('self_feedback'));
  assert.ok(!db.calls[0].columns.includes('manager_feedback'));
});
test('export hydration retains complete feedback and fails if RLS revokes an employee', async () => {
  const db = mockDb([row],[row]);
  const summaries = await refreshAssessmentReviews(db);
  const [complete] = await loadAssessmentReviewContents(db,summaries);
  assert.equal(complete.selfFeedback,row.self_feedback);
  assert.equal(complete.contentLoaded,true);
  await assert.rejects(()=>loadAssessmentReviewContents(mockDb([row]),summaries),/無法讀取/);
  let current = true;
  const revoked = {from:()=>({select:()=>({eq:()=>({single:async()=>{current=false;return {data:row};}})})})};
  await assert.rejects(()=>loadAssessmentReviewContents(revoked,summaries,()=>current),/存取狀態/);
});
test('page remount reuses content only after a fresh authorized version in the same account', async () => {
  const db = mockDb([row],[row]);
  const summaries = await refreshAssessmentReviews(db,[],()=>true,undefined,'employee');
  const [complete] = await loadAssessmentReviewContents(db,summaries,()=>true,undefined,'employee');
  const [reused] = await refreshAssessmentReviews(db,[],()=>true,undefined,'employee');
  assert.equal(reused,complete);
  assert.equal(db.calls.filter(call=>call.columns==='*').length,1);
  const [differentAccount] = await refreshAssessmentReviews(db,[],()=>true,undefined,'other');
  assert.equal(differentAccount.contentLoaded,false);
  clearAssessmentContentCache(db);
  const [invalidated] = await refreshAssessmentReviews(db,[],()=>true,undefined,'employee');
  assert.equal(invalidated.contentLoaded,false);
  await loadAssessmentReviewContents(db,[invalidated],()=>true,undefined,'employee');
  db.from = mockDb([{...row,updated_at:'v2'}]).from;
  const [changed] = await refreshAssessmentReviews(db,[],()=>true,undefined,'employee');
  assert.equal(changed.contentLoaded,false);
  db.from = mockDb([]).from;
  assert.deepEqual(await refreshAssessmentReviews(db,[],()=>true,undefined,'employee'),[]);
});
test('hung reads stop waiting and abort; successful reads clear their deadline', async () => {
  let aborted = 0;
  await assert.rejects(()=>withAssessmentReadDeadline(new Promise(()=>{}),20,()=>aborted++),/逾時/);
  assert.equal(aborted,1);
  assert.equal(await withAssessmentReadDeadline(Promise.resolve('ready'),20,()=>aborted++),'ready');
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(aborted,1);
});
test('section-report manifest only selects persisted columns and omits attachments', async () => {
  const cached = [{id:'allowed',updated_at:'v1',director_attachments:['large']},{id:'revoked',updated_at:'v1'}];
  let rpcCalls=0;
  const db = {from:()=>({select:columns=>{assert.equal(columns,'id,updated_at');return {eq:async()=>({data:[{id:'allowed',updated_at:'v1'}]})};}}),rpc:async()=>{rpcCalls++;return {data:cached};}};
  const result = await refreshSectionReportContents(db,'2026-q3',cached);
  assert.deepEqual(result,[cached[0]]);
  assert.equal(result[0],cached[0]);
  assert.equal(rpcCalls,0);
  await refreshSectionReportContents(db,'2026-q3',[]);
  assert.equal(rpcCalls,1);
});
test('superseded refresh stops before downloading obsolete attachments', async () => {
  const db = mockDb([row]);
  assert.deepEqual(await refreshAssessmentReviews(db,[],() => false),[]);
  assert.equal(db.calls.length,1);
});
test('compact receipt verifies committed content without downloading files again', async () => {
  const review = normalizePerformanceReview(row);
  const db = {rpc: async (name,args) => ({data:{receipt_kind:'compact-v1',request_id:args.p_request_id,
    content_hash:createHash('sha256').update(args.p_review.self_feedback).digest('hex'),
    review:{...row,self_feedback:undefined,updated_at:'2026-10-01T01:00:00Z'}}})};
  const saved = await submitAssessmentRecord(db,review,{mode:'self',action:'submit',expectedUpdatedAt:row.updated_at});
  assert.equal(saved.selfFeedback,review.selfFeedback);
  assert.equal(saved.updatedAt,'2026-10-01T01:00:00Z');
});
test('compact receipt cannot acknowledge different content or a missing committed version', async () => {
  const db = {rpc: async (name,args) => ({data:{receipt_kind:'compact-v1',request_id:args.p_request_id,
    content_hash:'wrong',review:{id:row.id,status:'submitted'}}})};
  await assert.rejects(() => submitAssessmentRecord(db,normalizePerformanceReview(row),{mode:'self',action:'submit'}),/內容尚未確認/);
});
