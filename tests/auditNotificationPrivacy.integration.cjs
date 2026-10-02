const test=require('node:test');
const assert=require('node:assert/strict');
test('privacy assertion ignores generated UUID/time digits while detecting actual exposed ratings and feedback',async()=>{
 const {notificationContainsRating}=await import('./support/notificationPrivacy.mjs');
 const safe={id:'00000000-0000-4000-8000-000000000088',created_at:'2026-10-02T14:41:09.988Z',title:'已退回',message:'請補充',metadata:{review_id:'performance-audit'}};
 assert.equal(/score|manager_feedback|88/.test(JSON.stringify(safe)),true,'previous assertion demonstrably rejects a private-safe row');
 assert.equal(notificationContainsRating(safe,88),false);
 for(const leaking of [{...safe,score:88},{...safe,message:'您的評分為88'},{...safe,metadata:{score:88}},{...safe,metadata:{manager_feedback:'private'}}])assert.equal(notificationContainsRating(leaking,88),true,'the privacy boundary still catches leaks');
});
