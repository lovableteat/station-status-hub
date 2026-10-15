import { parseDiagramDocument, type DiagramDocument, type DiagramEdge, type DiagramNode, type DiagramPoint, type DiagramRotation } from "./diagramModel.ts";
import { diagramEdgeEndpoint, diagramEdgeRoute } from "./diagramGeometry.ts";
import { diagramSymbolGraphics, diagramSymbolLabelBox, diagramSymbolPortPosition, diagramSymbolPorts, isElectricalSymbol } from "./diagramSymbols.ts";
import { diagramNodeColors, diagramStrokeColor } from "./diagramTheme.ts";

const number = (value: number) => String(Number(value.toFixed(6)));
function xml(value: string): string {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (!(code === 9 || code === 10 || code === 13 || code >= 32 && code <= 0xd7ff || code >= 0xe000 && code <= 0xfffd || code >= 0x10000 && code <= 0x10ffff)) {
      throw new Error("圖表含有 XML 不支援的文字，請移除無效字元後再匯出。");
    }
  }
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;").replace(/\r/g, "&#13;").replace(/\n/g, "&#10;").replace(/\t/g, "&#9;");
}
const attributes = (values: Record<string, string | number | undefined>) => Object.entries(values)
  .filter(([, value]) => value !== undefined).map(([key, value]) => ` ${key}="${xml(String(value))}"`).join("");
const point = (value: DiagramPoint, as?: string) => `<mxPoint${attributes({ x: number(value.x), y: number(value.y), as })}/>`;

/** Graph.compress's URI + raw-DEFLATE + Base64 format, using a stored block for these small, trusted stencils. */
function inlineStencil(value: string): string {
  const input = encodeURIComponent(value);
  if (input.length > 65535) throw new Error("圖形範本超過匯出上限。");
  const length = input.length;
  const bytes = String.fromCharCode(1, length & 255, length >>> 8, ~length & 255, ~length >>> 8 & 255) + input;
  return `stencil(${btoa(bytes)})`;
}

function rotate(point: DiagramPoint, rotation: DiagramRotation): DiagramPoint {
  if (rotation === 90) return { x: 100 - point.y, y: point.x };
  if (rotation === 180) return { x: 100 - point.x, y: 100 - point.y };
  if (rotation === 270) return { x: point.y, y: 100 - point.x };
  return point;
}

/** Convert only the M/L/H/V/Z commands used by our own circuit strokes, never arbitrary imported SVG. */
function stencilPath(path: string, rotation: DiagramRotation): string {
  const tokens = path.match(/[A-Za-z]|-?(?:\d*\.)?\d+/g) ?? [];
  let index = 0, cursor: DiagramPoint = { x: 0, y: 0 }, result = "";
  while (index < tokens.length) {
    const command = tokens[index++];
    if (command === "Z") { result += "<close/>"; continue; }
    if (!["M", "L", "H", "V"].includes(command)) throw new Error("圖形範本含有未支援的繪製指令。");
    if (command === "H") cursor = { x: Number(tokens[index++]), y: cursor.y };
    else if (command === "V") cursor = { x: cursor.x, y: Number(tokens[index++]) };
    else cursor = { x: Number(tokens[index++]), y: Number(tokens[index++]) };
    if (!Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) throw new Error("圖形範本座標無效。");
    const next = rotate(cursor, rotation);
    result += `<${command === "M" ? "move" : "line"}${attributes({ x: number(next.x), y: number(next.y) })}/>`;
  }
  return `<path>${result}</path>`;
}

const stencilCache = new Map<string, string>();
function symbolStencil(node: DiagramNode): string {
  const rotation = node.rotation ?? 0, key = `${node.shape}:${rotation}`;
  const cached = stencilCache.get(key);
  if (cached) return cached;
  const graphics = diagramSymbolGraphics(node.shape)!;
  const bounds = diagramSymbolLabelBox(node.shape, rotation)!;
  const connections = diagramSymbolPorts(node.shape, rotation).map(port => {
    const anchor = diagramSymbolPortPosition(node.shape, port, rotation)!;
    return `<constraint${attributes({ x: anchor.x / 100, y: anchor.y / 100, perimeter: 0, name: port })}/>`;
  }).join("");
  const stencil = inlineStencil(`<shape name="AutoCheck ${node.shape}" w="100" h="100" aspect="variable" strokewidth="inherit"><connections>${connections}</connections><background/><foreground><linecap cap="round"/><linejoin join="round"/>${graphics.paths.map(path => `${stencilPath(path, rotation)}<${node.shape === "netlabel" ? "fillstroke" : "stroke"}/>`).join("")}</foreground><labelBounds${attributes({ if: "boundedLbl", x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height })}/></shape>`);
  stencilCache.set(key, stencil);
  return stencil;
}

function nodeXml(node: DiagramNode): string {
  const symbol = Boolean(diagramSymbolGraphics(node.shape));
  const colors = diagramNodeColors(node.color, "light", isElectricalSymbol(node.shape) ? undefined : node.fillColor);
  const shape = symbol ? symbolStencil(node) : ({ rectangle: "rectangle", ellipse: "ellipse", diamond: "rhombus", note: "note" } as const)[node.shape as "rectangle" | "ellipse" | "diamond" | "note"];
  const style = [
    `shape=${shape}`, "html=0", "whiteSpace=wrap", "align=center", "verticalAlign=middle", "fontSize=12", "fontFamily=Helvetica",
    `fontColor=${colors.text}`, `strokeColor=${colors.stroke}`, `fillColor=${isElectricalSymbol(node.shape) ? "none" : colors.fill}`,
    "strokeWidth=2", "shadow=0", "spacing=0", "boundedLbl=1", "rotatable=1", "connectable=1",
    ...(node.shape === "rectangle" ? ["rounded=1", "absoluteArcSize=1", "arcSize=12"] : []),
    ...(node.shape === "note" ? ["size=18", "fixedSize=1"] : []),
  ].join(";") + ";";
  return `<mxCell${attributes({ id: `node-${node.id}`, value: [node.label, node.detail].filter(Boolean).join("\n"), style, vertex: 1, parent: 1, autocheckNode: JSON.stringify(node) })}><mxGeometry${attributes({ x: number(node.x), y: number(node.y), width: number(node.width), height: number(node.height), as: "geometry" })}/></mxCell>`;
}

function routePoints(edge: DiagramEdge, nodes: ReadonlyMap<string, DiagramNode>): { points: DiagramPoint[]; curved: boolean } {
  const route = diagramEdgeRoute(edge, nodes);
  if (!route.path.includes(" C") || route.points.length !== 4) return { points: route.points.slice(1, -1), curved: false };
  const [a, b, c, d] = route.points;
  // draw.io uses quadratic smoothing, so sampled waypoints keep the native cubic's shape close while editable.
  const points: DiagramPoint[] = [];
  for (let index = 1; index < 16; index++) {
    const t = index / 16, u = 1 - t;
    points.push({ x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x, y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y });
  }
  return { points, curved: true };
}

function edgeXml(edge: DiagramEdge, nodes: ReadonlyMap<string, DiagramNode>): string {
  const source = diagramEdgeEndpoint(edge, "source", nodes), target = diagramEdgeEndpoint(edge, "target", nodes);
  const route = routePoints(edge, nodes), arrow = edge.arrowhead ?? "end";
  const fixedPort = (side: "exit" | "entry", endpoint: typeof source): string[] => endpoint.node ? [
    `${side}X=${number((endpoint.point.x - endpoint.node.x) / endpoint.node.width)}`,
    `${side}Y=${number((endpoint.point.y - endpoint.node.y) / endpoint.node.height)}`,
    `${side}Dx=0`, `${side}Dy=0`, `${side}Perimeter=0`,
  ] : [];
  const style = [
    "edgeStyle=none", "html=0", "rounded=0", `curved=${Number(route.curved)}`, `strokeColor=${diagramStrokeColor(edge.color)}`,
    `strokeWidth=${edge.width ?? 2}`, `dashed=${Number(edge.style === "dashed")}`, "dashPattern=7 5", "fontSize=11", "fontFamily=Helvetica",
    "fontColor=#1f2937", "labelBackgroundColor=#ffffff", `startArrow=${arrow === "both" ? "block" : "none"}`,
    `endArrow=${arrow === "none" ? "none" : "block"}`, "startFill=1", "endFill=1", "startSize=8", "endSize=8",
    `jumpStyle=${edge.jump === "arc" ? "arc" : "none"}`, "jumpSize=8", ...fixedPort("exit", source), ...fixedPort("entry", target),
  ].join(";") + ";";
  const geometry = `${source.node ? "" : point(source.point, "sourcePoint")}${target.node ? "" : point(target.point, "targetPoint")}${route.points.length ? `<Array as="points">${route.points.map(value => point(value)).join("")}</Array>` : ""}`;
  return `<mxCell${attributes({ id: `edge-${edge.id}`, value: edge.label, style, edge: 1, parent: 1, source: source.node ? `node-${source.node.id}` : undefined, target: target.node ? `node-${target.node.id}` : undefined, autocheckEdge: JSON.stringify(edge) })}><mxGeometry relative="1" as="geometry">${geometry}</mxGeometry></mxCell>`;
}

/** One-way conversion to editable draw.io cells; foreign draw.io files remain in their original format. */
export function diagramToDrawioXml(document: DiagramDocument): string {
  const doc = parseDiagramDocument(document), nodes = new Map(doc.nodes.map(node => [node.id, node]));
  const edges = doc.edges.map((edge, index) => ({ edge, index })).sort((a, b) => Number(a.edge.jump === "arc") - Number(b.edge.jump === "arc") || a.index - b.index);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" agent="AutoCheck" compressed="false"><diagram${attributes({ id: doc.id, name: doc.title })}><mxGraphModel grid="1" gridSize="10" page="0" background="#ffffff"${attributes({ autocheckVersion: doc.version, autocheckCreatedAt: doc.createdAt, autocheckUpdatedAt: doc.updatedAt, autocheckViewport: JSON.stringify(doc.viewport), autocheckSource: doc.source ? JSON.stringify(doc.source) : undefined })}><root><mxCell id="0"/><mxCell id="1" parent="0"/>${doc.nodes.map(nodeXml).join("")}${edges.map(({ edge }) => edgeXml(edge, nodes)).join("")}</root></mxGraphModel></diagram></mxfile>`;
}
