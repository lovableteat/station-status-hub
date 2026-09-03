import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_MEDIA_ACCEPT,
  validateDirectMessageFiles,
  getDirectMessageMimeType,
  getDirectMessageMediaKind,
  createDirectMessageMediaPath,
  getDirectMessagePreviewLabel,
} from "../src/components/collaboration/directMessageMedia.mjs";

const formats = [
  ["ppt", "application/vnd.ms-powerpoint"],
  [
    "pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  ["xls", "application/vnd.ms-excel"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
];
for (const [extension, mime] of formats) {
  test(`${extension}: native and Windows generic MIME use the same upload metadata and safe path`, () => {
    for (const type of [
      mime,
      "",
      "application/octet-stream",
      "application/zip",
      "application/vnd.ms-office",
    ]) {
      const file = {
        name: `中文 報告.${extension.toUpperCase()}`,
        size: 4096,
        type,
      };
      assert.equal(validateDirectMessageFiles([file]).error, null);
      assert.equal(getDirectMessageMimeType(file), mime);
      assert.equal(getDirectMessageMediaKind(file), "document");
      assert.equal(
        createDirectMessageMediaPath("thread", "user", "client", file, 0),
        `thread/user/client/0.${extension}`,
      );
      assert.ok(CHAT_MEDIA_ACCEPT.includes(`.${extension}`));
    }
  });
}
test("documents enforce type, filename, count and size before upload", () => {
  const file = {
    name: "report.xlsx",
    type: formats[3][1],
    size: 50 * 1024 * 1024,
  };
  assert.equal(validateDirectMessageFiles([file]).error, null);
  assert.match(
    validateDirectMessageFiles([{ ...file, size: file.size + 1 }]).error,
    /文件.*50 MB/,
  );
  assert.match(
    validateDirectMessageFiles([{ ...file, size: 0 }]).error,
    /空白檔案/,
  );
  assert.match(
    validateDirectMessageFiles(new Array(5).fill(file)).error,
    /最多只能選擇 4 個/,
  );
  for (const unsupported of [
    { ...file, name: "report.xlsm" },
    { ...file, name: "report.xlsx.exe" },
    { ...file, type: "application/x-msdownload" },
    { ...file, type: formats[1][1] },
    { ...file, name: "archive.zip", type: "application/zip" },
  ])
    assert.ok(validateDirectMessageFiles([unsupported]).error);
});
test("mixed messages preserve media behavior and label documents correctly", () => {
  const files = formats
    .slice(0, 2)
    .map(([ext, type]) => ({ name: `a.${ext}`, size: 10, type }));
  files.push(
    { name: "a.png", size: 10, type: "image/png" },
    { name: "a.mp4", size: 10, type: "video/mp4" },
  );
  assert.equal(validateDirectMessageFiles(files).error, null);
  assert.equal(
    getDirectMessagePreviewLabel("", [{ mediaKind: "document" }]),
    "傳送了文件",
  );
  assert.equal(getDirectMessagePreviewLabel("", files), "傳送了 4 個附件");
});
