import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { loader } = require("../../../tests/support/renderHarness.cjs");
const { pdfTitleTextBounds, getPdfTitleCrop, getPdfInkBounds } = loader({
  transform: source => source + "\nexport { pdfTitleTextBounds, getPdfTitleCrop, getPdfInkBounds };",
})("src/components/material-requests/bomPagePdfAiService.ts");
const plain = value => JSON.parse(JSON.stringify(value));

test("a tiny lower-right Title cue tightens the crop without copying unrelated schematic labels", () => {
  const crop = getPdfTitleCrop(600, 400, [
    { left: 20, top: 20, width: 100, height: 12, text: "Title: upper-left trap" },
    { left: 330, top: 295, width: 100, height: 5, text: "blue schematic legend" },
    { left: 484, top: 375, width: 100, height: 4, text: "Title: CPU POWER" },
  ]);
  assert.deepEqual(plain(crop), { left: 476, top: 363, width: 124, height: 37 });
  assert.ok(crop.left > 330 && crop.top > 300);
  assert.deepEqual(plain(getPdfTitleCrop(600, 400, [])), { left: 300, top: 280, width: 300, height: 120 });
  assert.deepEqual(plain(getPdfTitleCrop(600, 400, [{ left: 900, top: 700, width: 50, height: 4, text: "Title: off page" }])),
    { left: 300, top: 280, width: 300, height: 120 });
});

test("text rectangles use PDF viewport rotation rather than an unrotated baseline", () => {
  const item = { str: "Title: CPU POWER", transform: [4, 0, 0, 4, 484, 21], width: 80, height: 4 };
  assert.deepEqual(plain(pdfTitleTextBounds(item, { convertToViewportPoint: (x, y) => [x, 400 - y] })),
    { left: 484, top: 375, width: 80, height: 4, text: item.str });
  assert.deepEqual(plain(pdfTitleTextBounds(item, { convertToViewportPoint: (x, y) => [y, x] })),
    { left: 21, top: 484, width: 4, height: 80, text: item.str });
});

test("raster crops trim white or transparent margins while retaining coloured title content", () => {
  const width = 100, height = 80, pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  assert.equal(getPdfInkBounds(pixels, width, height), null);
  for (let y = 65; y <= 74; y++) for (let x = 70; x <= 90; x++) {
    pixels.set([0, 0, 255, 255], (y * width + x) * 4);
  }
  pixels.set([0, 0, 0, 0], 0);
  assert.deepEqual(plain(getPdfInkBounds(pixels, width, height)), { left: 70, top: 65, width: 21, height: 10 });
});

test("PDF inspection and full recognition reject page 501 before rendering or invoking a provider", async () => {
  let destroyed = 0;
  const service = loader({ globals: { TextDecoder }, mocks: {
    "pdfjs-dist": { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 501 }), destroy: async () => { destroyed++; } }) },
    "../comparison/pdfResources": {},
    "pdfjs-dist/build/pdf.worker.min.mjs?url": { default: "qa-worker" },
  } })("src/components/material-requests/bomPagePdfAiService.ts");
  const data = new TextEncoder().encode("%PDF-1.7\nQA");
  const file = { name: "501-pages.pdf", type: "application/pdf", size: data.length,
    slice: () => ({ arrayBuffer: async () => data.buffer }), arrayBuffer: async () => data.buffer };
  const signal = new AbortController().signal;
  await assert.rejects(service.inspectPdfTitlePage(file, signal, 500), /501.*500/);
  await assert.rejects(service.readPdfPageTitles(file, {}, signal, () => { throw new Error("May not render"); }, 500), /501.*500/);
  assert.equal(destroyed, 2);
});
