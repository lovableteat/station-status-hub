import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { serializeSelfAssessment, serializeManagerAssessment } from "../src/components/performance/rd2Assessment.mjs";

const source = await readFile(new URL("../src/components/performance/performanceCopyText.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace("./rd2Assessment.mjs", new URL("../src/components/performance/rd2Assessment.mjs", import.meta.url).href);
const { buildPerformanceCopyText, buildPerformanceReviewsCopyText } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const review = (self = {}, extra = {}) => ({
  id: "review-1", cycleId: "2026-q3", employeeId: "employee-1", employeeName: "王小明",
  department: "硬體二部", role: "工程師", reviewerName: "主管", status: "submitted", score: 99,
  dueDate: "2026-10-20", updatedAt: "2026-10-10T01:00:00Z", goals: [],
  selfFeedback: serializeSelfAssessment(self),
  managerFeedback: serializeManagerAssessment({ feedback: "PRIVATE_SUPERVISOR", workInstructions: "PRIVATE_INSTRUCTION" }),
  ...extra,
});
const file = (name = "完成紀錄.eml") => ({ id: "file-1", name, mimeType: "message/rfc822", size: 4, dataUrl: "data:message/rfc822;base64,dGVzdA==" });

test("one-field copy keeps the complete original prose and category order without supervisor feedback or generated summaries", () => {
  const longText = "面對供料問題，我建立跨組協作流程，節省 80% 時間。\n\n" + "完整成果，不能裁切。".repeat(80);
  const input = review({ employeeNumber: "LA123456", sections: {
    KPI: { selfScore: 100, entries: [{ id: "kpi-1", text: "  原本的縮排與標點 <script> & \"字\"  " }] },
    IDP: { selfScore: 95, entries: [{ id: "idp-1", text: longText }, { id: "idp-2", text: "第二筆\n手寫 STAR 成果" }] },
    OKR: { selfScore: 88, entries: [{ id: "okr-1", text: "流程改善：縮短 30 分鐘" }] },
  } });
  const before = JSON.stringify(input);
  const text = buildPerformanceCopyText(input);
  assert.match(text, /員工：王小明\n工號：LA123456\n部門：硬體二部\n考核週期：2026-q3/);
  assert.ok(text.indexOf("【IDP】") < text.indexOf("【OKR】"));
  assert.ok(text.indexOf("【OKR】") < text.indexOf("【KPI】"));
  assert.ok(text.includes(longText));
  assert.ok(text.includes("2. 第二筆\n手寫 STAR 成果"));
  assert.ok(text.includes('1.   原本的縮排與標點 <script> & "字"  '));
  assert.equal(text.split(longText).length, 2, "generated section text must not repeat entries");
  assert.doesNotMatch(text, /PRIVATE_|主管|自評分數|S（|T（|A（|R（/);
  assert.equal(JSON.stringify(input), before);
});

test("evidence links and file names are copyable, while attachment/image bytes stay out of copied text", () => {
  const text = buildPerformanceCopyText(review({ sections: { IDP: {
    entries: [{ id: "idp-1", text: "完成平台導入", links: ["https://example.com/entry?a=1&b=2", "javascript:unsafe"], attachments: [file()] }],
    links: ["https://example.com/section"],
    images: [{ id: "image-1", name: "驗證截圖.png", dataUrl: "data:image/png;base64,cG5n" }],
  } } }));
  assert.match(text, /證明連結：\nhttps:\/\/example.com\/entry\?a=1&b=2/);
  assert.match(text, /附件：完成紀錄.eml/);
  assert.match(text, /https:\/\/example.com\/section/);
  assert.match(text, /自評圖片：驗證截圖.png/);
  assert.doesNotMatch(text, /base64|dGVzdA==|cG5n|javascript:/);
});

test("legacy content, section summaries and an unadded draft are preserved without inventing STAR labels", () => {
  const legacy = "舊資料第一行\n第二行：完成測試與交付。";
  const plain = buildPerformanceCopyText(review({}, { selfFeedback: legacy }));
  assert.ok(plain.includes(`【既有自評內容】\n${legacy}`));
  assert.doesNotMatch(plain, /【IDP】|【OKR】|【KPI】/);
  const text = buildPerformanceCopyText(review({ sections: {
    IDP: { text: "舊分類內容\n保留原文" },
    OKR: { entries: [{ id: "okr-1", text: "已新增的成果" }], draftText: "尚未按新增的內容\n也要帶上" },
  } }));
  assert.ok(text.includes("1. 舊分類內容\n保留原文"));
  assert.ok(text.includes("1. 已新增的成果\n\n2. 尚未按新增的內容\n也要帶上"));
});

test("an empty self-report is explicit; unloaded list projections are rejected", () => {
  assert.match(buildPerformanceCopyText(review()), /尚未填寫實績。$/);
  assert.throws(() => buildPerformanceCopyText(review({}, { contentLoaded: false })), /尚未讀取完成/);
  assert.equal(buildPerformanceReviewsCopyText([]), "");
});

test("selected employee consolidation keeps order, clear boundaries and the chosen cycle without altering inputs", () => {
  const first = review({ sections: { IDP: { entries: [{ id: "a", text: "第一人的實績" }] } } });
  const second = review({ sections: { KPI: { entries: [{ id: "b", text: "第二人的實績" }] } } }, { id: "review-2", employeeName: "李小華", cycleId: "old-cycle" });
  const text = buildPerformanceReviewsCopyText([first, second], "2026-q4");
  assert.ok(text.indexOf("員工：王小明") < text.indexOf("員工：李小華"));
  assert.equal(text.split("──────────").length, 2);
  assert.equal(text.split("考核週期：2026-q4").length, 3);
  assert.ok(text.includes("第一人的實績"));
  assert.ok(text.includes("第二人的實績"));
  assert.equal(first.cycleId, "2026-q3");
  assert.equal(second.cycleId, "old-cycle");
});
