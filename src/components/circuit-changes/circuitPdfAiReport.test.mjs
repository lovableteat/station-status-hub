import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const { loader } = createRequire(import.meta.url)("../../../tests/support/renderHarness.cjs");
const load = loader();
const k = { ...load("src/components/circuit-changes/circuitPdfAiReport.ts"), ...load("src/components/circuit-changes/circuitPdfAiReview.ts") };
const plain = value => JSON.parse(JSON.stringify(value));
const side = (id, page) => ({ id, name: `${id}.pdf`, page });
const item = (str, x, y) => ({ str, x, y, width: 0.05, height: 0.012 });
const same = { textComparable: true, graphicsComparable: true, sizeChanged: false, textChanges: [], regions: [] };
const changed = { ...same, textChanges: [{ kind: "changed", before: item("USB_DP", 0.3, 0.2), after: item("USB_D_P", 0.3, 0.2) }], regions: [{ box: { x: 0.6, y: 0.6, width: 0.1, height: 0.02 }, base: false, work: true }] };
const local = (page, diff) => k.buildCircuitLocalReport({ official: side("official", page), working: side("working", page), userName: "RD", diff });

test("every page is described by what it turned out to be", () => {
  const describe = page => plain(k.describeCircuitAiPage(page));
  assert.deepEqual(describe({ workingPage: 1, officialPage: 1, report: local(1, same) }), { outcome: "identical", label: "相同", method: "本機比對" });
  assert.deepEqual(describe({ workingPage: 2, officialPage: 2, report: local(2, changed) }), { outcome: "different", label: "2 處不同", method: "本機比對" });
  assert.deepEqual(describe({ workingPage: 3, officialPage: 3, error: "AI 回應逾時" }), { outcome: "failed", label: "比對失敗", method: "" });
  assert.deepEqual(describe({ workingPage: 4, officialPage: 4 }), { outcome: "pending", label: "尚未比對", method: "" });
  assert.deepEqual(describe({ workingPage: 5, officialPage: null }), { outcome: "unmatched", label: "無對應頁，沒有比對", method: "" });
  const reviewed = { ...local(6, changed), source: "ai", modelLabel: "GPT＋本機比對", usage: { input: 5000, output: 400 } };
  assert.equal(describe({ workingPage: 6, officialPage: 6, report: reviewed }).method, "本機比對＋AI");
  // Only the title block changed (the same spot on most sheets): its own outcome, never "相同".
  const title = page => ({ kind: "changed", before: item(`SHEET ${page} OF 20`, 0.8, 0.95), after: item(`SHEET ${page + 1} OF 21`, 0.8, 0.95) });
  const diffs = Array.from({ length: 12 }, (_, index) => ({ ...same, textChanges: [title(index)] }));
  const common = load("src/components/circuit-changes/circuitPdfLocalDiff.ts").findCircuitCommonChanges(diffs.map(diff => diff.textChanges));
  const shared = k.buildCircuitLocalReport({ official: side("official", 7), working: side("working", 7), userName: "RD", diff: diffs[0], common });
  assert.deepEqual(describe({ workingPage: 7, officialPage: 7, report: shared }), { outcome: "common", label: "只有不算錯的地方（標題欄等 1 項）", method: "本機比對" });
  assert.equal(k.isCircuitReportIdentical(shared), false);
  // 2026-11-24 「右下角的我要換成我們公司跟我這個作者，但他也報錯?」: one page compared on its own (no other sheets to learn
  // the title block from) with a new company is not "different" either, and neither is it after an AI read it.
  const alone = k.buildCircuitLocalReport({ official: side("official", 8), working: side("working", 8), userName: "RD", diff: { ...same, textChanges: [{ kind: "changed", before: item("NVIDIA Corporation", 0.93, 0.935), after: item("PEGATRON Corp.", 0.93, 0.935) }] } });
  assert.equal(describe({ workingPage: 8, officialPage: 8, report: alone }).outcome, "common");
  assert.equal(describe({ workingPage: 8, officialPage: 8, report: { ...alone, source: "ai" } }).outcome, "common");
});

test("the report counts the pages, lists every difference with its judgement and names what was not compared", () => {
  const judged = local(2, changed);
  judged.findings[0] = { ...judged.findings[0], decision: "confirmed", reviewNote: "已核對", reviewedBy: "主管", reviewedAt: "2026-11-19T02:00:00.000Z" };
  const reviewed = { ...local(6, changed), source: "ai", modelLabel: "GPT＋本機比對", usage: { input: 5000, output: 400 } };
  const data = k.buildCircuitAiReportData({ officialName: "V1.pdf", workingName: "V2.pdf", generatedBy: "RD", generatedAt: "2026-11-19T03:00:00.000Z", note: "連續 3 頁比對失敗，已自動停止",
    pages: [{ workingPage: 6, officialPage: 6, report: reviewed }, { workingPage: 1, officialPage: 1, report: local(1, same) }, { workingPage: 2, officialPage: 2, report: judged },
      { workingPage: 3, officialPage: 3, error: "AI 回應逾時" }, { workingPage: 4, officialPage: 4 }, { workingPage: 5, officialPage: null }] });
  const summary = Object.fromEntries(plain(data.summary));
  assert.equal(summary["相同"], "1 頁"); assert.equal(summary["有差異"], "2 頁"); assert.equal(summary["比對失敗"], "1 頁"); assert.equal(summary["尚未比對"], "1 頁"); assert.equal(summary["無對應頁（沒有比對）"], "1 頁");
  assert.equal(summary["已比對"], "3 頁");
  assert.match(summary["差異總數"], /^4 處（連接性 2、Net 名稱 2、元件／接腳名稱 0）$/);
  assert.equal(summary["人工判讀"], "未判讀 3、已確認 1、不採用 0");
  assert.match(summary["AI token 用量"], /輸入 5,000、輸出 400/);
  assert.equal(summary["本次比對提早停止"], "連續 3 頁比對失敗，已自動停止");
  assert.deepEqual(plain(data.pageRows.map(row => [row[0], row[2]])), [[1, "相同"], [2, "2 處不同"], [3, "比對失敗"], [4, "尚未比對"], [5, "無對應頁，沒有比對"], [6, "2 處不同"]]);
  assert.equal(data.pageRows[2][12], "AI 回應逾時");
  assert.deepEqual(plain(data.findingRows[0].slice(0, 7)), [2, 2, "F1", "Net 名稱", "優先核對", "疑似問題", "字改了：USB_DP → USB_D_P"]);
  assert.deepEqual(plain(data.findingRows[0].slice(12, 15)), ["已確認", "已核對", "主管"]);
  assert.deepEqual(plain(data.markedPages), [2, 6]);
  assert.equal(data.findingHeader.length, data.findingRows[0].length);
  assert.equal(data.pageHeader.length, data.pageRows[0].length);
});

// 2026-11-24: a redrawn sheet counts only the parts and nets one side lacks.
test("a redrawn sheet is labelled by its parts and nets, not by every word that differs", () => {
  const redrawn = contentChanges => ({ textComparable: true, graphicsComparable: false, sizeChanged: false, textChanges: [], regions: [], redrawn: "layout", contentChanges, pages: { base: 7, work: 7 }, contents: { base: [], work: [] } });
  const value = { side: "work", token: "4.7K", type: "other", count: 1, item: item("4.7K", 0.4, 0.4) };
  const frame = { side: "work", token: "REV", type: "other", count: 1, item: item("REV", 0.9, 0.95), frame: true };
  const clean = local(7, redrawn([value, frame]));
  assert.deepEqual(plain(k.describeCircuitAiPage({ workingPage: 7, officialPage: 7, report: clean })), { outcome: "clean", label: "重畫的圖：零件和線路名稱都一樣", method: "本機比對" });
  const missing = local(7, redrawn([{ side: "base", token: "R99", type: "refdes", count: 1, item: item("R99", 0.5, 0.5) }, value, frame]));
  assert.deepEqual(plain(k.describeCircuitAiPage({ workingPage: 7, officialPage: 7, report: missing })), { outcome: "different", label: "重畫的圖：1 個零件或線路名稱不一樣", method: "本機比對" });
});
