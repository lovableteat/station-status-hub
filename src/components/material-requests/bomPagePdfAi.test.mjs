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

test("stored page tracker titles survive normalization without changing legacy notes and statuses", () => {
  const ts = require("typescript");
  const normalize = loader({ transform(source, file) {
    if (!file.endsWith("materialBomStorage.ts")) return source;
    const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
    const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==="normalizePageTracker");
    return fn.getText(ast)+"\nexport { normalizePageTracker };";
  }})("src/components/material-requests/materialBomStorage.ts").normalizePageTracker;
  const value=JSON.parse(JSON.stringify(normalize({totalPages:2,currentPage:1,pages:[{pageNumber:1,title:"CPU POWER",status:"done",note:"Keep"},{pageNumber:2,status:"pending",note:"Legacy"}]},"2026-11-09")));
  assert.equal(value.pages[0].title,"CPU POWER");
  assert.deepEqual(value.pages[1],{pageNumber:2,status:"pending",note:"Legacy"});
  assert.equal(value.pages[0].note,"Keep");assert.equal(value.pages[0].status,"done");
});

test("applying titles preserves saved progress, notes, unreadable old titles and pages past a shorter PDF", () => {
  const existing = [{pageNumber:1,title:"Old",status:"done",note:"工程師備註"},{pageNumber:2,title:"Keep",status:"done_missing",note:"待料"},{pageNumber:9,title:"Later",status:"pending",note:"保留"}];
  const before=JSON.stringify(existing);
  const result=JSON.parse(JSON.stringify(applyPdfPageTitles(existing,[{pageNumber:1,title:"New"},{pageNumber:2,title:""},{pageNumber:3,title:"Clock"}])));
  assert.equal(JSON.stringify(existing),before);
  assert.deepEqual(result,[{...existing[0],title:"New"},existing[1],{pageNumber:3,status:"pending",note:"",title:"Clock"},existing[2]]);
});
