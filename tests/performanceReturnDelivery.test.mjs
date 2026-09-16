import assert from "node:assert/strict";
import test from "node:test";
import { submitAssessmentRecord } from "../src/components/performance/assessmentPersistence.mjs";
const review={id:"performance-text-id",cycleId:"2026-q3",employeeId:"employee",employeeName:"員工",selfFeedback:"已補充",managerFeedback:"主管私密評分",score:88,goals:[]};
const options={mode:"self",action:"submit",expectedUpdatedAt:"2026-09-16T00:00:00.123456Z"};
test("employee submission omits all supervisor fields and keeps the loaded version precision",async()=>{
  const db={rpc:async(name,args)=>{
    assert.equal(name,"submit_performance_assessment");
    assert.equal(args.p_review.id,review.id);
    assert.equal(args.p_expected_updated_at,options.expectedUpdatedAt);
    assert.equal("manager_feedback" in args.p_review,false);
    assert.equal("score" in args.p_review,false);
    return {data:{review:{...args.p_review,status:"submitted"}}};
  }};
  assert.equal((await submitAssessmentRecord(db,review,options)).status,"submitted");
});
test("lost response automatically retries the same request without duplicate writes",async()=>{
  const ids=[];
  const db={rpc:async(name,args)=>{
    ids.push(args.p_request_id);
    if(ids.length===1) throw new Error("connection lost after commit");
    return {data:{review:{...args.p_review,status:"submitted"}}};
  }};
  await submitAssessmentRecord(db,review,options);
  assert.equal(ids.length,2); assert.equal(ids[0],ids[1]);
});
test("return cannot report success without the transaction's notification receipt",async()=>{
  const db={rpc:async()=>({data:{review:{id:review.id,status:"in-progress"},notification_id:null}})};
  await assert.rejects(()=>submitAssessmentRecord(db,review,{...options,mode:"manager",action:"return"}),/結果尚未確認/);
});
test("confirmed return requires both returned state and notification",async()=>{
  const db={rpc:async()=>({data:{review:{id:review.id,status:"in-progress"},notification_id:"notice"}})};
  assert.equal((await submitAssessmentRecord(db,review,{...options,mode:"manager",action:"return"})).status,"in-progress");
});

test("a notification receipt without a returned review cannot report success",async()=>{
  const db={rpc:async()=>({data:{review:{id:review.id,status:"submitted"},notification_id:"notice"}})};
  await assert.rejects(()=>submitAssessmentRecord(db,review,{...options,mode:"manager",action:"return"}),/結果尚未確認/);
});
test("concurrent update remains a real conflict and never silently overwrites",async()=>{
  let calls=0;
  const db={rpc:async()=>{calls++;return {error:{code:"40001",message:"考核已由另一個視窗更新"}};}};
  await assert.rejects(()=>submitAssessmentRecord(db,review,options),/另一個視窗/); assert.equal(calls,1);
});
