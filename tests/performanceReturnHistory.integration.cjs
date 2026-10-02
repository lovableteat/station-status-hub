// Render the actual history components with immutable fixtures; no database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { readManagerAssessment, serializeManagerAssessment } = require('../src/components/performance/rd2Assessment.mjs');
const moduleForTest = { exports: {} };
const source = ts.transpileModule(fs.readFileSync('src/components/performance/AssessmentEntryFeedback.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const localRequire = spec => {
  if (spec === '@/components/ui/button') return { Button: ({children,...props}) => React.createElement('button',props,children) };
  if (spec === '@/components/ui/textarea') return { Textarea: props => React.createElement('textarea',props) };
  if (spec === './AssessmentAttachments') return { AssessmentAttachments: ({attachments}) => React.createElement('div',null,attachments.map(item => item.name).join(',')) };
  return require(spec);
};
vm.runInNewContext('(function(require,module,exports){' + source + '\n})', { console })(localRequire,moduleForTest,moduleForTest.exports);
const { AssessmentReturnHistory, AssessmentEntryFeedback } = moduleForTest.exports;
const attachment = {id:'file',name:'歷史佐證.eml',size:4,mimeType:'message/rfc822',dataUrl:'data:message/rfc822;base64,dGVzdA=='};
const manager = readManagerAssessment(serializeManagerAssessment({ feedback:'目前整體回覆',returnHistory:[
  {id:'first',returnedAt:'2026-09-30T01:00:00Z',reviewerName:'主管甲',overallFeedback:'第一次整體回覆',workInstructions:'第一次工作指示',entries:[{category:'IDP',entryId:'a',text:'修改前實績',feedback:'第一次退回原因',attachments:[attachment]}]},
  {id:'second',returnedAt:'2026-10-01T01:00:00Z',reviewerName:'主管乙',overallFeedback:'第二次整體回覆',workInstructions:'第二次工作指示',entries:[{category:'IDP',entryId:'a',text:'第二版實績',feedback:'第二次退回原因',attachments:[]}]},
]}));
const original = JSON.stringify(manager);
const sections = {IDP:{entries:[{id:'a',text:'目前已修改的實績'}]}};
const render = (Component,props) => renderToStaticMarkup(React.createElement(Component,props));
const html = render(AssessmentReturnHistory,{manager,sections});
for (const content of ['查看退回歷史紀錄','第 2 次退回','第 1 次退回','第一次整體回覆','第一次工作指示','第一次退回原因','修改前實績','第二次退回原因','第二版實績','歷史佐證.eml','複製這次紀錄']) assert.ok(html.includes(content),content);
assert.ok(html.indexOf('第 2 次退回') < html.indexOf('第 1 次退回'),'most recent first');
assert.equal(JSON.stringify(manager),original,'render never changes saved histories');
const single = render(AssessmentReturnHistory,{manager:{...manager,returnHistory:[manager.returnHistory[0]]}});
assert.ok(single.includes('查看退回歷史紀錄'),'first return also has a visible history entry');
assert.equal(render(AssessmentReturnHistory,{manager:{...manager,returnHistory:[]}}),'');
const legacy = render(AssessmentReturnHistory,{manager:{...manager,returnHistory:[{...manager.returnHistory[0],overallFeedback:'',workInstructions:'',entries:[{...manager.returnHistory[0].entries[0],feedback:''}]}]}});
assert.ok(legacy.includes('當時未保存整體回覆。'));
assert.ok(legacy.includes('當時未保存退回原因。'));
const replyProps = {manager,category:'IDP',entry:{id:'a',text:'目前實績'},index:0,showFeedback:true};
const reply = render(AssessmentEntryFeedback,replyProps);
assert.ok(reply.includes('查看過往回覆'));
assert.ok(reply.includes('第一次退回原因'));
assert.ok(reply.includes('歷史佐證.eml'));
assert.equal(render(AssessmentEntryFeedback,{...replyProps,showFeedback:false}),'','no history leaks into unauthorized views');
assert.equal(render(AssessmentEntryFeedback,{...replyProps,entry:{id:'other',text:'其他實績'}}),'','entry histories never mix');
const editing = render(AssessmentEntryFeedback,{...replyProps,editable:true,
  manager:{...manager,returnHistory:[],entryReviews:{...manager.entryReviews,IDP:{a:{feedback:'尚未提交的修改',returnRequested:false,attachments:[]}}}},savedManager:manager});
assert.ok(editing.includes('查看 IDP 實績 1 退回紀錄'));
assert.ok(editing.includes('第二次退回原因'),'the manager history comes from saved data, not editable comments');
assert.ok(editing.includes('尚未提交的修改'),'unsent comments still remain in the editable field');
const snapshotOnly = render(AssessmentEntryFeedback,{...replyProps,historyOnly:true,manager:{...manager,entryReviews:{...manager.entryReviews,IDP:{a:{feedback:'尚未提交',attachments:[{...attachment,name:'未退回的附件.eml'}]}}}}});
assert.ok(!snapshotOnly.includes('未退回的附件.eml'),'historical reply never substitutes a different current attachment');
console.log('PASS full historical snapshots, first return, attachments, missing legacy values, immutable data and per-entry visibility');
