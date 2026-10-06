const test = require('node:test');
const assert = require('node:assert/strict');
const { React, create, loader, act, flush, child } = require('./support/renderHarness.cjs');
test('completed scores preserve stored total and zero, reject missing/invalid scores, retain empty table', t => {
  const {DepartmentResults,resultGrade,validResultScore}=loader()('src/components/performance/DepartmentResults.tsx');
  assert.equal(resultGrade(0),'D'); assert.equal(resultGrade(90),'A+'); assert.equal(resultGrade(80),'A');
  assert.equal(resultGrade(70),'B'); assert.equal(resultGrade(60),'C'); assert.equal(resultGrade(59),'D');
  for (const value of [null,undefined,'',true,{},-1,101,'bad']) {assert.equal(validResultScore(value),null);assert.equal(resultGrade(value),'—');}
  const root=create(React.createElement(DepartmentResults,{groups:[{chief_id:'a',chief_name:'課長甲',section:'工程課',locked_results:2,results:[{review_id:'a',employee_name:'同仁甲',employee_number:'E004',job_grade:'29',total_score:95,category_scores:{IDP:90,OKR:80,KPI:70}},{review_id:'b',employee_name:'同仁乙',total_score:0,category_scores:{IDP:null,OKR:null,KPI:null}}]}]}));
  t.after(()=>root.unmount());
  assert.equal(root.root.findAllByProps({className:'rd2-result-total'})[0].children.join(''),'95');
  assert.equal(root.root.findAllByProps({className:'rd2-result-grade'})[1].children.join(''),'D');
  assert.match(JSON.stringify(root.toJSON()),/需在資料保護區解鎖/);
  root.update(React.createElement(DepartmentResults,{groups:[]}));
  assert.equal(root.root.findAllByType('th').length,7,'empty result keeps all column headings');
  assert.match(JSON.stringify(root.toJSON()),/目前沒有符合條件的已完成評核成績/);
});

test('completed score table opens the matching audited STAR record', t => {
  const {DepartmentResults}=loader()('src/components/performance/DepartmentResults.tsx');
  const opened=[];
  const root=create(React.createElement(DepartmentResults,{groups:[{chief_id:'chief',chief_name:'課長',section:'工程課',locked_results:0,results:[{review_id:'review-approved',employee_name:'已評核同仁',total_score:95,category_scores:{IDP:90,OKR:95,KPI:95}}]}],onViewReview:id=>opened.push(id)}));
  t.after(()=>root.unmount());
  const button=root.root.find(node=>node.type===child&&node.props.children==='查看實績／STAR');
  button.props.onClick();
  assert.deepEqual(opened,['review-approved']);
  assert.equal(root.root.findAllByType('th').length,9,'eight headings and the employee row heading');
});
test('overview loads scores without a prose report, shares URL filters and clears scores on lock', async t => {
  const params=new URLSearchParams(); const reads=[];
  const progress=[{chief_id:'a',chief_name:'課長甲',department:'研發部',section:'產品課',report_status:'not_submitted',total_members:1,completed_members:1,awaiting_members:0},{chief_id:'b',chief_name:'課長乙',department:'研發部',section:'工程課',report_status:'submitted',total_members:1,completed_members:1,awaiting_members:0}];
  const groups=progress.map((group,index)=>({...group,locked_results:0,results:[{review_id:String(index),employee_name:`同仁${index}`,total_score:90,category_scores:{IDP:90,OKR:90,KPI:90}}]}));
  const db={rpc:async name=>{reads.push(name);return {error:null,data:name==='get_performance_department_assessments'?[]:name==='get_performance_department_results'?groups:name==='get_performance_department_progress'?progress:[{employee_id:'director',org_level:'director'}]};}};
  const load=loader({mocks:{
    'react-router-dom':{useSearchParams:()=>[params,()=>{}]},
    './usePerformancePrivacy':{privacyDb:db},
    './AssessmentAttachments':{AssessmentAttachments:child},
    './assessmentRefresh.mjs':{refreshSectionReportContents:async()=>[],withAssessmentReadDeadline:p=>p},
    '@/integrations/supabase/client':{supabase:db}
  }});
  const {PerformanceSectionReports}=load('src/components/performance/PerformanceSectionReports.tsx');let root;
  t.after(()=>root?.unmount());
  const view=ready=>React.createElement(PerformanceSectionReports,{userId:'director',cycle:'2026-q3',ready,onEvaluate(){}});
  await act(async()=>{root=create(view(true));});await flush();
  assert.ok(reads.includes('get_performance_department_results'));
  assert.equal(root.root.findAllByProps({className:'rd2-result-total'}).length,2,'results do not require a prose report');
  params.set('sectionReportSearch','產品');await act(async()=>root.update(view(true)));
  assert.equal(root.root.findAllByProps({className:'rd2-result-total'}).length,1);
  params.set('sectionReportStatus','submitted');await act(async()=>root.update(view(true)));
  assert.equal(root.root.findAllByProps({className:'rd2-result-total'}).length,0,'same status and search scope score table');
  params.delete('sectionReportStatus');params.delete('sectionReportSearch');
  await act(async()=>root.update(view(false)));await flush();
  assert.equal(root.root.findAllByProps({className:'rd2-result-total'}).length,0,'locking removes previously rendered results');
});
