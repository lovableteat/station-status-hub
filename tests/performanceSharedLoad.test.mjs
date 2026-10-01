import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { refreshAssessmentReviews } from '../src/components/performance/assessmentRefresh.mjs';
import { submitAssessmentRecord } from '../src/components/performance/assessmentPersistence.mjs';
import { normalizePerformanceReview } from '../src/components/performance/performanceData.mjs';

const row = {id:'test-review',employee_id:'employee',employee_name:'員工',reviewer_name:'chief',
  updated_at:'2026-10-01T00:00:00.123456Z',status:'submitted',self_feedback:'實績'+ 'x'.repeat(4_000_000)};
function mockDb(manifest, contents = []) {
  const calls = [];
  return {calls, from: table => ({select: columns => ({
    order: async () => { calls.push({table,columns}); return {data:manifest}; },
    in: async (column, ids) => { calls.push({table,columns,ids}); return {data:contents.filter(row => ids.includes(row.id))}; },
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
test('changed review downloads only that employee and drops revoked rows', async () => {
  const other = {...row,id:'unchanged'};
  const changed = {...row,updated_at:'2026-10-01T01:00:00Z'};
  const db = mockDb([changed,other],[changed]);
  const refreshed = await refreshAssessmentReviews(db,[normalizePerformanceReview(row),normalizePerformanceReview(other),normalizePerformanceReview({...row,id:'revoked'})]);
  assert.deepEqual(db.calls[1].ids,[row.id]);
  assert.deepEqual(refreshed.map(row => row.id),[row.id,other.id]);
  assert.equal(refreshed[0].updatedAt,changed.updated_at);
});
test('same-version rename is refreshed and a row revoked during the read is excluded', async () => {
  const db = mockDb([{...row,employee_name:'新名稱'}]);
  assert.deepEqual(await refreshAssessmentReviews(db,[normalizePerformanceReview(row)]),[]);
  assert.equal(db.calls.length,2);
});
test('superseded refresh stops before downloading a batch of obsolete attachments', async () => {
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
