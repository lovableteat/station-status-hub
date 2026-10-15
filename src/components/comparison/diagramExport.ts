import { parseDiagramDocument, type DiagramDocument } from "./diagramModel.ts";
import { DIAGRAM_THEME, diagramNodeColors, diagramStrokeColor } from "./diagramTheme.ts";
import { diagramEdgeRoute } from "./diagramGeometry.ts";

type Node = DiagramDocument["nodes"][number];
type Point = { x: number; y: number };
const MARGIN = 32;
const MAX_RASTER_SIDE = 8192;
const MAX_RASTER_PIXELS = 16 * 1024 * 1024;
const RASTER_TIMEOUT = 20_000;
const MAX_SVG_BYTES = 32 * 1024 * 1024;

function xml(value: string): string {
  return Array.from(value, character => {
    const code = character.codePointAt(0)!;
    if (code < 32 && ![9, 10, 13].includes(code)) return "";
    return code >= 0xd800 && code <= 0xdfff || code === 0xfffe || code === 0xffff ? "�" : character;
  }).join("").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}
function n(value: number): string { return String(Number(value.toFixed(3))); }
function textWidth(value: string, font: number): number {
  return Array.from(value).reduce((width, character) => width + (/\s/.test(character) ? 0.34 : character.codePointAt(0)! > 0x2e7f ? 1 : 0.62) * font, 0);
}
function lines(value: string, width: number, font: number, maximum: number): string[] {
  if (!value || maximum < 1) return [];
  const result: string[] = [];
  const paragraphs = value.replace(/\r\n?/g, "\n").split("\n");
  let truncated = false;
  for (let paragraph = 0; paragraph < paragraphs.length; paragraph++) {
    let line = "";
    for (const character of Array.from(paragraphs[paragraph])) {
      if (line && textWidth(line + character, font) > width) {
        result.push(line); line = "";
        if (result.length >= maximum) { truncated = true; break; }
      }
      line += character;
    }
    if (truncated) break;
    result.push(line);
    if (result.length >= maximum) { truncated = paragraph < paragraphs.length - 1; break; }
  }
  if (truncated && result.length) {
    let last = result[result.length - 1];
    while (last && textWidth(`${last}…`, font) > width) last = Array.from(last).slice(0, -1).join("");
    result[result.length - 1] = `${last}…`;
  }
  return result.slice(0, maximum);
}
function renderNode(node: Node, index: number): string {
  const { x, y, width, height } = node;
  const colors = diagramNodeColors(node.color);
  const attributes = `data-node-id="${xml(node.id)}" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1.5"`;
  let shape: string;
  if (node.shape === "ellipse") shape = `<ellipse ${attributes} cx="${n(x + width / 2)}" cy="${n(y + height / 2)}" rx="${n(width / 2)}" ry="${n(height / 2)}"/>`;
  else if (node.shape === "diamond") shape = `<polygon ${attributes} points="${n(x + width / 2)},${n(y)} ${n(x + width)},${n(y + height / 2)} ${n(x + width / 2)},${n(y + height)} ${n(x)},${n(y + height / 2)}"/>`;
  else if (node.shape === "note") {
    const fold = Math.min(18, width / 5, height / 5);
    shape = `<path ${attributes} d="M${n(x)} ${n(y)} H${n(x + width - fold)} L${n(x + width)} ${n(y + fold)} V${n(y + height)} H${n(x)} Z"/><path d="M${n(x + width - fold)} ${n(y)} V${n(y + fold)} H${n(x + width)}" fill="none" stroke="${colors.stroke}" stroke-width="1.5"/>`;
  } else shape = `<rect ${attributes} x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" rx="8"/>`;
  const padding = Math.min(12, width / 5, height / 5);
  const innerWidth = Math.max(1, node.shape === "diamond" ? width * 0.48 : node.shape === "ellipse" ? width * 0.7 : width - padding * 2);
  const innerHeight = Math.max(1, node.shape === "diamond" ? height * 0.48 : node.shape === "ellipse" ? height * 0.7 : height - padding * 2);
  const font = Math.max(7, Math.min(14, innerHeight / 1.4));
  const lineHeight = font * 1.3;
  const capacity = Math.max(1, Math.floor(innerHeight / lineHeight));
  const label = lines(node.label, innerWidth, font, capacity);
  const detail = lines(node.detail, innerWidth, font * 0.8, Math.max(0, capacity - label.length));
  const count = label.length + detail.length;
  const firstY = y + height / 2 - ((count - 1) * lineHeight) / 2 + font * 0.34;
  const spans = [...label.map(value => ({ value, detail: false })), ...detail.map(value => ({ value, detail: true }))]
    .map((line, row) => `<tspan x="${n(x + width / 2)}" y="${n(firstY + row * lineHeight)}"${line.detail ? ` font-size="${n(font * 0.8)}" fill="${colors.detail}"` : ""}>${xml(line.value)}</tspan>`).join("");
  return `<g><title>${xml([node.label, node.detail, node.refdes ? `RefDes: ${node.refdes}` : "", node.page ? `線路圖第 ${node.page} 頁` : ""].filter(Boolean).join("\n"))}</title>${shape}<clipPath id="diagram-node-${index}"><rect x="${n(x + (width - innerWidth) / 2)}" y="${n(y + (height - innerHeight) / 2)}" width="${n(innerWidth)}" height="${n(innerHeight)}"/></clipPath><text text-anchor="middle" font-size="${n(font)}" font-weight="600" fill="${colors.text}" clip-path="url(#diagram-node-${index})">${spans}</text></g>`;
}
function render(doc: DiagramDocument) {
  const byId = new Map(doc.nodes.map(node => [node.id, node]));
  const edges = doc.edges.map(edge => ({ edge, route: diagramEdgeRoute(edge, byId) }));
  const points: Point[] = doc.nodes.flatMap(node => [{ x: node.x, y: node.y }, { x: node.x + node.width, y: node.y + node.height }]);
  const edgeLabels = edges.map(({ edge, route }) => {
    const text = lines(edge.label, 240, 12, 6);
    const width = Math.max(0, ...text.map(line => textWidth(line, 12))) + 12;
    const height = text.length * 16 + 8;
    if (text.length) points.push({ x: route.label.x - width / 2, y: route.label.y - height / 2 }, { x: route.label.x + width / 2, y: route.label.y + height / 2 });
    return { text, width, height };
  });
  for (const edge of edges) points.push(...edge.route.points);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) { minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); }
  const left = points.length ? minX - MARGIN : 0;
  const top = points.length ? minY - MARGIN : 0;
  const width = points.length ? maxX + MARGIN - left : 640;
  const height = points.length ? maxY + MARGIN - top : 360;
  const definitions = edges.map(({ edge }, index) => {
    if (edge.arrowhead === "none") return "";
    const size = Math.max(10, (edge.width ?? 2) * 3), middle = size / 2;
    return `<marker id="diagram-arrow-${index}" markerUnits="userSpaceOnUse" markerWidth="${size}" markerHeight="${size}" refX="${size}" refY="${middle}" orient="auto-start-reverse"><path d="M0 0 L${size} ${middle} L0 ${size} Z" fill="${diagramStrokeColor(edge.color)}"/></marker>`;
  }).join("");
  const paths = edges.map(({ edge, route }, index) => `<path data-edge-id="${xml(edge.id)}" d="${route.path}" fill="none" stroke="${diagramStrokeColor(edge.color)}" stroke-width="${edge.width ?? 2}" stroke-linecap="round" stroke-linejoin="round"${edge.style === "dashed" ? ' stroke-dasharray="7 5"' : ""}${edge.arrowhead === "both" ? ` marker-start="url(#diagram-arrow-${index})"` : ""}${edge.arrowhead === "none" ? "" : ` marker-end="url(#diagram-arrow-${index})"`}><title>${xml(edge.label)}</title></path>`).join("");
  const labels = edges.map(({ route }, index) => {
    const label = edgeLabels[index];
    if (!label.text.length) return "";
    return `<g><rect x="${n(route.label.x - label.width / 2)}" y="${n(route.label.y - label.height / 2)}" width="${n(label.width)}" height="${n(label.height)}" rx="4" fill="${DIAGRAM_THEME.labelBackground}" fill-opacity="0.95"/><text text-anchor="middle" font-size="12" fill="${DIAGRAM_THEME.text}">${label.text.map((value, row) => `<tspan x="${n(route.label.x)}" y="${n(route.label.y - label.height / 2 + 16 + row * 16)}">${xml(value)}</tspan>`).join("")}</text></g>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="${n(left)} ${n(top)} ${n(width)} ${n(height)}" role="img" aria-labelledby="diagram-title" font-family="Arial, Microsoft JhengHei, Noto Sans CJK TC, sans-serif"><title id="diagram-title">${xml(doc.title)}</title><rect x="${n(left)}" y="${n(top)}" width="${n(width)}" height="${n(height)}" fill="${DIAGRAM_THEME.canvas}"/><defs>${definitions}</defs>${paths}${labels}${doc.nodes.map(renderNode).join("")}</svg>`;
  if (new Blob([svg]).size > MAX_SVG_BYTES) throw new Error("圖表內容過大，請拆成較小的圖表再匯出。");
  return { svg, width, height };
}

export function diagramToSvg(doc: DiagramDocument): string {
  return render(parseDiagramDocument(doc)).svg;
}

async function rasterize(svg: string, width: number, height: number) {
  const scale = Math.min(2, MAX_RASTER_SIDE / width, MAX_RASTER_SIDE / height, Math.sqrt(MAX_RASTER_PIXELS / (width * height)));
  if (scale < 0.25) throw new Error("圖表範圍太大，請縮小節點間距、拆圖，或改匯出 SVG／JSON。");
  if (typeof Image === "undefined" || typeof document === "undefined") throw new Error("目前環境無法產生圖片，請使用支援圖片匯出的瀏覽器。");
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  let canvas: HTMLCanvasElement | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("圖表圖片載入逾時，請重試。")), RASTER_TIMEOUT);
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("無法將圖表轉成圖片，匯出已停止。"));
      image.src = url;
    });
    clearTimeout(timeout);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("圖表圖片尺寸無效，匯出已停止。");
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(width * scale)); canvas.height = Math.max(1, Math.floor(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("瀏覽器無法建立繪圖畫布，請重試或改匯出 SVG。");
    context.fillStyle = DIAGRAM_THEME.canvas; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dimensions = { width: canvas.width, height: canvas.height };
    const blob = await new Promise<Blob>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("圖表圖片編碼逾時，請重試。")), RASTER_TIMEOUT);
      canvas!.toBlob(value => value?.size && value.type === "image/png" ? resolve(value) : reject(new Error("瀏覽器未能產生 PNG，匯出已停止。")), "image/png");
    });
    return { blob, ...dimensions };
  } finally {
    clearTimeout(timeout);
    image.onload = null; image.onerror = null; image.removeAttribute("src");
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    URL.revokeObjectURL(url);
  }
}
function saveBlob(blob: Blob, name: string) {
  if (typeof document === "undefined" || !document.body || typeof URL.createObjectURL !== "function") throw new Error("瀏覽器尚未準備好下載，請稍後再試。");
  const url = URL.createObjectURL(blob);
  let anchor: HTMLAnchorElement | undefined;
  try {
    anchor = document.createElement("a");
    if (!("download" in anchor)) throw new Error("目前瀏覽器不支援檔案下載，請改用其他瀏覽器。");
    anchor.href = url; anchor.download = name; anchor.rel = "noopener"; anchor.style.display = "none";
    document.body.appendChild(anchor); anchor.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally { anchor?.remove(); }
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
function filename(title: string) {
  const safe = Array.from(title.normalize("NFKC").replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "")).slice(0, 120).join("");
  return `AutoCheck-${safe || "diagram"}`;
}

export async function downloadDiagram(doc: DiagramDocument, format: "json" | "svg" | "png" | "pdf"): Promise<void> {
  const snapshot = structuredClone(parseDiagramDocument(doc));
  const name = filename(snapshot.title);
  if (format === "json") {
    saveBlob(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json;charset=utf-8" }), `${name}.autocheck-diagram.json`);
    return;
  }
  if (!["svg", "png", "pdf"].includes(format)) throw new Error("不支援的圖表匯出格式。");
  const { svg, width, height } = render(snapshot);
  if (format === "svg") {
    saveBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${name}.svg`);
    return;
  }
  const png = await rasterize(svg, width, height);
  if (format === "png") { saveBlob(png.blob, `${name}.png`); return; }
  const { jsPDF } = await import("jspdf");
  const pageScale = Math.min(0.75, (14000 - 48) / Math.max(width, height));
  const pageWidth = width * pageScale + 48, pageHeight = height * pageScale + 48;
  const pdf = new jsPDF({ orientation: pageWidth >= pageHeight ? "landscape" : "portrait", unit: "pt", format: [pageWidth, pageHeight], compress: true });
  pdf.setProperties({ title: snapshot.title, subject: "AutoCheck 工程圖", creator: "AutoCheck" });
  pdf.addImage(new Uint8Array(await png.blob.arrayBuffer()), "PNG", 24, 24, pageWidth - 48, pageHeight - 48, undefined, "FAST");
  const blob = pdf.output("blob");
  if (!(blob instanceof Blob) || blob.size < 5 || await blob.slice(0, 5).text() !== "%PDF-") throw new Error("PDF 產生失敗，匯出已停止。");
  saveBlob(blob, `${name}.pdf`);
}
