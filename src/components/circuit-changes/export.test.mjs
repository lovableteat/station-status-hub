import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),{loader}=require("../../../tests/support/renderHarness.cjs");
const {circuitChangeExportRows}=loader({mocks:{"./files":{},"./storage":{}}})("src/components/circuit-changes/export.ts");
test("Change List projection includes every requested item in order with saved state and image counts",()=>{
 const items=Array.from({length:60},(_,index)=>({number:index+1,status:index===59?"approved":"draft",revision:index+1,createdBy:"engineer",updatedBy:"reviewer",createdAt:"2026-11-09T01:00:00Z",updatedAt:"2026-11-09T02:00:00Z",content:{title:`修改 ${index+1}`,owner:"工程師",reason:"原因",description:"修改",refs:"R1",net:"NET",page:"12",images:index===59?[{},{}]:[]}}));
 const rows=circuitChangeExportRows(items);assert.equal(rows.length,60);assert.equal(rows[59][0],60);assert.equal(rows[59][2],"已結案");assert.equal(rows[59][10],2);assert.equal(rows[59][13],"reviewer");
});
test("Change List uses actual event actors rather than assigned owners or raw account ids",()=>{
 const item={id:"part-1",number:1,status:"approved",revision:4,createdBy:"account-A",updatedBy:"account-B",createdAt:"2026-11-09T01:00:00Z",updatedAt:"2026-11-09T02:00:00Z",content:{title:"R1",owner:"指派負責人",reason:"",description:"",refs:"",net:"",page:"",images:[]}};
 const events=[{itemId:"part-1",revision:1,type:"created",actorName:"建立工程師",actorId:"account-A"},{itemId:"part-1",revision:4,type:"approve",actorName:"審查主管",actorId:"account-B"}];
 const [row]=circuitChangeExportRows([item],events);
 assert.equal(row[4],"指派負責人");assert.equal(row[11],"建立工程師");assert.equal(row[13],"審查主管");
});
