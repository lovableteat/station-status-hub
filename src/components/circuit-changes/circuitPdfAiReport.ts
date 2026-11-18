/**
 * The comparison report of one baseline / working PDF pair (2026-11-19, 「我要的是能出報告」): what every page turned
 * out to be, every difference with its evidence and the reviewer's judgement, and what could not be compared and why.
 * Pure rows here; circuitPdfAiReportExport.ts turns them into the Excel file with the marked drawings.
 */
import { CIRCUIT_AI_CATEGORY_LABELS, isCircuitReportIdentical, type CircuitPdfAiReviewReport } from "./circuitPdfAiReview";

export interface CircuitAiReportPage {
  workingPage: number;
  officialPage: number | null;
  /** The current saved result of the page, when there is one. */
  report?: CircuitPdfAiReviewReport;
  /** Why the page has no result, when the last run failed on it. */
  error?: string;
}
export type CircuitAiPageOutcome = "identical" | "common" | "different" | "clean" | "failed" | "unmatched" | "pending";

const CHECK_LABELS = { "possible-issue": "有待核對", "no-visible-issue": "未見差異", unverifiable: "證據不足" };
const PRIORITY_LABELS = { high: "優先核對", medium: "需要注意", low: "一般提醒" };
const DECISION_LABELS = { pending: "未判讀", confirmed: "已確認", dismissed: "不採用" };
const taipei = (value: string) => { const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }) : ""; };

/** What a page turned out to be, in the words used on its chip and in the report. */
export function describeCircuitAiPage(page: CircuitAiReportPage): { outcome: CircuitAiPageOutcome; label: string; method: string } {
  if (page.officialPage === null) return { outcome: "unmatched", label: "無對應頁，沒有比對", method: "" };
  const report = page.report;
  if (!report) return page.error ? { outcome: "failed", label: "比對失敗", method: "" } : { outcome: "pending", label: "尚未比對", method: "" };
  const method = report.source === "local" ? "本機比對" : report.local ? "本機比對＋AI" : "AI";
  if (isCircuitReportIdentical(report)) return { outcome: "identical", label: "相同", method };
  const count = report.findings.length + (report.local?.omitted ?? 0);
  // Only changes that many sheets share at the same frame spot (the title block): listed, but not this page's own change.
  if (report.source === "local" && report.local && report.local.common > 0 && report.local.common === count) return { outcome: "common", label: `只有多頁共通的變更（${count} 處）`, method };
  if (!count) return { outcome: "clean", label: report.checks.some(check => check.state === "unverifiable") ? "未列出差異（有項目證據不足）" : "未見差異", method };
  return { outcome: "different", label: `${count} 處不同`, method };
}

export interface CircuitAiReportData {
  title: string;
  summary: Array<[string, string | number]>;
  pageHeader: string[]; pageRows: Array<Array<string | number>>;
  findingHeader: string[]; findingRows: Array<Array<string | number>>;
  /** Working pages with at least one difference marked on a drawing, in page order. */
  markedPages: number[];
  totals: Record<CircuitAiPageOutcome, number> & { findings: number; pendingDecisions: number; inputTokens: number; outputTokens: number };
}

export function buildCircuitAiReportData({ officialName, workingName, pages, generatedBy, generatedAt, note }: {
  officialName: string; workingName: string; pages: readonly CircuitAiReportPage[]; generatedBy: string; generatedAt: string;
  /** Why the last run stopped early, when it did. */
  note?: string;
}): CircuitAiReportData {
  const totals = { identical: 0, common: 0, different: 0, clean: 0, failed: 0, unmatched: 0, pending: 0, findings: 0, pendingDecisions: 0, inputTokens: 0, outputTokens: 0 };
  const categories = { connectivity: 0, "net-name": 0, "label-name": 0 }, decisions = { pending: 0, confirmed: 0, dismissed: 0 };
  const models = new Set<string>();
  const pageRows: CircuitAiReportData["pageRows"] = [], findingRows: CircuitAiReportData["findingRows"] = [], markedPages: number[] = [];
  for (const page of [...pages].sort((left, right) => left.workingPage - right.workingPage)) {
    const { outcome, label, method } = describeCircuitAiPage(page), report = page.report;
    totals[outcome]++;
    const state = (category: keyof typeof CIRCUIT_AI_CATEGORY_LABELS) => { const check = report?.checks.find(item => item.category === category); return check ? `${CHECK_LABELS[check.state]}：${check.note}` : ""; };
    pageRows.push([page.workingPage, page.officialPage ?? "無", label, method, report?.summary ?? "", state("connectivity"), state("net-name"), state("label-name"),
      report ? report.findings.length : "", report?.modelLabel ?? "", report ? taipei(report.createdAt) : "", report?.generatedBy ?? "", page.error ?? ""]);
    if (!report) continue;
    models.add(report.modelLabel);
    totals.inputTokens += report.usage?.input ?? 0; totals.outputTokens += report.usage?.output ?? 0;
    if (report.findings.some(finding => finding.decision !== "dismissed" && (finding.officialBox || finding.workingBox))) markedPages.push(page.workingPage);
    for (const finding of report.findings) {
      totals.findings++; categories[finding.category]++; decisions[finding.decision]++;
      findingRows.push([page.workingPage, page.officialPage ?? "", finding.id, CIRCUIT_AI_CATEGORY_LABELS[finding.category], PRIORITY_LABELS[finding.priority], finding.certainty === "unclear" ? "證據不足" : "疑似問題",
        finding.title, finding.location, finding.officialEvidence, finding.workingEvidence, finding.suggestion, method,
        DECISION_LABELS[finding.decision], finding.reviewNote, finding.reviewedBy, finding.reviewedAt ? taipei(finding.reviewedAt) : ""]);
    }
  }
  totals.pendingDecisions = decisions.pending;
  const compared = totals.identical + totals.common + totals.different + totals.clean;
  const summary: CircuitAiReportData["summary"] = [
    ["基準版", officialName], ["比對版", workingName], ["報告產生時間（台北）", taipei(generatedAt)], ["產生者", generatedBy],
    ["比對範圍", `比對版 ${pages.length} 頁`], ["已比對", `${compared} 頁`],
    ["相同", `${totals.identical} 頁`], ["只有多頁共通的變更（標題欄等）", `${totals.common} 頁`], ["有差異", `${totals.different} 頁`], ["未見差異（AI 判讀）", `${totals.clean} 頁`],
    ["比對失敗", `${totals.failed} 頁`], ["尚未比對", `${totals.pending} 頁`], ["無對應頁（沒有比對）", `${totals.unmatched} 頁`],
    ["差異總數", `${totals.findings} 處（連接性 ${categories.connectivity}、Net 名稱 ${categories["net-name"]}、元件／接腳名稱 ${categories["label-name"]}）`],
    ["人工判讀", `未判讀 ${decisions.pending}、已確認 ${decisions.confirmed}、不採用 ${decisions.dismissed}`],
    ["比對方式", [...models].join("、") || "尚無結果"],
    ["AI token 用量", totals.inputTokens + totals.outputTokens ? `輸入 ${totals.inputTokens.toLocaleString()}、輸出 ${totals.outputTokens.toLocaleString()}（服務商回報的數字；相同的頁沒有送 AI）` : "沒有使用 AI，或服務商沒有回報用量"],
    ...(note ? [["本次比對提早停止", note] as [string, string]] : []),
    ["說明", "「本機比對」是在瀏覽器裡把兩版的文字逐一比對、圖形疊合比對，結果是確定的差異，不是 AI 判斷。這份報告只代表畫面上看得到的不同，不是電氣驗證；正式結論仍須人工 Review。"],
  ];
  return { title: `線路圖新舊版比對報告：${workingName}`, summary,
    pageHeader: ["比對版頁", "基準版頁", "結果", "方式", "摘要", "連接性", "Net 名稱", "元件／接腳名稱", "差異數", "模型", "比對時間（台北）", "操作者", "失敗原因"], pageRows,
    findingHeader: ["比對版頁", "基準版頁", "編號", "類別", "優先", "確定程度", "差異", "位置", "基準版證據", "比對版證據", "核對建議", "方式", "人工判讀", "人工備註", "判讀人", "判讀時間（台北）"], findingRows,
    markedPages, totals };
}
