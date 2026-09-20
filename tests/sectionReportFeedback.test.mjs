import assert from "node:assert/strict";
import test from "node:test";
import {
  getSectionReportRoleCopy,
  readSectionReportFeedbackHistory,
} from "../src/components/performance/sectionReportFeedback.mjs";

const file = {
  id: "file-1",
  name: "主管回覆.csv",
  mimeType: "text/csv",
  size: 3,
  dataUrl: "data:text/csv;base64,QUJD",
};

test("section feedback history keeps valid replies and rejects unsafe attachments", () => {
  const history = readSectionReportFeedbackHistory([
    { id: "one", action: "return", feedback: "補上數據", attachments: [file], reviewerName: "部長", reviewedAt: "2026-09-20T00:00:00Z" },
    { id: "two", action: "approve", feedback: "", attachments: [{ ...file, name: "unsafe.html", dataUrl: "data:text/html;base64,QQ==" }] },
  ]);
  assert.equal(history.length, 1);
  assert.equal(history[0].feedback, "補上數據");
  assert.deepEqual(history[0].attachments, [file]);
});

test("section overview gives chiefs and directors role-specific instructions", () => {
  assert.equal(getSectionReportRoleCopy("section_chief").heading, "評核直屬同仁");
  assert.match(getSectionReportRoleCopy("section_chief").selfHint, /員工自評/);
  assert.equal(getSectionReportRoleCopy("director").heading, "評核直屬課長");
});
