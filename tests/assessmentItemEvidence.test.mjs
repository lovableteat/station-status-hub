import test from 'node:test';
import assert from 'node:assert/strict';
import { readSelfAssessment, serializeSelfAssessment, readManagerAssessment, serializeManagerAssessment, createAssessmentForm, buildAssessmentReview } from '../src/components/performance/rd2Assessment.mjs';
import { getAssessmentEntries, withAssessmentEntries } from '../src/components/performance/assessmentEntries.mjs';
const file={id:'file-1',name:'proof.pdf',mimeType:'application/pdf',size:3,dataUrl:'data:application/pdf;base64,YWJj'};
test('attachments stay with stable entry IDs after edits, deletion and cloud serialization',()=>{
 const self=readSelfAssessment();
 self.sections.KPI=withAssessmentEntries(self.sections.KPI,[{id:'first',text:'First',attachments:[file]},{id:'second',text:'Second',attachments:[]}]);
 let saved=readSelfAssessment(serializeSelfAssessment(self));
 assert.deepEqual(getAssessmentEntries(saved.sections.KPI)[0].attachments,[file]);
 saved.sections.KPI=withAssessmentEntries(saved.sections.KPI,getAssessmentEntries(saved.sections.KPI).filter(e=>e.id!=='first'));
 saved=readSelfAssessment(serializeSelfAssessment(saved));
 assert.equal(saved.sections.KPI.entries[0].id,'second');assert.deepEqual(saved.sections.KPI.entries[0].attachments,[]);
});
test('entry feedback is isolated by category and ID; returns include only text, never category scores',()=>{
 const form=createAssessmentForm();form.manager.categoryReviews.KPI={score:93,feedback:'private category note',entryFeedback:{first:'Add test evidence',removed:'Must not return'}};
 form.self.sections.KPI=withAssessmentEntries(form.self.sections.KPI,[{id:'first',text:'Validation',attachments:[file]}]);
 const manager=readManagerAssessment(serializeManagerAssessment(form.manager));assert.equal(manager.categoryReviews.KPI.entryFeedback.first,'Add test evidence');
 const review=buildAssessmentReview({form,mode:'manager',action:'return',cycleId:'cycle',id:'review',now:'2026-09-10'});
 const returned=readManagerAssessment(review.managerFeedback).feedback;
 assert.match(returned,/KPI 實績 1/);assert.match(returned,/Add test evidence/);assert.doesNotMatch(returned,/93|private category note|Must not return/);
});
test('unsafe per-entry attachments cannot persist as executable URLs',()=>{
 const self=readSelfAssessment();self.sections.IDP.entries=[{id:'x',text:'x',attachments:[{...file,dataUrl:'javascript:alert(1)'}]}];
 assert.deepEqual(readSelfAssessment(serializeSelfAssessment(self)).sections.IDP.entries[0].attachments,[]);
});
