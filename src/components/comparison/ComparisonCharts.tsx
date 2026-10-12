import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { ZoomIn, ZoomOut, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadLocal } from "./downloads";
import type { Artifact } from "./types";

export function ComparisonCharts({ artifact, kind, pdfUrl, schematicName }: { artifact?: Artifact; kind: "power" | "i2c"; pdfUrl?: string; schematicName?: string }) {
  const [zoom, setZoom] = useState(1);
  const rendered = useMemo(() => {
    if (!artifact) return "";
    const document = new DOMParser().parseFromString(new TextDecoder().decode(artifact.bytes), "text/html");
    const svg = document.querySelector("svg");
    if (!svg) return "";
    for (const anchor of svg.querySelectorAll("a")) {
      const href = anchor.getAttribute("href") || anchor.getAttribute("xlink:href") || "";
      const match = href.match(/#page=(\d+)$/);
      if (match && schematicName && href.startsWith(schematicName)) anchor.setAttribute("data-pdf-page", match[1]);
    }
    return DOMPurify.sanitize(svg.outerHTML, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ["foreignObject", "style", "script"], FORBID_ATTR: ["href", "xlink:href"], ADD_ATTR: ["data-pdf-page"] });
  }, [artifact, schematicName]);
  return <section className="comparison-section comparison-diagram"><div className="comparison-section-heading"><div><h2>{kind === "power" ? "Power Tree" : "I²C Map"}</h2><p>{kind === "power" ? "依原始 pin 與電阻網路推導電源上下游；未知來源保留在報表。" : "依 netlist 與位址庫推導 bus、mux、strap 與裝置位址。I²C 檢查沿用原版測試狀態。"}</p></div>{artifact && <Button variant="outline" onClick={() => downloadLocal(artifact.bytes, artifact.name, artifact.mime)}><Download />下載 HTML</Button>}</div>{rendered ? <><div className="comparison-diagram-tools"><Button variant="outline" size="icon" aria-label="縮小圖表" disabled={zoom <= 0.5} onClick={() => setZoom(value => Math.max(0.5, value - 0.25))}><ZoomOut /></Button><span>{Math.round(zoom * 100)}%</span><Button variant="outline" size="icon" aria-label="放大圖表" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + 0.25))}><ZoomIn /></Button><Button variant="ghost" onClick={() => setZoom(1)}>重設</Button>{pdfUrl && <Button asChild variant="outline"><a href={pdfUrl} target="_blank" rel="noopener noreferrer"><ExternalLink />開啟標註線路圖</a></Button>}</div><div className="comparison-diagram-scroll" onClick={event => { const anchor = (event.target as Element).closest("[data-pdf-page]"); const page = Number(anchor?.getAttribute("data-pdf-page")); if (pdfUrl && Number.isInteger(page) && page > 0 && page <= 10000) window.open(`${pdfUrl}#page=${page}`, "_blank", "noopener,noreferrer"); }}><div className="comparison-svg" style={{ zoom }} dangerouslySetInnerHTML={{ __html: rendered }} /></div><p className="comparison-help">圖表可水平捲動與縮放；有頁碼的節點可點選查看線路圖。</p></> : <div className="comparison-chart-empty"><p>{artifact ? "此結果沒有可顯示的方框圖，可下載原 HTML 查看詳細內容" : kind === "i2c" ? "這次結果未辨識到 I²C bus，請確認 SDA／SCL pin 名稱與規則設定" : "尚未產生 Power Tree，請先執行 A／B 比對"}</p></div>}</section>;
}
