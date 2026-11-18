import { useEffect, useRef, useState } from "react";
import { Maximize2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CIRCUIT_AI_CATEGORY_LABELS, type CircuitPdfAiReviewReport, type CircuitPdfReviewPage } from "./circuitPdfAiReview";
import { CircuitPdfAiZoomViewer } from "./CircuitPdfAiZoomViewer";
import { circuitPdfPageSize, renderCircuitPdfPage } from "./pdfRender";

type AnnotationProps = {
  report: CircuitPdfAiReviewReport;
  official: CircuitPdfReviewPage;
  working: CircuitPdfReviewPage;
  onFinding: (id: string) => void;
};

function AnnotatedPage({ source: { pdf, page }, side, report, onFinding, onZoom }: {
  source: CircuitPdfReviewPage; side: "official" | "working";
  report: AnnotationProps["report"]; onFinding: AnnotationProps["onFinding"]; onZoom: () => void;
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
    <figcaption><strong>{label}</strong><span>第 {page} 頁</span>
      <button type="button" className="circuit-pdf-ai-zoom-open" title={`把${label}和另一版放大並排查看，可以縮放、拖曳`} aria-label={`放大檢視${label}第 ${page} 頁`} onClick={onZoom}><Maximize2 aria-hidden="true" />放大</button></figcaption>
    <div className="circuit-pdf-ai-annotation-surface">
      <canvas ref={canvas} role="img" aria-label={`${label}第 ${page} 頁圖面`} hidden={status !== "ready"} />
      {status !== "ready" && <p role="status">{status === "failed" ? "圖面預覽無法顯示，請查看下方待核對項目。" : "正在載入圖面…"}</p>}
      {status === "ready" && pending.map(item => {
        const rect = item[boxKey];
        if (!rect) return null;
        return <button key={item.id} type="button" className="circuit-pdf-ai-annotation-box"
          data-certainty={item.certainty ?? "suspected"} aria-label={`${label} ${item.id}：${item.title}`} title={item.title}
          style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, minHeight: 0 }}
          onClick={() => onFinding(item.id)}><span aria-hidden="true">{item.id}</span></button>;
      })}
    </div>
    {pageFlags.length > 0 && <p className="circuit-pdf-ai-unlocated"><strong>位置未能確認</strong><span>{pageFlags.join("、")}</span></p>}
  </figure>;
}

export function CircuitPdfAiAnnotations({ report, official, working, onFinding }: AnnotationProps) {
  const [zoom, setZoom] = useState(false);
  const marked = report.findings.some(item => item.decision !== "dismissed") || report.checks.some(check => check.state === "unverifiable"
    && !report.findings.some(item => item.category === check.category));
  const viewer = <CircuitPdfAiZoomViewer open={zoom} onOpenChange={setZoom} report={report} official={official} working={working} onOpenFinding={onFinding} />;
  // Nothing to mark: the two drawings are not repeated here, but both versions can still be opened large.
  if (!marked) return <section className="circuit-pdf-ai-annotations" data-empty="true" aria-label="圖面檢視">
    <p><span>這一頁沒有需要標註的地方。</span><Button type="button" variant="outline" title="把基準版和比對版放大並排查看，可以縮放、拖曳" onClick={() => setZoom(true)}><Maximize2 aria-hidden="true" />放大檢視兩版</Button></p>
    {viewer}
  </section>;
  return <section className="circuit-pdf-ai-annotations" aria-label="AI 圖面標註">
    <h3><ScanLine aria-hidden="true" />AI 圖面標註<Button type="button" variant="outline" title="把基準版和比對版放大並排查看，可以縮放、拖曳，點差異會自動放大到那個位置" onClick={() => setZoom(true)}><Maximize2 aria-hidden="true" />放大檢視兩版</Button></h3>
    <p><span data-kind="suspected">實線：疑似問題</span><span data-kind="unclear">虛線：證據不足</span>點框查看兩版證據。</p>
    <div className="circuit-pdf-ai-annotation-pages">
      <AnnotatedPage key={`official:${official.id}:${official.page}`} source={official} side="official" report={report} onFinding={onFinding} onZoom={() => setZoom(true)} />
      <AnnotatedPage key={`working:${working.id}:${working.page}`} source={working} side="working" report={report} onFinding={onFinding} onZoom={() => setZoom(true)} />
    </div>
    {viewer}
  </section>;
}
