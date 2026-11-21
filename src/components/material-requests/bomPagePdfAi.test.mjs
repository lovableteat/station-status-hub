import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);
const { loader } = require("../../../tests/support/renderHarness.cjs");
const { parsePdfPageTitles, applyPdfPageTitles } = loader()("src/components/material-requests/bomPagePdfAi.ts");

test("PDF title results preserve physical page mapping and reject missing, duplicate or invented pages", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(parsePdfPageTitles('```json\n{"pages":[{"pageNumber":2,"title":null},{"pageNumber":1,"title":" CPU  Power "}]}\n```', [1, 2]))), [{ pageNumber: 1, title: "CPU Power" }, { pageNumber: 2, title: "" }]);
  for (const pages of [[{pageNumber:1,title:"A"}], [{pageNumber:1,title:"A"},{pageNumber:1,title:"B"}], [{pageNumber:1,title:"A"},{pageNumber:3,title:"B"}]]) {
    assert.throws(() => parsePdfPageTitles(JSON.stringify({pages}), [1,2]));
  }
});

test("stored page tracker titles and POWER markers survive normalization with legacy notes and statuses", () => {
  const ts = require("typescript");
  const normalize = loader({ transform(source, file) {
    if (!file.endsWith("materialBomStorage.ts")) return source;
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
    const fns=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&["normalizePageTracker","normalizePageCheck","normalizePageCheckEvent"].includes(node.name?.text));
    return fns.map(fn=>fn.getText(ast)).join("\n")+"\nexport { normalizePageTracker };";
  }})("src/components/material-requests/materialBomStorage.ts").normalizePageTracker;
  // 檢查完成 and the check record survive a reload; malformed lines are dropped, never invented.
  const checked=JSON.parse(JSON.stringify(normalize({totalPages:2,pages:[{pageNumber:1,status:"done",note:"",checked:{at:"2026-11-21T01:00:00Z",by:"甲",byId:"u1"}},{pageNumber:2,status:"done",note:"",checked:{by:"沒有時間"}}],
    checkLog:[{id:"a",pageNumber:1,action:"check",at:"2026-11-21T01:00:00Z",by:"甲"},{id:"b",pageNumber:1,action:"uncheck",at:"2026-11-21T02:00:00Z",by:"乙",reason:"重畫"},{id:"c",pageNumber:0,action:"check",at:"x",by:"y"},{pageNumber:1,action:"check"}]},"2026-11-21")));
  assert.deepEqual(checked.pages[0].checked,{at:"2026-11-21T01:00:00Z",by:"甲",byId:"u1"});
  assert.equal("checked" in checked.pages[1],false);
  assert.equal(checked.checkLog.map(event=>`${event.id}:${event.action}:${event.reason??""}`).join(),"a:check:,b:uncheck:重畫");
  assert.equal("checkLog" in JSON.parse(JSON.stringify(normalize({totalPages:1,pages:[]},"2026-11-21"))),false,"a document without checks stays as it was");
  const value=JSON.parse(JSON.stringify(normalize({totalPages:3,currentPage:1,pages:[{pageNumber:1,title:"CPU POWER",status:"done",note:"Keep",power:true},{pageNumber:2,status:"pending",note:"Legacy"},{pageNumber:3,status:"pending",note:"",power:"true"}]},"2026-11-09")));
  assert.equal(value.pages[0].title,"CPU POWER");
  assert.equal(value.pages[0].power,true);
  assert.deepEqual(value.pages[1],{pageNumber:2,status:"pending",note:"Legacy"});
  assert.equal("power" in value.pages[2],false);
  assert.equal(value.pages[0].note,"Keep");assert.equal(value.pages[0].status,"done");
});

test("applying titles preserves saved progress, notes, unreadable old titles and pages past a shorter PDF", () => {
  const existing = [{pageNumber:1,title:"Old",status:"done",note:"工程師備註",power:true},{pageNumber:2,title:"Keep",status:"done_missing",note:"待料"},{pageNumber:9,title:"Later",status:"pending",note:"保留"}];
  const before=JSON.stringify(existing);
  const result=JSON.parse(JSON.stringify(applyPdfPageTitles(existing,[{pageNumber:1,title:"New"},{pageNumber:2,title:""},{pageNumber:3,title:"Clock"}])));
  assert.equal(JSON.stringify(existing),before);
  assert.deepEqual(result,[{...existing[0],title:"New"},existing[1],{pageNumber:3,status:"pending",note:"",title:"Clock"},existing[2]]);
});
