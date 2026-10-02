import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";
import { downloadPerformanceExcel, downloadPerformanceHtml } from "../src/components/performance/performanceExport.ts";
import { DEFAULT_PERFORMANCE_REVIEWS } from "../src/components/performance/performanceData.mjs";
import {
  ACCOUNTABILITY_QUESTIONS,
  serializeManagerAssessment,
  serializeSelfAssessment,
} from "../src/components/performance/rd2Assessment.mjs";
import { RATING_SCALE } from "../src/components/performance/rd2Standards.mjs";

test("manager Excel keeps long KPI in one row and uses the existing supervisor comment column", async () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalDocument = globalThis.document;
  let exportedBlob;
  URL.createObjectURL = (blob) => {
    exportedBlob = blob;
    return "blob:test";
  };
  URL.revokeObjectURL = () => {};
  globalThis.document = {
    createElement: () => ({ click() {}, remove() {} }),
    body: { appendChild() {} },
  };

  try {
    const longAchievement = "測".repeat(520);
    const review = {
      ...DEFAULT_PERFORMANCE_REVIEWS[0],
      employeeName: "Excel 測試",
      selfFeedback: serializeSelfAssessment({
        sections: {
          KPI: { entries: [{ id: "kpi-1", text: longAchievement }] },
        },
      }),
      managerFeedback: serializeManagerAssessment({
        feedback: "整體主管評語",
        workInstructions: "下一期完成自動化驗證",
        entryReviews: { KPI: { "kpi-1": { feedback: "逐項主管評語" } } },
        categoryReviews: { KPI: { feedback: "類別主管評語", score: 88 } },
        answers: { [ACCOUNTABILITY_QUESTIONS[0].id]: 4 },
      }),
    };
    await downloadPerformanceExcel([review], "2026-q3");
    assert.ok(exportedBlob);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await exportedBlob.arrayBuffer());
    const rows = workbook.worksheets[0].getSheetValues().slice(16).filter(Boolean);
    const kpiRows = rows.filter((row) => row[1] === "KPI");
    assert.equal(kpiRows.length, 1);
    assert.equal(kpiRows[0][2], longAchievement);
    assert.equal(kpiRows[0][3], "逐項主管評語");
    assert.match(kpiRows[0][6], /類別主管評語/);
    const overallRow = rows.find((row) => row[1] === "主管總結" && row[2] === "整體回覆");
    const instructionRow = rows.find((row) => row[1] === "主管總結" && row[2] === "工作指示");
    assert.equal(overallRow?.[3], "整體主管評語");
    assert.equal(instructionRow?.[3], "下一期完成自動化驗證");
    assert.ok(rows.every((row) => !String(row[1]).includes("（續）")));
    assert.ok(rows.every((row) => row[2] !== "整體主管評語"));
    assert.ok(rows.every((row) => row[1] !== "當責量表"));
    const accountabilityHeader = rows.find((row) => row[1] === "評分（1–5 分）");
    assert.ok(accountabilityHeader);
    assert.equal(accountabilityHeader[2], "當責題目");
    const accountabilityRow = rows.find((row) => row[2] === ACCOUNTABILITY_QUESTIONS[0].text);
    assert.ok(accountabilityRow);
    assert.equal(accountabilityRow[1], RATING_SCALE.find((item) => item.value === 4).label);

    await downloadPerformanceHtml([review], "2026-q3");
    const html = await exportedBlob.text();
    assert.match(html, /主管當責評分/);
    assert.match(html, /整體主管評語/);
    assert.match(html, /下一期完成自動化驗證/);
    assert.match(html, /<table class="accountability-table"><thead>[\s\S]*?<tbody><tr><td>4分（做得不錯）<\/td><td>/);
    assert.doesNotMatch(html, /<td>當責量表<\/td>/);
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    globalThis.document = originalDocument;
  }
});

test('employee exports current self assessment with readable headers and no supervisor data', async () => {
  const {createSelfAssessmentExport} = await import('../src/components/performance/selfAssessmentExport.mjs');
  const {createAssessmentForm,readSelfAssessment} = await import('../src/components/performance/rd2Assessment.mjs');
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL, originalDocument = globalThis.document;
  let blob, filename;
  URL.createObjectURL = value => {blob=value;return 'blob:self-test';};
  URL.revokeObjectURL = () => {};
  globalThis.document = {createElement:()=>({set download(value){filename=value;},click(){},remove(){}}),body:{appendChild(){}}};
  try {
    const previous={...DEFAULT_PERFORMANCE_REVIEWS[0],employeeName:'自評匯出測試',score:99,
      selfFeedback:serializeSelfAssessment({grade:'23',sections:{IDP:{selfScore:95,entries:[{id:'self-1',text:'原始實績',links:['https://example.com/evidence'],attachments:[{id:'mail-1',name:'驗證郵件.eml',size:4,type:'message/rfc822',dataUrl:'data:message/rfc822;base64,dGVzdA=='}]}]}}}),
      managerFeedback:serializeManagerAssessment({feedback:'PRIVATE_OVERALL',workInstructions:'PRIVATE_INSTRUCTION',categoryReviews:{IDP:{feedback:'PRIVATE_CATEGORY',score:98}},entryReviews:{IDP:{'self-1':{feedback:'PRIVATE_ENTRY'}}},answers:{[ACCOUNTABILITY_QUESTIONS[0].id]:5}})};
    const form=createAssessmentForm(previous);
    form.self.sections.IDP.entries[0].text='目前編輯內容 <script>alert(1)</script> '+ '成果'.repeat(160);
    const snapshot=createSelfAssessmentExport(form,previous,'2026-q3');
    assert.equal(snapshot.score,null);
    assert.equal(snapshot.managerFeedback,'');
    assert.equal(readSelfAssessment(snapshot.selfFeedback).sections.IDP.entries[0].text,form.self.sections.IDP.entries[0].text);
    assert.equal(readSelfAssessment(previous.selfFeedback).sections.IDP.entries[0].text,'原始實績');
    assert.equal(previous.score,99);
    await downloadPerformanceExcel([snapshot],'2026-q3',{selfOnly:true});
    assert.match(filename,/^員工自評-自評匯出測試/);
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await blob.arrayBuffer());
    const sheet=workbook.worksheets[0], rows=sheet.getSheetValues().filter(Boolean);
    const header=rows.find(row=>row[1]==='大類');
    assert.deepEqual(header.slice(1),['大類','實績內容','員工自評分數','證明連結','自評附件檔名','自評圖片檔名']);
    const idp=rows.find(row=>row[1]==='IDP');
    assert.equal(idp[2],form.self.sections.IDP.entries[0].text);
    assert.equal(idp[3],95);
    assert.equal(idp[4],'https://example.com/evidence');
    assert.match(idp[5],/驗證郵件.eml/);
    assert.doesNotMatch(JSON.stringify(rows),/PRIVATE_|主管加權評分|主管當責/);
    assert.equal(sheet.getRow(1).getCell(1).fill.fgColor.argb,'FFFFFF00');
    const headerIndex=sheet.getSheetValues().findIndex(row=>row?.[1]==='大類');
    assert.equal(sheet.getRow(headerIndex).getCell(1).fill.fgColor.argb,'FF1F4E79');
    assert.equal(sheet.getRow(headerIndex+1).getCell(2).alignment.wrapText,true);
    downloadPerformanceHtml([previous],'2026-q3',{selfOnly:true});
    const html=await blob.text();
    assert.match(html,/員工自評資料/);
    assert.match(html,/原始實績/);
    assert.match(html,/<a href="https:\/\/example.com\/evidence"/);
    assert.doesNotMatch(html,/PRIVATE_|主管加權評分|主管當責/);
    downloadPerformanceHtml([snapshot],'2026-q3',{selfOnly:true});
    const editedHtml=await blob.text();
    assert.match(editedHtml,/&lt;script&gt;/);
    assert.doesNotMatch(editedHtml,/<script>/);
    for(const status of ['draft','in-progress','submitted','approved']){
      const saved=createSelfAssessmentExport(undefined,{...previous,status},'2026-q3');
      assert.equal(saved.status,status);
      assert.equal(saved.managerFeedback,'');
    }
  } finally {URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;globalThis.document=originalDocument;}
});
