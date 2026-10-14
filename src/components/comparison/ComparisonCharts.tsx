import { useEffect, useMemo, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadLocal } from "./downloads";
import type { Artifact } from "./types";
import { readDiagramViews } from "./diagramViews";

export function ComparisonCharts({ artifact, blockArtifact, kind, pdfUrl, schematicName }: { artifact?: Artifact; blockArtifact?: Artifact; kind: "power" | "i2c"; pdfUrl?: string; schematicName?: string }) {
  const [zoom, setZoom] = useState(1);
  const [view, setView] = useState({ artifact, blockArtifact, kind, simple: false, internal: false });
  const currentView = view.artifact === artifact && view.blockArtifact === blockArtifact && view.kind === kind
    ? view : { artifact, blockArtifact, kind, simple: false, internal: false };
  const simple = kind === "i2c" && Boolean(blockArtifact) && (!artifact || currentView.simple);
  const selectedArtifact = simple ? blockArtifact : artifact;
  const views = useMemo(() => readDiagramViews(selectedArtifact, schematicName, kind === "power"), [selectedArtifact, schematicName, kind]);
  const internal = Boolean(views.expanded) && currentView.internal;
  const rendered = internal ? views.expanded : views.compact;
  const diagram = useRef<HTMLDivElement>(null);
  const [focusTarget, setFocusTarget] = useState<{ key: string; artifact?: Artifact } | null>(null);
  useEffect(() => {
    if (!internal || !focusTarget || focusTarget.artifact !== selectedArtifact) return;
    const box = Array.from(diagram.current?.querySelectorAll<SVGGElement>("g[data-key]") ?? [])
      .find(node => node.getAttribute("data-key") === focusTarget.key);
    box?.scrollIntoView({ block: "center", inline: "center" });
    box?.setAttribute("tabindex", "-1");
    box?.focus({ preventScroll: true });
  }, [internal, focusTarget, rendered, selectedArtifact]);
  const expandInternal = (target: Element) => {
    if (!views.expanded) return false;
    const control = target.closest?.("[data-diagram-internal]");
    const key = control?.getAttribute("data-key");
    if (!key) return false;
    setView({ ...currentView, internal: true });
    setFocusTarget({ key, artifact: selectedArtifact });
    return true;
  };
  const openPdf = (target: Element) => {
    const page = Number(target.closest?.("[data-pdf-page]")?.getAttribute("data-pdf-page"));
    if (pdfUrl && Number.isInteger(page) && page > 0 && page <= 10000) window.open(`${pdfUrl}#page=${page}`, "_blank", "noopener,noreferrer");
  };
  return <section className="comparison-section comparison-diagram"><div className="comparison-section-heading"><div><h2>{kind === "power" ? "Power Tree" : "I²C Map"}</h2><p>{kind === "power" ? "依原始 pin 與電阻網路推導電源上下游；未知來源保留在報表。" : "依 netlist 與位址庫推導 bus、mux、strap 與裝置位址。I²C 檢查沿用原版測試狀態。"}</p></div>{selectedArtifact && <Button variant="outline" onClick={() => downloadLocal(selectedArtifact.bytes, selectedArtifact.name, selectedArtifact.mime)}><Download />下載 HTML</Button>}</div>{rendered ? <><div className="comparison-diagram-tools">{kind === "i2c" && artifact && blockArtifact && <><Button variant="outline" aria-pressed={!simple} onClick={() => setView({ ...currentView, simple: false })}>詳細圖</Button><Button variant="outline" aria-pressed={simple} onClick={() => setView({ ...currentView, simple: true })}>簡圖</Button></>}{views.expanded && <Button variant="outline" aria-pressed={internal} onClick={() => setView({ ...currentView, internal: !internal })}>顯示 converter 內部 net</Button>}<Button variant="outline" size="icon" aria-label="縮小圖表" disabled={zoom <= 0.5} onClick={() => setZoom(value => Math.max(0.5, value - 0.25))}><ZoomOut /></Button><span>{Math.round(zoom * 100)}%</span><Button variant="outline" size="icon" aria-label="放大圖表" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + 0.25))}><ZoomIn /></Button><Button variant="ghost" onClick={() => setZoom(1)}>重設</Button>{pdfUrl && <Button asChild variant="outline"><a href={pdfUrl} target="_blank" rel="noopener noreferrer"><ExternalLink />開啟標註線路圖</a></Button>}</div><div className="comparison-diagram-scroll" onClick={event => { if (expandInternal(event.target as Element)) event.preventDefault(); else openPdf(event.target as Element); }} onKeyDown={event => { if (event.key !== "Enter" && event.key !== " ") return; const target = event.target as Element; if (expandInternal(target)) event.preventDefault(); else if (target.closest?.("[data-pdf-page]")) { event.preventDefault(); openPdf(target); } }}><div ref={diagram} className="comparison-svg [&_[data-diagram-internal]]:cursor-pointer" style={{ zoom }} dangerouslySetInnerHTML={{ __html: rendered }} /></div><p className="comparison-help">圖表可水平捲動與縮放；有頁碼的節點可點選查看線路圖。</p></> : <div className="comparison-chart-empty"><p>{selectedArtifact ? "此結果沒有可顯示的方框圖，可下載原 HTML 查看詳細內容" : kind === "i2c" ? "這次結果未辨識到 I²C bus，請確認 SDA／SCL pin 名稱與規則設定" : "尚未產生 Power Tree，請先執行 A／B 比對"}</p></div>}</section>;
}
