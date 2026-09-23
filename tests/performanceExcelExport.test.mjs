import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";
import { downloadPerformanceExcel } from "../src/components/performance/performanceExport.ts";
import { DEFAULT_PERFORMANCE_REVIEWS } from "../src/components/performance/performanceData.mjs";
import {
  ACCOUNTABILITY_QUESTIONS,
  serializeManagerAssessment,
  serializeSelfAssessment,
} from "../src/components/performance/rd2Assessment.mjs";

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
    assert.match(kpiRows[0][6], /整體主管評語/);
    assert.ok(rows.every((row) => !String(row[1]).includes("（續）")));
    assert.ok(rows.every((row) => row[2] !== "整體主管評語"));
    assert.ok(rows.some((row) => row[1] === "當責量表" && row[5] === 4));
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    globalThis.document = originalDocument;
  }
});
