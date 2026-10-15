import type { ComparisonSession } from "./types.ts";

export type DiagramShape = "rectangle" | "ellipse" | "diamond" | "note";
export type DiagramPort = "left" | "right" | "top" | "bottom";
export interface DiagramPoint { x: number; y: number }
export type DiagramLineType = "straight" | "elbow" | "curve";
export type DiagramArrowhead = "end" | "both" | "none";
export interface DiagramNode {
  id: string; x: number; y: number; width: number; height: number;
  shape: DiagramShape; label: string; detail: string; color: string;
  refdes?: string; page?: number;
}
export interface DiagramEdge {
  id: string; source: string; target: string;
  sourcePort?: DiagramPort; targetPort?: DiagramPort;
  label: string; color: string; style?: "solid" | "dashed";
  sourcePoint?: DiagramPoint; targetPoint?: DiagramPoint;
  lineType?: DiagramLineType; arrowhead?: DiagramArrowhead; width?: number;
}
export interface DiagramDocument {
  version: 1; id: string; title: string; createdAt: string; updatedAt: string;
  source?: { kind: "power" | "i2c"; sessionId: string; revision: "a" | "b"; generated: string };
  nodes: DiagramNode[]; edges: DiagramEdge[];
  viewport: { x: number; y: number; zoom: number };
}

export const MAX_DIAGRAM_NODES = 2000;
export const MAX_DIAGRAM_EDGES = 6000;
const MAX_COORDINATE = 1_000_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const SHAPES: DiagramShape[] = ["rectangle", "ellipse", "diamond", "note"];
const PORTS: DiagramPort[] = ["left", "right", "top", "bottom"];
function fail(detail: string): never { throw new Error(`圖表資料無效：${detail}`); }
const finite = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const text = (value: unknown, max: number, required = false): value is string => typeof value === "string" && value.length <= max && (!required || Boolean(value.trim())) && !Array.from(value).some(character => {
  const code = character.charCodeAt(0);
  return code === 127 || code < 32 && ![9, 10, 13].includes(code);
});
const identifier = (value: unknown): value is string => typeof value === "string" && ID.test(value);

function object(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("必須是一般 JSON 物件");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || ["__proto__", "prototype", "constructor"].includes(key)
      || ![...required, ...optional].includes(key) || !("value" in descriptors[key])) fail("含有未知欄位、原型或存取器");
  }
  if (required.some(key => !Object.prototype.hasOwnProperty.call(descriptors, key))) fail("缺少必要欄位");
  return value as Record<string, unknown>;
}

function array(value: unknown, maximum: number, label: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) fail(`${label}最多 ${maximum} 筆`);
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key)
      || Number(key) >= value.length || !("value" in Object.getOwnPropertyDescriptor(value, key)!)) fail(`${label}清單格式`);
  }
  if (Object.keys(value).length !== value.length) fail(`${label}清單不可有空洞`);
  return value;
}

function timestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function point(value: unknown): DiagramPoint {
  const item = object(value, ["x", "y"]);
  if (!finite(item.x, -MAX_COORDINATE, MAX_COORDINATE) || !finite(item.y, -MAX_COORDINATE, MAX_COORDINATE)) fail("連線座標或範圍");
  return { x: item.x, y: item.y };
}

/** Validate imports and create a detached plain-data document for editor/storage. */
export function parseDiagramDocument(value: unknown): DiagramDocument {
  const doc = object(value, ["version", "id", "title", "createdAt", "updatedAt", "nodes", "edges", "viewport"], ["source"]);
  if (doc.version !== 1 || !identifier(doc.id) || !text(doc.title, 240, true) || !timestamp(doc.createdAt) || !timestamp(doc.updatedAt)) fail("版本、識別碼、名稱或時間");
  let source: DiagramDocument["source"];
  if (doc.source !== undefined) {
    const item = object(doc.source, ["kind", "sessionId", "revision", "generated"]);
    if (!["power", "i2c"].includes(item.kind as string) || !["a", "b"].includes(item.revision as string)
      || !text(item.sessionId, 1024, true) || !text(item.generated, 120, true)) fail("來源資訊");
    source = { kind: item.kind as "power" | "i2c", sessionId: item.sessionId, revision: item.revision as "a" | "b", generated: item.generated };
  }
  const nodes = array(doc.nodes, MAX_DIAGRAM_NODES, "節點").map(value => {
    const node = object(value, ["id", "x", "y", "width", "height", "shape", "label", "detail", "color"], ["refdes", "page"]);
    if (!identifier(node.id) || !finite(node.x, -MAX_COORDINATE, MAX_COORDINATE) || !finite(node.y, -MAX_COORDINATE, MAX_COORDINATE)
      || !finite(node.width, 24, 2400) || !finite(node.height, 24, 2400) || !SHAPES.includes(node.shape as DiagramShape)
      || !text(node.label, 500) || !text(node.detail, 4000) || typeof node.color !== "string" || !COLOR.test(node.color)
      || node.refdes !== undefined && !text(node.refdes, 160, true)
      || node.page !== undefined && (!Number.isInteger(node.page) || !finite(node.page, 1, 10000))) fail("節點欄位或範圍");
    return {
      id: node.id, x: node.x, y: node.y, width: node.width, height: node.height,
      shape: node.shape as DiagramShape, label: node.label, detail: node.detail, color: node.color,
      ...(node.refdes === undefined ? {} : { refdes: node.refdes as string }),
      ...(node.page === undefined ? {} : { page: node.page as number }),
    };
  });
  const nodeIds = new Set(nodes.map(node => node.id));
  if (nodeIds.size !== nodes.length) fail("節點識別碼重複");
  const edges = array(doc.edges, MAX_DIAGRAM_EDGES, "連線").map(value => {
    const edge = object(value, ["id", "source", "target", "label", "color"], ["sourcePort", "targetPort", "style", "sourcePoint", "targetPoint", "lineType", "arrowhead", "width"]);
    const sourcePoint = edge.sourcePoint === undefined ? undefined : point(edge.sourcePoint);
    const targetPoint = edge.targetPoint === undefined ? undefined : point(edge.targetPoint);
    const endpoint = (value: unknown, freePoint: DiagramPoint | undefined) => value === "" ? Boolean(freePoint) : identifier(value) && nodeIds.has(value);
    if (!identifier(edge.id) || nodeIds.has(edge.id) || !endpoint(edge.source, sourcePoint) || !endpoint(edge.target, targetPoint)
      || !text(edge.label, 500) || typeof edge.color !== "string" || !COLOR.test(edge.color)
      || edge.sourcePort !== undefined && !PORTS.includes(edge.sourcePort as DiagramPort)
      || edge.targetPort !== undefined && !PORTS.includes(edge.targetPort as DiagramPort)
      || edge.style !== undefined && !["solid", "dashed"].includes(edge.style as string)
      || edge.lineType !== undefined && !["straight", "elbow", "curve"].includes(edge.lineType as string)
      || edge.arrowhead !== undefined && !["end", "both", "none"].includes(edge.arrowhead as string)
      || edge.width !== undefined && (!Number.isInteger(edge.width) || !finite(edge.width, 1, 8))) fail("連線欄位、端點或節點不存在");
    return {
      id: edge.id, source: edge.source as string, target: edge.target as string, label: edge.label, color: edge.color,
      ...(edge.sourcePort === undefined ? {} : { sourcePort: edge.sourcePort as DiagramPort }),
      ...(edge.targetPort === undefined ? {} : { targetPort: edge.targetPort as DiagramPort }),
      ...(edge.style === undefined ? {} : { style: edge.style as "solid" | "dashed" }),
      ...(sourcePoint === undefined ? {} : { sourcePoint }),
      ...(targetPoint === undefined ? {} : { targetPoint }),
      ...(edge.lineType === undefined ? {} : { lineType: edge.lineType as DiagramLineType }),
      ...(edge.arrowhead === undefined ? {} : { arrowhead: edge.arrowhead as DiagramArrowhead }),
      ...(edge.width === undefined ? {} : { width: edge.width as number }),
    };
  });
  if (new Set(edges.map(edge => edge.id)).size !== edges.length) fail("連線識別碼重複");
  const viewport = object(doc.viewport, ["x", "y", "zoom"]);
  if (!finite(viewport.x, -MAX_COORDINATE, MAX_COORDINATE) || !finite(viewport.y, -MAX_COORDINATE, MAX_COORDINATE) || !finite(viewport.zoom, 0.1, 8)) fail("畫布位置或縮放");
  return {
    version: 1, id: doc.id, title: doc.title, createdAt: doc.createdAt, updatedAt: doc.updatedAt,
    ...(source ? { source } : {}), nodes, edges, viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
  };
}

export function createBlankDiagram(title = "未命名圖表"): DiagramDocument {
  const now = new Date().toISOString();
  return parseDiagramDocument({ version: 1, id: `diagram-${crypto.randomUUID()}`, title: title.trim() || "未命名圖表", createdAt: now, updatedAt: now, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
}

/** Kahn layering with explicit cycle breaking; no recursive graph traversal. */
export function autoLayoutDiagram(value: DiagramDocument): DiagramDocument {
  const doc = parseDiagramDocument(value);
  const ordered = [...doc.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const outgoing = new Map(ordered.map(node => [node.id, new Set<string>()]));
  const indegree = new Map(ordered.map(node => [node.id, 0]));
  for (const edge of doc.edges) {
    if (!edge.source || !edge.target) continue;
    if (edge.source === edge.target || outgoing.get(edge.source)!.has(edge.target)) continue;
    outgoing.get(edge.source)!.add(edge.target);
    indegree.set(edge.target, indegree.get(edge.target)! + 1);
  }
  const ranks = new Map(ordered.map(node => [node.id, 0]));
  const processed = new Set<string>();
  const queue = ordered.filter(node => indegree.get(node.id) === 0).map(node => node.id);
  let cursor = 0;
  while (processed.size < ordered.length) {
    if (cursor >= queue.length) queue.push(ordered.find(node => !processed.has(node.id))!.id);
    const id = queue[cursor++];
    if (processed.has(id)) continue;
    processed.add(id);
    for (const target of outgoing.get(id)!) {
      if (processed.has(target)) continue;
      ranks.set(target, Math.max(ranks.get(target)!, ranks.get(id)! + 1));
      indegree.set(target, indegree.get(target)! - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  const columns = new Map<number, DiagramNode[]>();
  for (const node of ordered) {
    const rank = ranks.get(node.id)!;
    const column = columns.get(rank) ?? [];
    column.push(node); columns.set(rank, column);
  }
  let x = 64;
  let maximum = 0;
  for (const [, column] of [...columns].sort(([a], [b]) => a - b)) {
    let y = 64;
    for (const node of column) { node.x = x; node.y = y; y += node.height + 48; }
    x += Math.max(...column.map(node => node.width)) + 120;
    maximum = Math.max(maximum, x, y);
  }
  // Extreme valid dimensions still get a bounded, non-overlapping grid.
  if (maximum > MAX_COORDINATE - 2500 && ordered.length) {
    const count = Math.ceil(Math.sqrt(ordered.length));
    const width = Math.max(...ordered.map(node => node.width)) + 120;
    const height = Math.max(...ordered.map(node => node.height)) + 48;
    ordered.forEach((node, i) => { node.x = 64 + i % count * width; node.y = 64 + Math.floor(i / count) * height; });
  }
  return { ...doc, nodes: doc.nodes, updatedAt: new Date().toISOString(), viewport: { x: 0, y: 0, zoom: 1 } };
}

const sourceRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const sourceArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const sourceText = (value: unknown): string => typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
const clip = (value: string, maximum: number) => value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value;
const list = (value: unknown, maximum = 32): string[] => sourceArray(value).slice(0, maximum).map(sourceText).filter(Boolean);
const pageNumber = (value: unknown): number | undefined => Number.isInteger(value) && finite(value, 1, 10000) ? value : undefined;
const describe = (...values: (string | undefined)[]) => clip(values.filter(Boolean).join("\n"), 4000);

function graphBuilder(doc: DiagramDocument) {
  const ids = new Map<string, string>();
  const seenEdges = new Set<string>();
  const hash = (key: string) => {
    let result = 14695981039346656037n;
    for (let i = 0; i < key.length; i++) result = BigInt.asUintN(64, (result ^ BigInt(key.charCodeAt(i))) * 1099511628211n);
    return result.toString(36);
  };
  const node = (key: string, input: Omit<DiagramNode, "id" | "x" | "y">): string => {
    if (ids.has(key)) return ids.get(key)!;
    if (doc.nodes.length >= MAX_DIAGRAM_NODES) fail(`來源超過 ${MAX_DIAGRAM_NODES} 個節點，請拆成多張圖`);
    const base = `node-${hash(key)}`;
    let id = base, suffix = 1;
    while (doc.nodes.some(node => node.id === id)) id = `${base}-${suffix++}`;
    ids.set(key, id); doc.nodes.push({ id, x: 0, y: 0, ...input, label: clip(input.label, 500), detail: clip(input.detail, 4000) });
    return id;
  };
  const edge = (source: string, target: string, label = "", dashed = false, color = "#64748b") => {
    const key = JSON.stringify([source, target, label, dashed, color]);
    if (seenEdges.has(key)) return;
    if (doc.edges.length >= MAX_DIAGRAM_EDGES) fail(`來源超過 ${MAX_DIAGRAM_EDGES} 條連線，請拆成多張圖`);
    seenEdges.add(key);
    doc.edges.push({ id: `edge-${doc.edges.length + 1}`, source, target, sourcePort: "right", targetPort: "left", label: clip(label, 500), color, style: dashed ? "dashed" : "solid" });
  };
  return { node, edge };
}

function powerGraph(doc: DiagramDocument, tree: Record<string, unknown>) {
  const graph = graphBuilder(doc);
  const rails = sourceRecord(tree.rails);
  const orphans = new Map(sourceArray(tree.orphans).map(value => { const row = sourceRecord(value); return [sourceText(row.rail), row]; }));
  const railIds = new Map<string, string>();
  const rail = (name: string): string => {
    if (railIds.has(name)) return railIds.get(name)!;
    const data = sourceRecord(rails[name]);
    const orphan = orphans.get(name);
    const voltage = sourceText(data.v ?? orphan?.voltage);
    const id = graph.node(`power-rail:${name}`, {
      width: 240, height: 100, shape: "ellipse", label: `${name}${voltage ? `\n${data.vapprox ? "≈ " : ""}${voltage} V` : ""}`,
      color: orphan ? "#b45309" : "#0f766e",
      detail: describe(sourceText(data.vsrc) && `電壓來源：${sourceText(data.vsrc)}`, sourceText(data.vconflict), sourceText(data.vnote), list(data.members).length ? `同組 net：${list(data.members).join(", ")}` : "", list(data.loads).length ? `負載：${list(data.loads).join(", ")}` : "", sourceText(orphan?.source)),
    });
    railIds.set(name, id); return id;
  };
  for (const name of [...new Set([...Object.keys(rails), ...orphans.keys()])].filter(Boolean).sort()) rail(name);
  for (const value of sourceArray(tree.edges)) {
    const item = sourceRecord(value);
    const from = sourceText(item.rail_in), to = sourceText(item.rail_out), refdes = sourceText(item.conv);
    if (!from || !to || !refdes) fail("Power Tree 連線缺少來源、目標或元件");
    const page = pageNumber(item.page);
    const converter = graph.node(`power-device:${refdes}`, {
      width: 240, height: 112, shape: "rectangle", label: [refdes, sourceText(item.mpn), sourceText(item.kind), item.built === false ? "DNP" : ""].filter(Boolean).join("\n"),
      color: item.built === false ? "#64748b" : "#2563eb", refdes, ...(page ? { page } : {}),
      detail: describe(sourceText(item.kind), list(item.en).length ? `EN：${list(item.en).join(", ")}` : "", list(item.pg).length ? `PG：${list(item.pg).join(", ")}` : "", list(item.via).length ? `經過：${list(item.via).join(", ")}` : ""),
    });
    const dashed = item.built === false || item.kind === "diode";
    graph.edge(rail(from), converter, "輸入", dashed);
    graph.edge(converter, rail(to), list(item.via).join(" → ") || "輸出", dashed);
  }
}

function i2cGraph(doc: DiagramDocument, map: Record<string, unknown>) {
  const graph = graphBuilder(doc);
  const devices = sourceRecord(map.devices);
  const deviceIds = new Map<string, string>();
  const device = (refdes: string, fallback = ""): string => {
    if (deviceIds.has(refdes)) return deviceIds.get(refdes)!;
    const data = sourceRecord(devices[refdes]);
    const address = Number.isInteger(data.addr) && finite(data.addr, 0, 127) ? `0x${data.addr.toString(16).padStart(2, "0").toUpperCase()}${data.verified === false ? "（未驗證）" : ""}` : "";
    const page = pageNumber(data.page);
    const id = graph.node(`i2c-device:${refdes}`, {
      width: 240, height: data.kind === "mux" ? 160 : 120, shape: data.kind === "mux" ? "diamond" : "rectangle", refdes, ...(page ? { page } : {}),
      label: [refdes, sourceText(data.symbol) || fallback, address, data.built === false ? "DNP" : ""].filter(Boolean).join("\n"),
      color: data.built === false ? "#64748b" : data.verified === false ? "#b45309" : "#2563eb",
      detail: describe(sourceText(data.bom_spec) || sourceText(data.bom), sourceText(data.addr_note), sourceText(data.kind), list(data.sda_pins).join(", "), list(data.scl_pins).join(", "), list(data.strap).join("; "), list(data.series).join("; ")),
    });
    deviceIds.set(refdes, id); return id;
  };
  for (const refdes of Object.keys(devices).sort()) device(refdes);
  const segmentIds = new Map<string, string>();
  for (const value of sourceArray(map.buses)) {
    const bus = sourceRecord(value);
    const bid = sourceText(bus.bid);
    if (!bid) fail("I²C bus 缺少識別名稱");
    const parent = sourceText(bus.parent).match(/^(\S+)\s+(.+)$/);
    const busNode = graph.node(`i2c-bus:${bid}`, {
      width: 240, height: 96, shape: "note", label: `${bid}\n${sourceText(bus.speed) || "I²C bus"}`,
      color: "#0f766e", detail: describe(`SDA：${list(bus.sda_nets).join(", ")}`, `SCL：${list(bus.scl_nets).join(", ")}`, list(bus.dnp_links).length ? `DNP 連接：${list(bus.dnp_links).join(", ")}` : ""),
    });
    const segments = sourceArray(bus.segments).map(sourceRecord);
    for (const segment of segments) {
      const sid = sourceText(segment.sid), line = sourceText(segment.line);
      if (!sid || !["SDA", "SCL"].includes(line)) fail("I²C segment 缺少有效的線路名稱");
      const segmentNode = graph.node(`i2c-segment:${sid}`, {
        width: 240, height: 88, shape: "ellipse", label: `${line}\n${list(segment.nets).join(", ") || sid}`,
        color: line === "SDA" ? "#2563eb" : "#0f766e",
        detail: describe(`分段：${sid}`, list(segment.built_pullups).length ? `Pull-up：${list(segment.built_pullups).join("; ")}` : "", list(segment.dnp_pullups).length ? `DNP pull-up：${list(segment.dnp_pullups).join("; ")}` : "", list(segment.links).length ? `串接：${list(segment.links).join(", ")}` : ""),
      });
      segmentIds.set(sid, segmentNode);
      // This is a bus-membership edge, not a claim that DNP-separated nets
      // conduct. Actual per-line device membership remains explicit below.
      graph.edge(busNode, segmentNode, `${line} 分段`, true);
      for (const refdes of list(segment.devices, MAX_DIAGRAM_NODES)) {
        // A channel pin belongs to the mux electrically, but the mux is this
        // bus's upstream source, not another downstream load on its own branch.
        if (refdes === parent?.[1]) continue;
        const data = sourceRecord(devices[refdes]);
        graph.edge(segmentNode, device(refdes), line, data.built === false, line === "SDA" ? "#2563eb" : "#0f766e");
      }
    }
    for (const refdes of list(bus.devices, MAX_DIAGRAM_NODES)) {
      if (refdes === parent?.[1]) continue;
      const data = sourceRecord(devices[refdes]);
      let linked = segments.some(segment => list(segment.devices, MAX_DIAGRAM_NODES).includes(refdes));
      for (const [field, line] of [["sda_seg", "SDA"], ["scl_seg", "SCL"]]) {
        for (const sid of list(data[field])) {
          const segment = segmentIds.get(sid);
          if (segment) { graph.edge(segment, device(refdes), line, data.built === false, line === "SDA" ? "#2563eb" : "#0f766e"); linked = true; }
        }
      }
      if (!linked) graph.edge(busNode, device(refdes), "bus 成員", true);
    }
    if (parent) graph.edge(device(parent[1], "I²C mux"), busNode, parent[2]);
    for (const value of [...sourceArray(bus.conn_pins), ...sourceArray(bus.host_pins)]) {
      const [line, net, pin] = list(value, 3);
      const refdes = pin?.split(" ")[0]?.split(".")[0];
      if (!refdes) continue;
      const source = device(refdes, sourceText(sourceRecord(bus.part_values)[refdes]) || "上游連接");
      const matching = segments.filter(segment => segment.line === line && list(segment.nets).includes(net));
      if (!matching.length) graph.edge(source, busNode, `${line || ""} ${net || ""}`.trim());
      for (const segment of matching) graph.edge(source, segmentIds.get(sourceText(segment.sid))!, `${line} ${pin}`);
    }
  }
}

export function createDiagramFromResult(session: ComparisonSession, kind: "power" | "i2c", revision: "a" | "b" = "b"): DiagramDocument {
  if (!["power", "i2c"].includes(kind) || !["a", "b"].includes(revision)) fail("來源圖表類型或版本");
  const label = session.result.meta[revision].label;
  const doc = createBlankDiagram(clip(`${session.projectName} · ${kind === "power" ? "Power Tree" : "I²C Map"} · ${label}`, 240));
  doc.source = { kind, sessionId: session.id, revision, generated: session.result.meta.generated };
  if (kind === "power") powerGraph(doc, sourceRecord(revision === "a" ? session.result.powerTreeA : session.result.powerTree));
  else i2cGraph(doc, sourceRecord(revision === "a" ? session.result.i2cMapA : session.result.i2cMap));
  return autoLayoutDiagram(parseDiagramDocument(doc));
}
