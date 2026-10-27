import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import type { TestPlanEntry, TestPlanFileRecord, TestPlanFolder } from "../../src/components/test-plan/types.ts";

const transfers = await import("../../src/components/test-plan/core/zipDownload.ts");
const file = (id: string, originalName: string, folderId: string | null = null) => ({ id, originalName, folderId, spaceId: "s", fileSize: 3 } as TestPlanFileRecord);
const folder = (id: string, name: string, parentId: string | null = null) => ({ id, name, parentId, spaceId: "s" } as TestPlanFolder);
const selected = (value: TestPlanFileRecord | TestPlanFolder): TestPlanEntry => ({ ...value, kind: "originalName" in value ? "file" : "folder" } as TestPlanEntry);
function sink() {
  const chunks: Uint8Array[] = [];
  return { chunks, closed: false, aborted: false, write(chunk: Uint8Array) { chunks.push(chunk.slice()); }, close() { this.closed = true; }, abort() { this.aborted = true; } };
}

test("folder selections keep hierarchy, empty folders and each same-name file exactly once", () => {
  assert.equal(typeof transfers.collectDownloadEntries, "function");
  const folders = [folder("a", "Release"), folder("b", "Docs", "a"), folder("c", "Empty", "a")];
  const files = [file("1", "BOM.xlsx", "b"), file("2", "bom.xlsx", "b"), file("3", "../escape.txt")];
  const entries = transfers.collectDownloadEntries([selected(folders[0]), selected(folders[1]), selected(files[0]), selected(files[2])], folders, files);
  assert.deepEqual(entries.map(entry => entry.path), ["Release/", "Release/Docs/", "Release/Docs/BOM.xlsx", "Release/Docs/bom (1).xlsx", "Release/Empty/", ".._escape.txt"]);
  assert.deepEqual(entries.filter(entry => entry.file).map(entry => entry.file!.id).sort(), ["1", "2", "3"]);
});

test("one streamed ZIP contains the exact selected bytes, UTF-8 names and progress", async () => {
  assert.equal(typeof transfers.downloadZipWithProgress, "function");
  const output = sink();
  const progress: number[] = [];
  const entries = [{ path: "資料夾/" }, { path: "資料夾/甲.xlsx", file: file("1", "甲.xlsx") }, { path: "same.xlsx", file: file("2", "same.xlsx") }];
  const outcome = await transfers.downloadZipWithProgress({
    fileName: "download.zip", entries, openSink: async () => output,
    resolveUrl: async target => `https://storage.test/${target.id}`,
    fallback: async () => { throw new Error("must stream"); },
    fetchImpl: (async url => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([Number(String(url).slice(-1)), 7])); controller.enqueue(new Uint8Array([9])); controller.close(); } }))) as typeof fetch,
    onProgress: loaded => progress.push(loaded),
  });
  assert.equal(outcome, "saved");
  assert.equal(output.closed, true);
  assert.equal(output.aborted, false);
  const zip = await JSZip.loadAsync(Buffer.concat(output.chunks), { checkCRC32: true });
  assert.equal(zip.files["資料夾/"].dir, true);
  assert.deepEqual([...await zip.file("資料夾/甲.xlsx")!.async("uint8array")], [1, 7, 9]);
  assert.deepEqual([...await zip.file("same.xlsx")!.async("uint8array")], [2, 7, 9]);
  assert.equal(progress.at(-1), 6);
  assert.ok(progress.includes(2));
});

test("ZIP source reads respect the disk sink backpressure", async () => {
  const chunk = new Uint8Array(64 * 1024);
  let produced = 0;
  let written = 0;
  let closed = false;
  const outcome = await transfers.downloadZipWithProgress({
    fileName: "download.zip", entries: [{ path: "large.bin", file: { ...file("1", "large.bin"), fileSize: 32 * chunk.length } }],
    resolveUrl: async () => "https://storage.test/stream", fallback: async () => { throw new Error("must stream"); },
    fetchImpl: (async () => new Response(new ReadableStream({ pull(controller) { if (produced === 32) controller.close(); else { produced++; controller.enqueue(chunk); } } }))) as typeof fetch,
    openSink: async () => ({
      async write(bytes) { if (bytes.byteLength === chunk.length) { written++; assert.ok(produced <= written + 1, "source must not accumulate unread file bytes"); await Promise.resolve(); } },
      close() { closed = true; },
    }),
  });
  assert.equal(outcome, "saved");
  assert.equal(written, 32);
  assert.equal(closed, true);
});

test("small ZIPs fall back to one browser download when the save picker is unavailable", async () => {
  const originalDocument = globalThis.document;
  const originalCreateUrl = URL.createObjectURL;
  const originalTimeout = globalThis.setTimeout;
  let blob: Blob | undefined;
  let clicked = 0;
  const anchor = { href: "", download: "", click() { clicked++; }, remove() {} };
  try {
    globalThis.document = { createElement: () => anchor, body: { appendChild() {} } } as unknown as Document;
    URL.createObjectURL = value => { blob = value as Blob; return "blob:zip-test"; };
    globalThis.setTimeout = (() => 0) as unknown as typeof setTimeout;
    assert.equal(await transfers.downloadZipWithProgress({
      fileName: "download.zip", entries: [{ path: "a.txt", file: file("1", "a.txt") }, { path: "b.txt", file: file("2", "b.txt") }],
      resolveUrl: async () => null, fallback: async target => new Blob([target.id]),
    }), "saved");
    assert.equal(clicked, 1);
    assert.equal(anchor.download, "download.zip");
    const zip = await JSZip.loadAsync(await blob!.arrayBuffer(), { checkCRC32: true });
    assert.equal(await zip.file("a.txt")!.async("string"), "1");
    assert.equal(await zip.file("b.txt")!.async("string"), "2");
  } finally {
    globalThis.document = originalDocument;
    URL.createObjectURL = originalCreateUrl;
    globalThis.setTimeout = originalTimeout;
  }
});

test("ZIP cancellation stops remaining files and discards the partial archive", async () => {
  assert.equal(typeof transfers.downloadZipWithProgress, "function");
  const output = sink();
  const controller = new AbortController();
  let requests = 0;
  const outcome = await transfers.downloadZipWithProgress({
    fileName: "download.zip", entries: [file("1", "a"), file("2", "b")].map(target => ({ path: target.originalName, file: target })),
    signal: controller.signal, openSink: async () => output,
    resolveUrl: async () => { requests++; return null; }, fallback: async () => new Blob(["abc"]),
    onProgress: loaded => { if (loaded) controller.abort(); },
  });
  assert.equal(outcome, "cancelled");
  assert.equal(requests, 1);
  assert.equal(output.aborted, true);
  assert.equal(output.closed, false);
});

test("ZIP source and destination errors abort the archive instead of reporting a partial success", async () => {
  assert.equal(typeof transfers.downloadZipWithProgress, "function");
  for (const destinationFails of [false, true]) {
    const output = sink();
    if (destinationFails) output.write = () => { throw new Error("disk full"); };
    await assert.rejects(transfers.downloadZipWithProgress({
      fileName: "download.zip", entries: [{ path: "a", file: file("1", "a") }], openSink: async () => output,
      resolveUrl: async () => "https://storage.test/file", fallback: async () => new Blob(),
      fetchImpl: (async () => new Response(null, { status: 403 })) as typeof fetch,
    }), destinationFails ? /disk full/ : /403/);
    assert.equal(output.aborted, true);
    assert.equal(output.closed, false);
  }
});

test("ZIP limits fail before opening a destination or requesting source bytes", async () => {
  let opened = 0;
  let requested = 0;
  for (const entries of [
    [{ path: "large.bin", file: { ...file("1", "large.bin"), fileSize: 4 * 1024 ** 3 } }],
    Array.from({ length: 65535 }, (_, index) => ({ path: `${index}/` })),
  ]) {
    await assert.rejects(transfers.downloadZipWithProgress({
      fileName: "download.zip", entries, openSink: async () => { opened++; return sink(); },
      resolveUrl: async () => { requested++; return null; }, fallback: async () => new Blob(),
    }), /4 GiB/);
  }
  assert.equal(opened, 0);
  assert.equal(requested, 0);
});

test("browsers without disk streaming reject large ZIPs before fetching, and a cancelled save picker does no work", async () => {
  let requested = 0;
  const options = {
    fileName: "download.zip", entries: [{ path: "large.bin", file: { ...file("1", "large.bin"), fileSize: 129 * 1024 ** 2 } }],
    resolveUrl: async () => { requested++; return null; }, fallback: async () => new Blob(),
  };
  await assert.rejects(transfers.downloadZipWithProgress(options), /128 MiB/);
  assert.equal(await transfers.downloadZipWithProgress({ ...options, openSink: async () => "cancelled" }), "cancelled");
  assert.equal(requested, 0);
});

test("default batch download never requests broad directory access and keeps single-file streaming", async () => {
  const workspace = await readFile(new URL("../../src/components/test-plan/TestPlanWorkspace.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(workspace, /pickDownloadDirectory|openDirectorySink/);
  assert.match(workspace, /downloadZipWithProgress/);
  assert.match(workspace, /void handleDownload\(entries\[0\]\)/);
});
