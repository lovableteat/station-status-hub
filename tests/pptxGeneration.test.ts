import assert from "node:assert/strict";
import test from "node:test";
import { createPresentationPrompt, parsePresentationResponse } from "../src/components/api-management/pptxGeneration.ts";

const sourceNames = ["週報.csv", "使用者貼上的資料"];
const slides = [
  { title: "測試結果", bullets: ["通過 12 台，總共 15 台"], sourceIds: [1, 1], notes: "取自 11 月 6 日的週報。" },
  { title: "需確認的事項", bullets: ["資料未提供其餘三台的進度。"], sourceIds: [1, 2] },
  { title: "下一步", bullets: ["建議確認測試完成日期。"], sourceIds: [] },
];
const result = (withSlides = slides) => JSON.stringify({ title: "產線週報", slides: withSlides });

test("presentation prompt distinguishes instructions, uploads, and pasted evidence", () => {
  const prompt = createPresentationPrompt({ instruction: "用在主管週會", slideCount: 3, sourceNames, sourceText: "需確認：3 台。" });
  assert.match(prompt, /正好 3 頁/);
  assert.match(prompt, /使用者的簡報需求："用在主管週會"/);
  assert.match(prompt, /"id":1,"name":"週報\.csv"/);
  assert.match(prompt, /貼上資料（來源 2）："需確認：3 台。"/);
  assert.throws(() => createPresentationPrompt({ instruction: "", slideCount: 0, sourceNames }), /頁數/);
});

test("presentation parser reads complete raw or fenced output and resolves source IDs", () => {
  const raw = parsePresentationResponse(result(), 3, sourceNames);
  const fenced = parsePresentationResponse(`\`\`\`json\n${result()}\n\`\`\``, 3, sourceNames);
  assert.deepEqual(raw, fenced);
  assert.equal(raw.title, "產線週報");
  assert.deepEqual(raw.slides, [
    { title: "測試結果", bullets: ["通過 12 台，總共 15 台"], source: "週報.csv", notes: "取自 11 月 6 日的週報。" },
    { title: "需確認的事項", bullets: ["資料未提供其餘三台的進度。"], source: "週報.csv、使用者貼上的資料" },
    { title: "下一步", bullets: ["建議確認測試完成日期。"], source: "" },
  ]);
});

test("presentation parser rejects partial output and unsupported source citations", () => {
  assert.throws(() => parsePresentationResponse('{"title":', 3, sourceNames), /不完整/);
  assert.throws(() => parsePresentationResponse(result(slides.slice(0, 2)), 3, sourceNames), /不完整/);
  const missingSource = [{ ...slides[0], sourceIds: [3] }, ...slides.slice(1)];
  assert.throws(() => parsePresentationResponse(result(missingSource), 3, sourceNames), /第 1 頁包含無法核對的資料來源/);
  const overlong = [{ ...slides[0], bullets: ["測".repeat(200)] }, ...slides.slice(1)];
  assert.throws(() => parsePresentationResponse(result(overlong), 3, sourceNames), /第 1 頁格式不完整/);
});

test("presentation source labels keep CJK and emoji while making file names safe for slide XML", () => {
  const draft = parsePresentationResponse(result(), 3, ["週報🛠\n原始\u0000資料.csv", sourceNames[1]]);
  assert.equal(draft.slides[0].source, "週報🛠 原始�資料.csv");
});
