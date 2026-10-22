import assert from "node:assert/strict";
import test from "node:test";

const module = await import(new URL("../../src/components/test-plan/core/dragDownload.ts", import.meta.url).href);
const { buildProxyDownloadUrl, chooseDragDownloadUrl, createBlobUrlCache, describeDownloadUrl, DRAG_BLOB_LIMIT } = module as typeof import("../../src/components/test-plan/core/dragDownload.ts");

const proxy = { pageOrigin: "https://lovableteat.github.io", base: "/station-status-hub/" };
const signed = "https://proj.supabase.co/storage/v1/object/sign/test-plan-files/a?token=abc";

test("DownloadURL descriptors keep three colon-separated fields", () => {
  assert.equal(describeDownloadUrl("text/plain", "notes.txt", "blob:https://x/1"), "text/plain:notes.txt:blob:https://x/1");
  assert.equal(describeDownloadUrl(null, "a:b/c\\d.xlsx", signed), `application/octet-stream:a_b_c_d.xlsx:${signed}`);
  assert.equal(describeDownloadUrl("", "  ", signed).split(":")[1], "download");
});

test("the drag address prefers page-held bytes, then the same-origin proxy, then the raw link", () => {
  const common = { fileId: "f1", fileName: "機櫃配置.xlsx", mimeType: "application/vnd.ms-excel", size: 1234 };
  assert.equal(chooseDragDownloadUrl({ ...common, blobUrl: "blob:https://site/1", sourceUrl: signed, proxy }), "blob:https://site/1");
  const proxied = chooseDragDownloadUrl({ ...common, sourceUrl: signed, proxy });
  assert.ok(proxied?.startsWith("https://lovableteat.github.io/station-status-hub/__file-library__/download/f1/"));
  const url = new URL(proxied!);
  assert.equal(url.searchParams.get("u"), signed);
  assert.equal(url.searchParams.get("n"), "機櫃配置.xlsx");
  assert.equal(url.searchParams.get("t"), "application/vnd.ms-excel");
  assert.equal(url.searchParams.get("s"), "1234");
  assert.equal(chooseDragDownloadUrl({ ...common, sourceUrl: signed, proxy: null }), signed);
  assert.equal(chooseDragDownloadUrl({ ...common, sourceUrl: "blob:https://site/demo", proxy }), "blob:https://site/demo");
  assert.equal(chooseDragDownloadUrl({ ...common, sourceUrl: null, proxy }), null);
  assert.equal(buildProxyDownloadUrl({ ...common, ...proxy, base: "/station-status-hub", sourceUrl: signed }).split("?")[0], proxied!.split("?")[0]);
  assert.ok(DRAG_BLOB_LIMIT > 0);
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
