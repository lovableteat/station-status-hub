import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDepartmentExportReviews } from '../src/components/performance/departmentAssessmentExport.mjs';

test('department export bounds concurrent reads, preserves selection order and full review payload', async () => {
  let active = 0, peak = 0;
  const progress = [];
  const db = { rpc: async (_,args) => {
    peak = Math.max(peak,++active);
    await new Promise(resolve=>setTimeout(resolve,args.p_review_id==='a'?10:1));
    --active;
    return {data:{id:args.p_review_id,cycle_id:'cycle',self_feedback:'STAR 原文',manager_feedback:'主管回覆'},error:null};
  }};
  const rows = ['a','b','c'].map(review_id=>({review_id,locked:false}));
  const reviews = await loadDepartmentExportReviews(db,rows,'cycle',()=>true,(done,total)=>progress.push([done,total]));
  assert.equal(peak,2);
  assert.deepEqual(reviews.map(row=>row.id),['a','b','c']);
  assert.equal(reviews[0].selfFeedback,'STAR 原文');
  assert.deepEqual(progress.at(-1),[3,3]);
});

test('department export rejects inaccessible/mismatched data instead of creating a partial file', async () => {
  const row = {review_id:'a',locked:false};
  for (const result of [{data:null,error:{message:'locked'}},{data:{id:'other',cycle_id:'cycle'}},{data:{id:'a',cycle_id:'other'}}]) {
    await assert.rejects(loadDepartmentExportReviews({rpc:async()=>result},[row],'cycle',()=>true));
  }
  let reads=0;
  await assert.rejects(loadDepartmentExportReviews({rpc:async()=>{reads++;}},[{...row,locked:true}],'cycle',()=>true));
  assert.equal(reads,0);
  await assert.rejects(loadDepartmentExportReviews({rpc:async()=>{reads++;}},[row],'cycle',()=>false));
  assert.equal(reads,0);
});
