import { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { CIRCUIT_AI_CATEGORY_LABELS, type CircuitPdfAiReviewReport, type CircuitPdfReviewPage } from "./circuitPdfAiReview";
import { circuitPdfPageSize, renderCircuitPdfPage } from "./pdfRender";

type AnnotationProps = {
  report: CircuitPdfAiReviewReport;
  official: CircuitPdfReviewPage;
  working: CircuitPdfReviewPage;
  onFinding: (id: string) => void;
};

function AnnotatedPage({ source: { pdf, page }, side, report, onFinding }: {
  source: CircuitPdfReviewPage; side: "official" | "working";
  report: AnnotationProps["report"]; onFinding: AnnotationProps["onFinding"];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const label = side === "official" ? "基準版" : "比對版";
  const pending = report.findings.filter(item => item.decision !== "dismissed");
  const boxKey = side === "official" ? "officialBox" : "workingBox";
  const unlocated = pending.filter(item => !item[boxKey]).map(item => item.id);
  const unresolvedChecks = report.checks
    .filter(check => check.state === "unverifiable" && !report.findings.some(item => item.category === check.category))
    .map(check => CIRCUIT_AI_CATEGORY_LABELS[check.category]);

  useEffect(() => {
    const controller = new AbortController();
    const output = canvas.current;
    if (!output) return;
    const draw = async () => {
      const size = await circuitPdfPageSize(pdf, page);
      if (controller.signal.aborted) return;
      await renderCircuitPdfPage(pdf, page, output, 1600 / Math.max(size.width, size.height), controller.signal);
      if (!controller.signal.aborted) setStatus("ready");
    };
    void draw().catch(() => { if (!controller.signal.aborted) setStatus("failed"); });
    return () => controller.abort();
  }, [pdf, page]);

  const pageFlags = [...unlocated, ...unresolvedChecks];
  return <figure className="circuit-pdf-ai-annotated-page" data-unlocated={pageFlags.length > 0}>
    <figcaption><strong>{label}</strong><span>第 {page} 頁</span></figcaption>
    <div className="circuit-pdf-ai-annotation-surface">
      <canvas ref={canvas} role="img" aria-label={`${label}第 ${page} 頁圖面`} hidden={status !== "ready"} />
      {status !== "ready" && <p role="status">{status === "failed" ? "圖面預覽無法顯示，請查看下方待核對項目。" : "正在載入圖面…"}</p>}
      {status === "ready" && pending.map(item => {
        const rect = item[boxKey];
        if (!rect) return null;
        return <button key={item.id} type="button" className="circuit-pdf-ai-annotation-box"
          data-certainty={item.certainty ?? "suspected"} aria-label={`${label} ${item.id}：${item.title}`} title={item.title}
          style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
          onClick={() => onFinding(item.id)}><span aria-hidden="true">{item.id}</span></button>;
      })}
    </div>
    {pageFlags.length > 0 && <p className="circuit-pdf-ai-unlocated"><strong>位置未能確認</strong><span>{pageFlags.join("、")}</span></p>}
  </figure>;
}

export function CircuitPdfAiAnnotations({ report, official, working, onFinding }: AnnotationProps) {
  if (!report.findings.some(item => item.decision !== "dismissed") && !report.checks.some(check => check.state === "unverifiable"
    && !report.findings.some(item => item.category === check.category))) return null;
  return <section className="circuit-pdf-ai-annotations" aria-label="AI 圖面標註">
    <h3><ScanLine aria-hidden="true" />AI 圖面標註</h3>
    <p><span data-kind="suspected">實線：疑似問題</span><span data-kind="unclear">虛線：證據不足</span>點框查看兩版證據。</p>
    <div className="circuit-pdf-ai-annotation-pages">
      <AnnotatedPage key={`official:${official.id}:${official.page}`} source={official} side="official" report={report} onFinding={onFinding} />
      <AnnotatedPage key={`working:${working.id}:${working.page}`} source={working} side="working" report={report} onFinding={onFinding} />
    </div>
  </section>;
}
