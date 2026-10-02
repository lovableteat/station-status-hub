// Exercise the actual editor with a restored draft, refreshed history and save receipt.
// All records are fixtures; no production database or account is used.
// node tests/performanceManagerReturnHistory.integration.cjs tmp/performance-hook-test/package
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const {act, create} = require(path.resolve(process.argv[2]));
const {createAssessmentForm} = require('../src/components/performance/rd2Assessment.mjs');
const history = n => Array.from({length:n}, (_,i) => ({id:`return-${i+1}`,returnedAt:`2026-10-02T0${i}:00:00Z`,reviewerName:'測試主管',overallFeedback:`整體回覆 ${i+1}`,workInstructions:`工作指示 ${i+1}`,entries:[{category:'IDP',entryId:'a',text:`退回前實績 ${i+1}`,feedback:`已送出的原因 ${i+1}`,attachments:[]}]}));
const base = createAssessmentForm(null, {userId:'fixture-employee',displayName:'測試同仁'});
base.recordId = 'fixture-review'; base.sourceUpdatedAt = 'v1';
base.self.sections.IDP.entries = [{id:'a',text:'測試實績'}];
base.manager.returnHistory = history(1);
const staleDraft = structuredClone(base);
staleDraft.manager.returnHistory = [];
staleDraft.manager.entryReviews.IDP.a = {feedback:'尚未送出的評語',returnRequested:false,attachments:[]};
let saved, rejectSave = false, saves = 0;
const container = ({children}) => React.createElement('div',null,children);
const ui = new Proxy({}, {get:(_,name) => name==='__esModule' ? true : name==='Textarea' ? props=>React.createElement('textarea',props) : name==='Input' ? props=>React.createElement('input',props) : name==='Button' ? props=>React.createElement('button',props,props.children) : container});
const modules = new Map();
function load(file) {
  file = path.resolve(file);
  if(modules.has(file)) return modules.get(file).exports;
  const m = {exports:{}}; modules.set(file,m);
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const localRequire = spec => {
    if(spec.startsWith('@/')) return ui;
    if(spec==='./assessmentDrafts.mjs') return {readAssessmentDraft:()=>staleDraft,keepAssessmentDraft:()=>{},cancelAssessmentDraftWrite:()=>{},forgetAssessmentDraft:()=>{}};
    if(spec==='./AssessmentEntryFeedback') return load(path.join(path.dirname(file),spec+'.tsx'));
    if(spec==='./AssessmentEntryList') return {AssessmentEntryList:({section,renderFeedback})=>React.createElement('div',null,(section.entries||[]).map((entry,index)=>React.createElement(React.Fragment,{key:entry.id},renderFeedback?.(entry,index))))};
    if(spec==='./AssessmentAttachments') return {AssessmentAttachments:container};
    if(spec==='./EvidenceLink') return {EvidenceLink:container};
    if(spec.startsWith('./')) return require(path.join(path.dirname(file),spec));
    return require(spec);
  };
  vm.runInNewContext('(function(require,module,exports){'+code+'\n})', {console,Error,window:{addEventListener(){},removeEventListener(){},setTimeout,clearTimeout},document:{getElementById:()=>null},setTimeout,clearTimeout})(localRequire,m,m.exports);
  return m.exports;
}
const {AssessmentEditor} = load('src/components/performance/AssessmentEditor.tsx');
const props = {initial:base,mode:'manager',draftKey:'fixture-manager',employees:[],canSubmit:true,onSave:async()=>{saves++;if(rejectSave)throw Error('測試儲存失敗');return saved;}};
let rendered;
const text = () => JSON.stringify(rendered.toJSON());
const feedback = () => rendered.root.findByProps({id:'feedback-IDP-a'});
const returnAction = () => rendered.root.findAllByType('button').find(node=>node.props.className==='rd2-return-action');
(async()=>{
  await act(async()=>{rendered=create(React.createElement(AssessmentEditor,props));});
  assert.ok(text().includes('已送出的退回紀錄'));
  assert.ok(text().includes('已送出的原因 1'),'a restored manager draft cannot hide saved history');
  assert.equal(feedback().props.value,'尚未送出的評語','draft text remains editable');
  assert.ok(text().includes('退回紀錄 · 1 次'),'each editable achievement also has a history entry');
  await act(async()=>feedback().props.onChange({target:{value:'正在輸入的新評語'}}));
  const refreshed = {...base,sourceUpdatedAt:'v2',manager:{...base.manager,returnHistory:history(2)}};
  await act(async()=>rendered.update(React.createElement(AssessmentEditor,{...props,initial:refreshed})));
  assert.ok(text().includes('已送出的原因 2'),'a cloud refresh updates history even while the manager is editing');
  assert.equal(feedback().props.value,'正在輸入的新評語','a history refresh must not erase unsent edits');
  const selection = rendered.root.findByProps({'aria-label':'勾選退回 IDP 實績 1'});
  await act(async()=>selection.props.onChange({target:{checked:true}}));
  const overall = rendered.root.findAllByType('textarea').find(node=>node.props.id==='rd2-feedback');
  assert.ok(overall,'overall response field exists');
  await act(async()=>overall.props.onChange({target:{value:'本次整體回覆'}}));
  saved = {...refreshed,sourceUpdatedAt:'v3',manager:{...refreshed.manager,returnHistory:history(3)}};
  await act(async()=>returnAction().props.onClick());
  assert.ok(text().includes('已送出的原因 3'),'the successful return receipt is immediately visible without reopening');
  assert.ok(text().includes('退回紀錄 · 3 次'));
  rejectSave = true;
  await act(async()=>feedback().props.onChange({target:{value:'再次退回的原因'}}));
  await act(async()=>rendered.root.findByProps({'aria-label':'勾選退回 IDP 實績 1'}).props.onChange({target:{checked:true}}));
  await act(async()=>rendered.root.findByProps({id:'rd2-feedback'}).props.onChange({target:{value:'第二次提交的整體回覆'}}));
  await act(async()=>returnAction().props.onClick());
  assert.equal(saves,2,'exercise a real rejected save, not an earlier validation failure');
  assert.ok(text().includes('測試儲存失敗'));
  assert.ok(!text().includes('第 4 次退回'),'a failed submission must not invent a saved event');
  await act(async()=>rendered.unmount());
  console.log('PASS manager restored draft, live history refresh, retained edits, per-entry history, confirmed receipt and failed save');
})().catch(error=>{console.error(error);process.exitCode=1;});
