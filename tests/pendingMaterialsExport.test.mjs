import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import ExcelJS from "exceljs";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const {loader}=createRequire(import.meta.url)("./support/renderHarness.cjs");

test("pending Excel round-trips full references, leading-zero part numbers, assignment, progress and every attachment", async () => {
  const load=loader();
  const source=await readFile("src/components/material-requests/pendingMaterialsExport.ts","utf8");
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={}; const native=createRequire(import.meta.url);
  new Function("require","exports",compiled)(name=>name.startsWith(".") ? load("src/components/material-requests/"+name.slice(2)+".ts") : native(name),exports);
  const {createPendingMaterialsWorkbook}=exports;
  const ref=Array.from({length:50},(_,i)=>`J${i+1}`).join(",");
  const row={category:"CONNECTOR",displayRef:"J1…",record:{id:"one",name:"完整料件名稱",refDes:ref,qty:8,manufacturerPartNumber:"000012345",manufacturer:"廠商",partNumber:"001-234",requestOwnerName:"負責人 CE",trackingStatus:"SYMBOL申請中",trackingHistory:[{id:"progress",status:"SYMBOL申請中",createdBy:"真正操作者",createdAt:"2026-10-29T02:00:00Z",note:"等 SYMBOL"}],specDocument:{name:"old.pdf",path:"old"},specDocuments:[{name:"old.pdf",path:"old"},{name:"part.glb",path:"model"}]}};
  const exportedAt = new Date("2026-10-30T14:00:00Z");
  const undated = { ...row, record: { ...row.record, trackingHistory: [{ id: 'imported', status: '已發信', createdAt: '' }] } };
  const followUps = ["未回應再次發信", "與廠商溝通中", "申請料被退回"].map(status => ({ ...row, record: { ...row.record, trackingStatus: status, trackingHistory: [{ ...row.record.trackingHistory[0], status }] } }));
  const workbook=await createPendingMaterialsWorkbook({rows:[row, undated, ...followUps],workspaceName:"篩選的 BOM",exportedBy:"匯出者",scope:"分類：CONNECTOR · 搜尋：J1", exportedAt});
  const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet=reopened.getWorksheet("待處理料");
  assert.equal(sheet.rowCount,9);
  const headers=sheet.getRow(4).values;
  const value=label=>sheet.getRow(5).getCell(headers.indexOf(label)).value;
  assert.equal(value("Ref Des"),ref);
  assert.equal(value("Manufacturer Part Number"),"000012345");
  assert.equal(value("Qty"),8);
  assert.equal(value("負責人"),"負責人 CE");
  assert.equal(value("最後更新人"),"真正操作者");
  assert.equal(value("申請類型說明"),"已有料號，需申請 SYMBOL");
  assert.equal(value("SPEC 文件"),"old.pdf\npart.glb");
  assert.equal(value("首次更新時間"), "2026-10-29T02:00:00.000Z");
  assert.equal(value("累計申請天數"), 1.5, "export stores numeric 24-hour days, including the partial day");
  assert.equal(value("統計截至時間"), exportedAt.toISOString());
  assert.equal(sheet.getRow(5).getCell(headers.indexOf("累計申請天數")).numFmt, "0.00");
  assert.equal(sheet.getRow(6).getCell(headers.indexOf("首次更新時間")).value, "");
  assert.equal(sheet.getRow(6).getCell(headers.indexOf("累計申請天數")).value, null);
  for (let i = 0; i < followUps.length; i++) {
    assert.equal(sheet.getRow(i + 7).getCell(headers.indexOf("目前狀態")).value, followUps[i].record.trackingStatus);
    assert.equal(sheet.getRow(i + 7).getCell(headers.indexOf("累計申請天數")).value, 1.5);
  }
  assert.match(sheet.getCell("A3").value,/分類：CONNECTOR · 搜尋：J1/);
  assert.equal(sheet.views[0].ySplit,4);
});
