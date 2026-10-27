import assert from "node:assert/strict";
import test from "node:test";

const transfers = await import(new URL("../../src/components/test-plan/core/transfers.ts", import.meta.url).href);
const { downloadWithProgress, formatTransferRate, transferPercent } = transfers as typeof import("../../src/components/test-plan/core/transfers.ts");

function chunkedResponse(chunks: Uint8Array[], contentLength?: number) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: contentLength === undefined ? {} : { "content-length": String(contentLength) } });
}

function memorySink() {
  const written: number[] = [];
  const sink = {
    written,
    closed: false,
    aborted: false,
    write(chunk: Uint8Array) { written.push(chunk.byteLength); },
    close() { sink.closed = true; },
    abort() { sink.aborted = true; },
  };
  return sink;
}

test("transfer percentages stay whole, bounded, and zero while the size is unknown", () => {
  assert.equal(transferPercent(0, 100), 0);
  assert.equal(transferPercent(33, 100), 33);
  assert.equal(transferPercent(999, 100), 100);
  assert.equal(transferPercent(50, 0), 0);
  assert.equal(transferPercent(Number.NaN, 10), 0);
  assert.equal(transferPercent(1, 3), 33);
  assert.equal(formatTransferRate(0), "");
  assert.match(formatTransferRate(2.5 * 1024 * 1024), /\/s$/);
});

test("streams a signed link to the sink and reports every chunk against the content length", async () => {
  const sink = memorySink();
  const progress: Array<[number, number]> = [];
  const outcome = await downloadWithProgress({
    fileName: "DA-12949.pdf",
    expectedSize: 1,
    resolveUrl: async () => "https://storage.test/signed",
    fallback: async () => { throw new Error("fallback must not run when a link exists"); },
    onProgress: (loaded, total) => progress.push([loaded, total]),
    openSink: async () => sink,
    fetchImpl: (async () => chunkedResponse([new Uint8Array(40), new Uint8Array(60)], 100)) as typeof fetch,
  });
  assert.equal(outcome, "saved");
  assert.deepEqual(sink.written, [40, 60]);
  assert.equal(sink.closed, true);
  assert.deepEqual(progress, [[0, 100], [40, 100], [100, 100], [100, 100]]);
});

test("grows the total when the link sends more than announced and uses the blob fallback without a link", async () => {
  const sink = memorySink();
  const progress: Array<[number, number]> = [];
  await downloadWithProgress({
    fileName: "x.bin", expectedSize: 10,
    resolveUrl: async () => "https://storage.test/signed",
    fallback: async () => new Blob([]),
    onProgress: (loaded, total) => progress.push([loaded, total]),
    openSink: async () => sink,
    fetchImpl: (async () => chunkedResponse([new Uint8Array(30)])) as typeof fetch,
  });
  assert.deepEqual(progress.at(-1), [30, 30]);

  const fallbackSink = memorySink();
  const fallbackProgress: Array<[number, number]> = [];
  const outcome = await downloadWithProgress({
    fileName: "y.bin",
    resolveUrl: async () => null,
    fallback: async () => new Blob([new Uint8Array(12)]),
    onProgress: (loaded, total) => fallbackProgress.push([loaded, total]),
    openSink: async () => fallbackSink,
  });
  assert.equal(outcome, "saved");
  assert.deepEqual(fallbackSink.written, [12]);
  assert.deepEqual(fallbackProgress, [[0, 12], [12, 12]]);
});

test("a cancelled save dialog or an aborted stream never leaves a half-written file", async () => {
  assert.equal(await downloadWithProgress({
    fileName: "z.bin", resolveUrl: async () => "https://storage.test/signed", fallback: async () => new Blob([]), openSink: async () => "cancelled",
  }), "cancelled");

  const sink = memorySink();
  const controller = new AbortController();
  const outcome = await downloadWithProgress({
    fileName: "z.bin",
    resolveUrl: async () => "https://storage.test/signed",
    fallback: async () => new Blob([]),
    signal: controller.signal,
    openSink: async () => sink,
    fetchImpl: (async (_url: string, init?: RequestInit) => {
      controller.abort();
      const error = new Error("aborted");
      error.name = "AbortError";
      assert.equal(init?.signal, controller.signal);
      throw error;
    }) as unknown as typeof fetch,
  });
  assert.equal(outcome, "cancelled");
  assert.equal(sink.aborted, true);
  assert.equal(sink.closed, false);

  const failing = memorySink();
  await assert.rejects(downloadWithProgress({
    fileName: "w.bin", resolveUrl: async () => "https://storage.test/signed", fallback: async () => new Blob([]), openSink: async () => failing,
    fetchImpl: (async () => new Response(null, { status: 403 })) as typeof fetch,
  }), /403/);
  assert.equal(failing.aborted, true);
});

test("a 1 GiB single-file download keeps chunked disk writes without collecting a Blob", async () => {
  const chunk = new Uint8Array(1024 * 1024);
  const sink = memorySink();
  let remaining = 1024;
  const outcome = await downloadWithProgress({
    fileName: "1GiB.bin", expectedSize: 1024 ** 3,
    resolveUrl: async () => "https://storage.test/signed", fallback: async () => { throw new Error("must stream"); },
    openSink: async () => sink,
    fetchImpl: (async () => new Response(new ReadableStream({ pull(controller) { if (remaining-- > 0) controller.enqueue(chunk); else controller.close(); } }))) as typeof fetch,
  });
  assert.equal(outcome, "saved");
  assert.equal(sink.written.length, 1024);
  assert.equal(sink.written.reduce((total, length) => total + length, 0), 1024 ** 3);
  assert.equal(sink.closed, true);
});
