import assert from "node:assert/strict";
import test from "node:test";

const module = await import(new URL("../../src/components/test-plan/core/dragDownload.ts", import.meta.url).href);
const { chooseDragDownloadUrl, createBlobUrlCache, describeDownloadUrl, DRAG_BLOB_LIMIT } = module as typeof import("../../src/components/test-plan/core/dragDownload.ts");

const signed = "https://proj.supabase.co/storage/v1/object/sign/test-plan-files/a?token=abc";

test("DownloadURL descriptors keep three colon-separated fields", () => {
  assert.equal(describeDownloadUrl("text/plain", "notes.txt", "blob:https://x/1"), "text/plain:notes.txt:blob:https://x/1");
  assert.equal(describeDownloadUrl(null, "a:b/c\\d.xlsx", signed), `application/octet-stream:a_b_c_d.xlsx:${signed}`);
  assert.equal(describeDownloadUrl("", "  ", signed).split(":")[1], "download");
});

test("the drag address prefers page-held bytes and otherwise carries the raw link", () => {
  assert.equal(chooseDragDownloadUrl({ blobUrl: "blob:https://site/1", sourceUrl: signed }), "blob:https://site/1");
  assert.equal(chooseDragDownloadUrl({ sourceUrl: signed }), signed);
  assert.equal(chooseDragDownloadUrl({ sourceUrl: "blob:https://site/demo" }), "blob:https://site/demo");
  assert.equal(chooseDragDownloadUrl({ sourceUrl: null }), null);
  assert.ok(DRAG_BLOB_LIMIT >= 64 * 1024 * 1024);
});

test("the blob cache evicts least recently used entries by bytes and revokes what it drops", () => {
  const revoked: string[] = [];
  const cache = createBlobUrlCache(100, (url) => revoked.push(url));
  cache.set("a", "blob:a", 40);
  cache.set("b", "blob:b", 40);
  assert.equal(cache.get("a"), "blob:a");
  cache.set("c", "blob:c", 40);
  assert.deepEqual(revoked, ["blob:b"]);
  assert.equal(cache.get("b"), null);
  assert.equal(cache.bytes, 80);
  cache.set("a", "blob:a2", 10);
  assert.deepEqual(revoked, ["blob:b", "blob:a"]);
  assert.equal(cache.get("a"), "blob:a2");
  cache.set("huge", "blob:huge", 500);
  assert.equal(cache.get("huge"), "blob:huge", "an oversized entry still replaces everything else");
  assert.equal(cache.count, 1);
  cache.clear();
  assert.equal(cache.bytes, 0);
  assert.ok(revoked.includes("blob:huge"));
});
