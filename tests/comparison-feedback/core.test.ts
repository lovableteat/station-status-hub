import assert from "node:assert/strict";
import test from "node:test";
import { assertReviewInput, detectImageMime, feedbackDate, feedbackExportPath, feedbackMatchesDraft, filterFeedbackReports, prepareFeedbackImages, validateFeedbackText, MAX_FEEDBACK_IMAGE_BYTES } from "../../src/components/comparison/feedback/core.ts";
import { createFeedbackRepository } from "../../src/components/comparison/feedback/repository.ts";
import type { FeedbackAdapter, FeedbackDraft, FeedbackReport } from "../../src/components/comparison/feedback/types.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const imageId = "33333333-3333-4333-8333-333333333333";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1n8AAAAASUVORK5CYII=", "base64");
const attachment = () => ({ id: imageId, file: new File([png], "problem.png", { type: "image/png" }) });
const input = () => ({ id, reporterId: owner, title: "BOM 問題", description: "切到審查表後文字被截斷", category: "ui" as const, tab: "review" as const, projectName: "QA board", context: { browser: "QA", width: 1440, height: 900, revisionA: "EVT", revisionB: "DVT" } });
function record(draft: FeedbackDraft): FeedbackReport {
  return { ...structuredClone(draft), attachmentOwnerId: draft.reporterId, reporterName: "QA reporter", reporterUsername: "qa", status: "new", adminNote: "", isSubmitted: false, createdAt: "2026-10-13T00:00:00Z", submittedAt: null, updatedAt: "2026-10-13T00:00:00Z" };
}
function fixture() {
  const rows = new Map<string, FeedbackReport>(); const images = new Map<string, Blob>(); const log: string[] = [];
  const adapter: FeedbackAdapter = {
    async listReports() { return [...rows.values()].filter(row => row.isSubmitted); },
    async getReport(id) { return rows.get(id) ?? null; },
    async createDraft(draft) { log.push("create"); const row = record(draft); rows.set(row.id, row); return row; },
    async uploadImage(image, file) { log.push("upload"); assert.equal(rows.get(id)?.isSubmitted, false); assert.equal((await adapter.listReports()).length, 0); images.set(image.path, file); },
    async submitDraft(id) { log.push("finalize"); const row = rows.get(id)!; assert.ok(row.screenshots.every(image => images.has(image.path))); row.isSubmitted = true; row.submittedAt = row.updatedAt; return row; },
    async removeImages(paths) { log.push("remove"); assert.equal(rows.get(id)?.isSubmitted, false); paths.forEach(path => images.delete(path)); },
    async abandonDraft(id) { log.push("abandon"); const row = rows.get(id); assert.equal(row?.isSubmitted, false); assert.ok(row?.screenshots.every(image => !images.has(image.path))); rows.delete(id); },
    async downloadImage(path) { return images.get(path)!; }, async reviewReport(row, _actor, status, note) { return { ...row, status, adminNote: note }; },
  };
  return { adapter, rows, images, log, repository: createFeedbackRepository(adapter) };
}

test("validates report identity, required text, lengths and actual categories", () => {
  validateFeedbackText(input());
  for (const patch of [{ title: " " }, { description: "" }, { title: "x".repeat(121) }, { description: "x".repeat(4001) }, { reporterId: "other/owner" }, { category: "__proto__" }, { tab: "toString" }]) {
    assert.throws(() => validateFeedbackText({ ...input(), ...patch } as ReturnType<typeof input>));
  }
  assertReviewInput("resolved", "已修正");
  assert.throws(() => assertReviewInput("__proto__", "")); assert.throws(() => assertReviewInput("new", "x".repeat(2001)));
});

test("recognizes PNG, JPG and WebP bytes and rejects renamed documents and type mismatches", async () => {
  assert.equal(await detectImageMime(attachment().file), "image/png");
  assert.equal(await detectImageMime(new Blob([new Uint8Array([255, 216, 255, 0])], { type: "image/jpeg" })), "image/jpeg");
  assert.equal(await detectImageMime(new Blob([new TextEncoder().encode("RIFFxxxxWEBP")], { type: "image/webp" })), "image/webp");
  await assert.rejects(detectImageMime(new Blob(["%PDF screenshot"], { type: "image/png" })), /有效/);
  await assert.rejects(detectImageMime(new Blob([png], { type: "image/jpeg" })), /有效/);
  await assert.rejects(detectImageMime(new Blob([])), /內容/);
  await assert.rejects(detectImageMime(new Blob([new Uint8Array(MAX_FEEDBACK_IMAGE_BYTES + 1)])), /10 MB/);
});

test("reserves canonical owner/report/image paths with count and duplicate validation", async () => {
  const images = await prepareFeedbackImages(id, owner, [attachment()]);
  assert.equal(images[0].path, `${owner}/${id}/${imageId}.png`);
  assert.equal(feedbackExportPath(record({ ...input(), screenshots: images }), images[0]), `screenshots/${id}/${imageId}.png`);
  assert.throws(() => feedbackExportPath(record({ ...input(), screenshots: images }), { ...images[0], path: "../../private.png" }));
  await assert.rejects(prepareFeedbackImages(id, owner, [attachment(), attachment()]), /重複/);
  await assert.rejects(prepareFeedbackImages(id, owner, Array.from({ length: 6 }, () => ({ ...attachment(), id: crypto.randomUUID() }))), /5 張/);
});

test("an invalid whole batch is rejected before any cloud write", async () => {
  const f = fixture();
  await assert.rejects(f.repository.submit(input(), [attachment(), { id: crypto.randomUUID(), file: new File(["bad"], "fake.png", { type: "image/png" }) }], () => {}));
  assert.deepEqual(f.log, []); assert.equal(f.rows.size, 0);
});

test("submits only after all images finish, without exposing incomplete reports", async () => {
  const f = fixture(); const result = await f.repository.submit(input(), [attachment()], () => {});
  assert.equal(result.isSubmitted, true); assert.deepEqual(f.log, ["create", "upload", "finalize"]);
  assert.equal((await f.repository.listReports()).length, 1); assert.equal(f.images.size, 1);
});

test("an upload error physically cleans images before abandoning the draft", async () => {
  const f = fixture(); const upload = f.adapter.uploadImage;
  f.adapter.uploadImage = async (image, file) => { await upload(image, file); throw new Error("connection failed after commit"); };
  await assert.rejects(f.repository.submit(input(), [attachment()], () => {}), /connection failed/);
  assert.deepEqual(f.log, ["create", "upload", "remove", "abandon"]); assert.equal(f.rows.size, 0); assert.equal(f.images.size, 0);
});

test("failed cleanup is recoverable; retry cleans the old draft before one successful submission", async () => {
  const f = fixture(); const upload = f.adapter.uploadImage; const remove = f.adapter.removeImages;
  let offline = true;
  f.adapter.uploadImage = async (image, file) => { await upload(image, file); if (offline) throw new Error("offline"); };
  f.adapter.removeImages = async paths => { if (offline) throw new Error("cleanup offline"); await remove(paths); };
  await assert.rejects(f.repository.submit(input(), [attachment()], () => {}), /附件清理尚待重試/);
  assert.equal(f.rows.get(id)?.isSubmitted, false); assert.equal(f.images.size, 1);
  offline = false; const result = await f.repository.submit(input(), [attachment()], () => {});
  assert.equal(result.isSubmitted, true); assert.equal(f.rows.size, 1); assert.equal(f.images.size, 1);
  assert.equal(f.log.filter(event => event === "finalize").length, 1);
});

test("a lost final acknowledgement returns the committed report without deleting screenshots or duplicating", async () => {
  const f = fixture(); const finalize = f.adapter.submitDraft;
  f.adapter.submitDraft = async id => { await finalize(id); throw new Error("ack lost"); };
  const result = await f.repository.submit(input(), [attachment()], () => {});
  assert.equal(result.isSubmitted, true); assert.equal(f.rows.size, 1); assert.equal(f.images.size, 1);
  const retry = await f.repository.submit(input(), [attachment()], () => {});
  assert.equal(retry.id, result.id); assert.deepEqual(f.log, ["create", "upload", "finalize"]);
});

test("JSONB property order does not break idempotent retries", async () => {
  const screenshots = await prepareFeedbackImages(id, owner, [attachment()]);
  const draft = { ...input(), screenshots }; const report = record(draft);
  report.screenshots = screenshots.map(image => ({ size: image.size, path: image.path, name: image.name, mime: image.mime, id: image.id }));
  assert.equal(feedbackMatchesDraft(report, draft), true);
});

test("account or role changes stop finalization and never clean using the replacement identity", async () => {
  const f = fixture(); let valid = true;
  const guard = () => { if (!valid) throw new Error("scope changed"); };
  const upload = f.adapter.uploadImage;
  f.adapter.uploadImage = async (image, file) => { await upload(image, file); valid = false; };
  await assert.rejects(f.repository.submit(input(), [attachment()], guard), /scope changed/);
  assert.deepEqual(f.log, ["create", "upload"]); assert.equal(f.rows.get(id)?.isSubmitted, false);
});

test("filters combine search, status, owner and category without changing records", () => {
  const a = record({ ...input(), screenshots: [] }); const b = { ...a, id: crypto.randomUUID(), reporterId: "other", title: "Power tree", status: "resolved" as const, category: "bug" as const };
  const original = structuredClone([a, b]);
  assert.deepEqual(filterFeedbackReports([a, b], { query: "BOM", status: "new", owner, category: "ui" }), [a]);
  assert.deepEqual(filterFeedbackReports([a, b], { query: "", status: "resolved", owner, category: "all" }), []);
  assert.deepEqual([a, b], original);
  assert.match(feedbackDate("2026-10-13T00:00:00Z"), /08:00/);
});
