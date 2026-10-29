import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("./materialTrackingDraft.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replaceAll('"./materialTrackingStatus"', JSON.stringify(new URL("./materialTrackingStatus.ts", import.meta.url).href))
  .replace('"./materialRequestUtils"', JSON.stringify(new URL("./materialRequestUtils.ts", import.meta.url).href));
const { createMaterialTrackingDraft, applyMaterialTrackingDraft, normalizeMaterialRequestUrl } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const image = { id: "image-1", name: "original.png", mimeType: "image/png", size: 10, dataUrl: "data:image/png;base64,old" };
const history = [{ id: "old", status: "處理中", note: "原追蹤", createdAt: "2026-01-01T00:00:00.000Z", images: [image] }];
const record = { id: "row-1", trackingHistory: history, trackingStatus: "處理中", trackingNote: "來源註記", requestTicket: "A-1", requestUrl: "https://example.com/old", partUsageStatus: "不建議使用", sourcingStatus: "Approved", partNumber: "real-1" };

test("all six stages preserve old history and use the acting account instead of the assigned request owner", () => {
  for (const status of ["未處理", "已發信", "文件已收齊", "料號申請中", "SYMBOL申請中", "已完成"]) {
    const assigned = {...record,requestOwnerId:"other-user",requestOwnerName:"指定的 CE"};
    const result = applyMaterialTrackingDraft(assigned,{...createMaterialTrackingDraft(assigned),status},"目前登入者");
    assert.equal(result.trackingHistory.at(-1).status,status);
    assert.equal(result.trackingHistory.at(-1).createdBy,"目前登入者");
    assert.equal(result.requestOwnerName,"指定的 CE");
    assert.equal(result.trackingHistory[0].status,"處理中");
  }
});

test("a new draft leaves progress empty and initializes independent ticket metadata", () => {
  const draft = createMaterialTrackingDraft(record);
  assert.equal(draft.status, "");
  assert.equal(draft.createdBy, "");
  assert.deepEqual(draft.images, []);
  assert.equal(draft.requestTicket, "A-1");
  assert.notEqual(draft.sessionId, createMaterialTrackingDraft(record).sessionId);
  const result = applyMaterialTrackingDraft(record, draft, "自動更新人");
  assert.deepEqual(result, record);
});

test("notes, images, author and request info each require a selected status", () => {
  for (const fields of [{ note: "新註記" }, { images: [image] }, { createdBy: "採購" }, { requestInfo: "申請處理中" }]) {
    assert.throws(() => applyMaterialTrackingDraft(record, { ...createMaterialTrackingDraft(record), ...fields }), /請先選擇.*狀態/);
  }
  assert.throws(() => applyMaterialTrackingDraft(record, { ...createMaterialTrackingDraft(record), status: "錯誤狀態" }), /狀態/);
  assert.throws(() => applyMaterialTrackingDraft(record, { ...createMaterialTrackingDraft(record), pendingImageReads: 1 }), /圖片.*讀取/);
});

test('an invalid link blocks save instead of silently erasing the typed value', () => {
  for (const requestUrl of ['不是網址', 'https://', 'javascript:alert(1)']) {
    const draft = { ...createMaterialTrackingDraft(record), requestUrl };
    assert.throws(() => applyMaterialTrackingDraft(record, draft), /連結請填寫/);
    assert.equal(draft.requestUrl, requestUrl);
    assert.equal(record.requestUrl, 'https://example.com/old');
  }
});

test("ticket-only edits normalize URLs and preserve all existing history and source values", () => {
  const before = structuredClone(record);
  const result = applyMaterialTrackingDraft(record, { ...createMaterialTrackingDraft(record), requestTicket: " B-2 ", requestUrl: " example.com/ticket/B-2 " });
  assert.deepEqual(record, before);
  assert.deepEqual(result.trackingHistory, history);
  assert.equal(result.trackingStatus, "處理中");
  assert.equal(result.trackingNote, "來源註記");
  assert.equal(result.partUsageStatus, "不建議使用");
  assert.equal(result.requestTicket, "B-2");
  assert.equal(result.requestUrl, "https://example.com/ticket/B-2");
  assert.equal(applyMaterialTrackingDraft(result, { ...createMaterialTrackingDraft(result), requestTicket: "", requestUrl: "" }).requestTicket, "");
});

test("one save appends exactly one immutable progress entry while keeping old images", () => {
  const draft = { ...createMaterialTrackingDraft(record), status: "已完成", note: " 已完成核對 ", images: [{ ...image, id: "new" }] };
  const before = structuredClone({ record, draft });
  const result = applyMaterialTrackingDraft(record, draft, "CE");
  assert.equal(result.trackingHistory.length, 2);
  assert.deepEqual(result.trackingHistory[0], history[0]);
  assert.deepEqual(result.trackingHistory[1].images, draft.images);
  assert.notEqual(result.trackingHistory[1].images, draft.images);
  assert.notEqual(result.trackingHistory[1].images[0], draft.images[0]);
  assert.equal(result.trackingHistory[1].createdBy, "CE");
  assert.equal(result.trackingHistory[1].note, "已完成核對");
  assert.equal(result.trackingStatus, "已完成");
  assert.deepEqual({ record, draft }, before);
});

test("the first progress update retains the previous legacy status and note", () => {
  const legacy = { ...record, trackingHistory: undefined, trackingStatus: "處理中", trackingNote: "原始舊版備註" };
  const result = applyMaterialTrackingDraft(legacy, { ...createMaterialTrackingDraft(legacy), status: "已完成" });
  assert.equal(result.trackingHistory.length, 2);
  assert.equal(result.trackingHistory[0].note, "原始舊版備註");
  assert.equal(result.trackingHistory[0].status, "處理中");
});

test("request URLs match existing supported http, https and domain forms", () => {
  assert.equal(normalizeMaterialRequestUrl(" example.com/request "), "https://example.com/request");
  assert.equal(normalizeMaterialRequestUrl("http://example.com/request"), "http://example.com/request");
  assert.equal(normalizeMaterialRequestUrl("javascript:alert(1)"), "");
  assert.equal(normalizeMaterialRequestUrl("單號123"), "");
});
