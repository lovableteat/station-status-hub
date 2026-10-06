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
  const buttons=()=>root.root.findAll(node=>node.type===child&&typeof node.props.onClick==='function'&&node.props.children==='查看內容');
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

test('department export opens inline, selects only saved/unlocked people and downloads selected full content', async t => {
  const params = new URLSearchParams('workspace=performance');
  const reads = [], downloads = [];
  const db = { rpc: async (name,args) => {
    reads.push([name,args]);
    return {data:{id:args.p_review_id,cycle_id:'2026-q3',employee_name:`同仁${args.p_review_id}`,self_feedback:'原始 STAR',manager_feedback:'整體主管回覆'},error:null};
  }};
  const load = loader({mocks:{'react-router-dom':{useSearchParams:()=>[params,()=>{}]},'./usePerformancePrivacy':{privacyDb:db},'./ReviewDetail':{ReviewDetail:child},
    './performanceExport':{downloadPerformanceExcel:async(...args)=>downloads.push(args),downloadPerformanceHtml:(...args)=>downloads.push(args)}}});
  const {DepartmentAssessments} = load('src/components/performance/DepartmentAssessments.tsx');
  const rows = [person('1'),person('2'),person('3',{locked:true}),person('4',{review_id:null})];
  let root; t.after(()=>root?.unmount());
  const view = version => React.createElement(DepartmentAssessments,{rows,cycle:'2026-q3',ready:true,loading:false,exportRevealVersion:version});
  await act(async()=>{root=create(view(0));}); await flush();
  assert.equal(reads.length,0);
  await act(async()=>root.update(view(1))); await flush();
  assert.equal(root.root.findByProps({id:'department-export-tools'}).props.hidden,false,'page header opens inline export toolbar');
  const checkbox = name => root.root.findByProps({'aria-label':`匯出 同仁${name}`});
  assert.equal(checkbox('3').props.disabled,true); assert.equal(checkbox('4').props.disabled,true);
  await act(async()=>checkbox('2').props.onChange({target:{checked:false}}));
  const excel = root.root.find(node=>node.type===child&&Array.isArray(node.props.children)&&node.props.children.includes('匯出 Excel'));
  await act(async()=>excel.props.onClick()); await flush();
  assert.equal(reads.length,1); assert.equal(reads[0][0],'get_performance_department_assessment');
  assert.equal(reads[0][1].p_review_id,'1');
  assert.equal(downloads.length,1); assert.equal(downloads[0][0].length,1);
  assert.equal(downloads[0][0][0].selfFeedback,'原始 STAR'); assert.equal(downloads[0][0][0].managerFeedback,'整體主管回覆');
  assert.match(JSON.stringify(root.toJSON()),/已匯出 1 人的 Excel/);
});

test('locking during department export prevents download of a pending read', async t => {
  const pending = deferred(); let downloads=0;
  const load = loader({mocks:{'react-router-dom':{useSearchParams:()=>[new URLSearchParams(),()=>{}]},'./usePerformancePrivacy':{privacyDb:{rpc:()=>pending.promise}},'./ReviewDetail':{ReviewDetail:child},
    './performanceExport':{downloadPerformanceExcel:async()=>downloads++,downloadPerformanceHtml:()=>downloads++}}});
  const {DepartmentAssessments} = load('src/components/performance/DepartmentAssessments.tsx');
  let root; t.after(()=>root?.unmount());
  const view = ready => React.createElement(DepartmentAssessments,{rows:[person('1')],cycle:'2026-q3',ready,loading:false,exportRevealVersion:1});
  await act(async()=>{root=create(view(true));}); await flush();
  let exporting;
  await act(async()=>{const button=root.root.find(node=>node.type===child&&node.props.children==='匯出 HTML'); exporting=button.props.onClick();});
  await act(async()=>root.update(view(false))); await flush();
  await act(async()=>pending.resolve({data:{id:'1',cycle_id:'2026-q3',self_feedback:'敏感資料'},error:null})); await flush();
  assert.equal(downloads,0); assert.match(JSON.stringify(root.toJSON()),/匯出未完成/);
});
