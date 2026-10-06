const test = require('node:test');
const assert = require('node:assert/strict');
const {React,create,loader,act,flush,deferred,child}=require('./support/renderHarness.cjs');
const person=(id,values={})=>({employee_id:id,employee_name:`同仁${id}`,username:`E${id}`,department:'研發部',section:'工程課',reviewer_name:'課長',locked:false,review_id:id,status:'draft',updated_at:'v1',score:null,...values});
test('department roster loads details only on demand, uses URL filters and hides content after lock',async t=>{
  const params=new URLSearchParams('workspace=performance');let reads=0;let delay=null;
  const db={rpc:async()=>{reads++;return delay?delay.promise:{data:{id:'1',cycle_id:'2026-q3',employee_name:'同仁1'},error:null};}};
  const load=loader({mocks:{'react-router-dom':{useSearchParams:()=>{const [,render]=React.useState(0);return [params,(callback)=>{const next=callback(params);for(const key of [...params.keys()])params.delete(key);next.forEach((v,k)=>params.set(k,v));render(n=>n+1);}];}},'./usePerformancePrivacy':{privacyDb:db},'./ReviewDetail':{ReviewDetail:child}}});
  const {DepartmentAssessments}=load('src/components/performance/DepartmentAssessments.tsx');
  const rows=[person('1'),person('2',{status:'submitted'}),person('3',{review_id:null,status:null}),person('4',{locked:true,review_id:null,status:null})];
  let root;const view=ready=>React.createElement(DepartmentAssessments,{rows,cycle:'2026-q3',ready,loading:false});
  t.after(()=>root?.unmount());
  await act(async()=>{root=create(view(true));});await flush();
  assert.equal(reads,0,'mount does not download any full assessment/attachment');
  assert.match(JSON.stringify(root.toJSON()),/草稿|待主管審核|尚未填寫|需解鎖/);
  const buttons=()=>root.root.findAll(node=>node.type===child&&typeof node.props.onClick==='function'&&JSON.stringify(node.props.children).includes('查看內容'));
  await act(async()=>buttons()[0].props.onClick());await flush();assert.equal(reads,1);
  assert.equal(root.root.find(node=>node.type===child&&!!node.props.review).props.review.employeeName,'同仁1');
  params.set('departmentAssessmentSearch','同仁2');await act(async()=>root.update(view(true)));await flush();
  assert.equal(root.root.findAll(node=>node.type===child&&!!node.props.review).length,0,'filter removes expanded detail');
  params.delete('departmentAssessmentSearch');await act(async()=>root.update(view(true)));await flush();
  delay=deferred();await act(async()=>buttons()[1].props.onClick());
  await act(async()=>root.update(view(false)));await flush();
  await act(async()=>delay.resolve({data:{id:'2',employee_name:'SHOULD NOT APPEAR'},error:null}));await flush();
  assert.doesNotMatch(JSON.stringify(root.toJSON()),/SHOULD NOT APPEAR|同仁1|同仁2/,'lock invalidates pending detail and visible roster');
  assert.equal(root.root.findAllByType('th').length,6,'locked empty table retains headings');
  assert.equal(params.get('workspace'),'performance');
});

test('read-only detail retains original STAR wording and supervisor overall reply/instructions', t => {
  const load=loader();
  const {ReviewDetail}=load('src/components/performance/ReviewDetail.tsx');
  const {normalizePerformanceReview}=load('src/components/performance/performanceData.mjs');
  const review=normalizePerformanceReview({id:'approved',cycle_id:'2026-q3',employee_name:'同仁',status:'approved',score:95,
    self_feedback:'RD2_SELF_V1\n'+JSON.stringify({grade:'29',sections:{IDP:{entries:[{id:'original',text:'面對測試耗時，我建立驗證工具，將測試時間由 30 分鐘縮短至 5 分鐘。'}],selfScore:95}}}),
    manager_feedback:'RD2_MANAGER_V1\n'+JSON.stringify({feedback:'主管已審核：改善成果具體。',workInstructions:'下期請擴大使用範圍。',categoryReviews:{IDP:{score:95}}})});
  const root=create(React.createElement(ReviewDetail,{review,showManagerAssessment:true}));t.after(()=>root.unmount());
  const content=JSON.stringify(root.toJSON());
  assert.match(content,/面對測試耗時，我建立驗證工具，將測試時間由 30 分鐘縮短至 5 分鐘。/);
  assert.match(content,/主管已審核：改善成果具體。/);assert.match(content,/下期請擴大使用範圍。/);
  assert.equal(root.root.findAllByType('textarea').length,0);
  assert.equal(root.root.findAllByType('input').length,0,'no employee or manager editing controls');
});
