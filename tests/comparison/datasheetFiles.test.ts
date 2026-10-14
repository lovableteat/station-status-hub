import assert from "node:assert/strict";
import test from "node:test";
import { DATASHEET_BATCH_LIMIT, DATASHEET_COUNT_LIMIT, DATASHEET_FILE_LIMIT, mergeDatasheetFiles } from "../../src/components/comparison/datasheetSelection.ts";

function pdf(path: string, size = 32, lastModified = 100): File {
  return { name: path.split("/").at(-1), webkitRelativePath: path, size, lastModified, arrayBuffer: () => { throw new Error("Selection must not read file bytes"); } } as unknown as File;
}

test("folder selection collects nested PDFs, skips unrelated files and preserves paths and previous selections", () => {
  const old = pdf("previous/existing.pdf");
  const top = pdf("Datasheets/IC.PDF");
  const nested = pdf("Datasheets/vendor/IC.pdf");
  const previous = Object.freeze([old]);
  const incoming = Object.freeze([top, pdf("Datasheets/readme.txt"), nested, pdf("Datasheets/photo.png")]);
  const result = mergeDatasheetFiles(previous, incoming);
  assert.deepEqual(result.files, [old, top, nested]);
  assert.equal(result.added, 2);
  assert.equal(result.skipped, 2);
  assert.equal(result.duplicates, 0);
  assert.equal(result.totalBytes, 96);
  assert.equal(result.files[2].webkitRelativePath, "Datasheets/vendor/IC.pdf");
  assert.deepEqual(previous, [old]);
});

test("reselecting the same folder deduplicates by case-insensitive path, size and modification time", () => {
  const old = pdf("Datasheets/vendor/IC.pdf");
  const result = mergeDatasheetFiles([old], [pdf("DATASHEETS/VENDOR/IC.PDF"), pdf("new.pdf"), pdf("NEW.PDF")]);
  assert.equal(result.files[0], old);
  assert.equal(result.files.length, 2);
  assert.equal(result.added, 1);
  assert.equal(result.duplicates, 2);
});

test("single-file fallback works without webkitRelativePath and preserves differently nested names", () => {
  const single = pdf("chip.pdf");
  Object.defineProperty(single, "webkitRelativePath", { value: "" });
  const result = mergeDatasheetFiles([single], [pdf("folder/chip.pdf")]);
  assert.equal(result.files.length, 2);
  assert.equal(result.added, 1);
  assert.equal(result.files[0], single);
  assert.equal(result.files[0].name, "chip.pdf");
  assert.equal(result.files[1].webkitRelativePath, "folder/chip.pdf");
});

test("same-path conflicts reject the entire addition instead of replacing previous or earlier new files", () => {
  const previous = [pdf("existing.pdf")];
  for (const conflict of [pdf("existing.pdf", 33), pdf("EXISTING.PDF", 32, 101)]) {
    assert.throws(() => mergeDatasheetFiles(previous, [pdf("new.pdf"), conflict]), /同一路徑.*existing\.pdf/i);
    assert.equal(previous.length, 1);
    assert.equal(previous[0].size, 32);
  }
  assert.throws(() => mergeDatasheetFiles(previous, [pdf("new.pdf"), pdf("new.pdf", 32, 101)]), /同一路徑/);
  assert.equal(previous.length, 1);
});

test("empty folders and mixed folders without a PDF fail without discarding an earlier selection", () => {
  const previous = [pdf("existing.pdf")];
  assert.throws(() => mergeDatasheetFiles(previous, []), /沒有選到 PDF/);
  assert.throws(() => mergeDatasheetFiles(previous, [pdf("notes.md"), pdf("sheet.xlsx")]), /沒有找到 PDF.*2 份/);
  assert.equal(previous.length, 1);
});

test("unsafe paths and invalid file metadata fail before any byte reads", () => {
  for (const path of ["../ic.pdf", "/ic.pdf", "C:/ic.pdf", "folder/../ic.pdf", "folder\\ic.pdf", "a//ic.pdf", "./ic.pdf", "a/ ic.pdf", "a/\u0000ic.pdf"]) {
    assert.throws(() => mergeDatasheetFiles([], [pdf(path)]), /不安全的檔案路徑/, path);
  }
  for (const size of [-1, 0, NaN, Infinity, 1.5]) assert.throws(() => mergeDatasheetFiles([], [pdf("ic.pdf", size)]), /大小無效|空的/);
  assert.throws(() => mergeDatasheetFiles([], [pdf("ic.pdf", 32, NaN)]), /修改時間無效/);
});

test("per-file and combined limits include previous PDFs and accept exact worker boundaries", () => {
  const first = pdf("first.pdf", DATASHEET_FILE_LIMIT);
  const second = pdf("second.pdf", DATASHEET_FILE_LIMIT);
  assert.equal(mergeDatasheetFiles([first], [second]).totalBytes, DATASHEET_BATCH_LIMIT);
  assert.throws(() => mergeDatasheetFiles([], [pdf("huge.pdf", DATASHEET_FILE_LIMIT + 1)]), /64 MiB/);
  assert.throws(() => mergeDatasheetFiles([first, second], [pdf("extra.pdf", 1)]), /128 MiB/);
  assert.equal(mergeDatasheetFiles([first, second], [pdf("FIRST.PDF", DATASHEET_FILE_LIMIT)]).files.length, 2);
});

test("1000 unique PDFs are allowed; ignored files and duplicates do not consume PDF slots", () => {
  const maximum = Array.from({ length: DATASHEET_COUNT_LIMIT }, (_, index) => pdf(`Datasheets/${index}.pdf`));
  const result = mergeDatasheetFiles([], [...maximum, pdf("readme.txt"), pdf("Datasheets/0.pdf")]);
  assert.equal(result.files.length, DATASHEET_COUNT_LIMIT);
  assert.equal(result.duplicates, 1);
  assert.equal(result.skipped, 1);
  assert.throws(() => mergeDatasheetFiles(maximum, [pdf("overflow.pdf")]), /1000 份/);
});

test("sequential library batches can hold a large folder without lifting per-file or count limits", () => {
  const options = { maxTotalBytes: DATASHEET_FILE_LIMIT * DATASHEET_COUNT_LIMIT };
  const files = Array.from({ length: DATASHEET_COUNT_LIMIT }, (_, index) => pdf(`${index}.pdf`, DATASHEET_FILE_LIMIT));
  const result = mergeDatasheetFiles([], files, options);
  assert.equal(result.totalBytes, options.maxTotalBytes);
  assert.equal(result.files.length, DATASHEET_COUNT_LIMIT);
  assert.ok(Number.isSafeInteger(result.totalBytes));
  assert.throws(() => mergeDatasheetFiles([], [pdf("too-large.pdf", DATASHEET_FILE_LIMIT + 1)], options), /64 MiB/);
  assert.throws(() => mergeDatasheetFiles(files, [pdf("overflow.pdf")], options), /1000 份/);
  assert.throws(() => mergeDatasheetFiles([], [pdf("one.pdf")], { maxTotalBytes: 16 }), /批次上限/);
  for (const maxTotalBytes of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => mergeDatasheetFiles([], [pdf("one.pdf")], { maxTotalBytes }), /批次大小上限無效/);
  }
});
