import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { createAiPresentationBlob } from "./aiPresentationExport.ts";

test("PowerPoint export keeps the requested slide count, native text, and source notes", async () => {
  const draft = {
    title: "工作站工程驗證 & 維修",
    slides: [
      { title: "測試進度", bullets: ["完成 9 台", "進行中 26 台"], source: "週報.xlsx、會議紀錄.pdf", notes: "對照 A & B <待確認>" },
      { title: "異常概況", bullets: ["異常 1 台"], source: "問題清單.csv" },
      { title: "下一步", bullets: ["確認異常重現條件"], source: "" },
    ],
  };
  const blob = await createAiPresentationBlob(draft);
  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  const archive = await JSZip.loadAsync(await blob.arrayBuffer());
  const slides = archive.file(/^ppt\/slides\/slide\d+\.xml$/);
  assert.equal(slides.length, 3);

  const cover = await archive.file("ppt/slides/slide1.xml").async("string");
  assert.match(cover, /<a:t>工作站工程驗證 &amp; 維修<\/a:t>/);
  assert.match(cover, /<a:t>測試進度<\/a:t>/);
  assert.match(cover, /<a:t>完成 9 台<\/a:t>/);
  assert.match(cover, /<a:t>進行中 26 台<\/a:t>/);
  assert.match(cover, /<a:buChar/);
  assert.match(cover, /週報\.xlsx、會議紀錄\.pdf/);
  assert.doesNotMatch(cover, /<p:pic>/);

  const notes = await archive.file("ppt/notesSlides/notesSlide1.xml").async("string");
  assert.match(notes, /對照 A &amp; B &lt;待確認&gt;/);
  assert.match(notes, /週報\.xlsx、會議紀錄\.pdf/);
});
