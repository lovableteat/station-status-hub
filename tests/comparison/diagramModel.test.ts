import assert from "node:assert/strict";
import test from "node:test";
import {
  autoLayoutDiagram, createBlankDiagram, createDiagramFromResult,
  MAX_DIAGRAM_EDGES, MAX_DIAGRAM_NODES, parseDiagramDocument,
} from "../../src/components/comparison/diagramModel.ts";
import type { DiagramDocument, DiagramNode } from "../../src/components/comparison/diagramModel.ts";
import type { ComparisonSession } from "../../src/components/comparison/types.ts";

function node(id = "node-1", x = 0): DiagramNode {
  return { id, x, y: 0, width: 240, height: 100, shape: "rectangle", label: id, detail: "", color: "#2563eb" };
}

function document(): DiagramDocument {
  return {
    version: 1, id: "diagram-1", title: "Board graph", createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z",
    nodes: [node("node-1"), node("node-2", 400)],
    edges: [{ id: "edge-1", source: "node-1", target: "node-2", sourcePort: "right", targetPort: "left", label: "3.3 V", color: "#64748b", style: "solid" }],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function session(): ComparisonSession {
  return {
    version: 1, id: JSON.stringify(["Board", "EVT", "DVT"]), projectName: "Board", savedAt: "2026-10-15T00:00:00.000Z", replies: {}, history: [],
    result: {
      meta: { tool_version: "0.2.0", generated: "2026-10-15 08:00:00", a: { label: "EVT", sources: [] }, b: { label: "DVT", sources: [] } },
      findings: [], rows: [], overview: [], capRows: [], railTodo: [], railDomain: [], inputIssues: [], warnings: [], library: [], artifacts: [],
      powerTreeA: { rails: { P12V: { v: 12 } }, edges: [], orphans: [] },
      powerTree: {
        rails: { P12V: { v: 12, vsrc: "名稱", loads: ["PU1"] }, P3V3: { v: 3.3, vsrc: "FB", members: ["P3V3", "VDD_3V3"], loads: ["U2"] }, AUX: { v: 1.8 } },
        edges: [{ conv: "PU1", mpn: "MPQ8633A", kind: "buck / switcher", built: true, rail_in: "P12V", rail_out: "P3V3", via: ["PL1"], en: ["POWER_EN"], pg: ["POWER_PG"], page: 7 }],
        orphans: [{ rail: "AUX", voltage: 1.8, source: "not identified", internal: false }],
      },
      i2cMapA: {}, i2cMap: {},
    },
  };
}

test("blank documents have independent IDs and strict parsing returns detached plain data", () => {
  const a = createBlankDiagram("  "), b = createBlankDiagram("New graph");
  assert.equal(a.title, "未命名圖表");
  assert.notEqual(a.id, b.id);
  assert.equal(a.createdAt, a.updatedAt);
  assert.deepEqual(a.nodes, []);
  const original = document();
  const parsed = parseDiagramDocument(original);
  parsed.nodes[0].label = "Changed";
  parsed.edges[0].label = "Changed";
  parsed.viewport.x = 42;
  assert.equal(original.nodes[0].label, "node-1");
  assert.equal(original.edges[0].label, "3.3 V");
  assert.equal(original.viewport.x, 0);
  assert.deepEqual(parseDiagramDocument(JSON.parse(JSON.stringify(original))), original);
});

test("imports reject extra/prototype/accessor payloads without invoking getters", () => {
  const mutations: ((doc: DiagramDocument) => unknown)[] = [
    doc => ({ ...doc, unknown: true }),
    doc => Object.setPrototypeOf(doc, { polluted: true }),
    doc => JSON.parse(JSON.stringify(doc).replace('"version":1', '"version":1,"__proto__":{"polluted":true}')),
    doc => { (doc.nodes[0] as unknown as Record<string, unknown>).constructor = {}; return doc; },
    doc => { (doc.edges as unknown as Record<string, unknown>).extra = {}; return doc; },
    doc => { delete doc.nodes[0]; return doc; },
    doc => ({ ...doc, source: { kind: "power", sessionId: "session", revision: "b", generated: "now", prototype: {} } }),
  ];
  for (const mutate of mutations) assert.throws(() => parseDiagramDocument(mutate(document())), /圖表資料無效/);
  let invoked = 0;
  const payload = document();
  Object.defineProperty(payload.nodes[0], "label", { get() { invoked++; return "unsafe"; }, enumerable: true });
  assert.throws(() => parseDiagramDocument(payload), /存取器/);
  assert.equal(invoked, 0);
});

test("imports enforce finite coordinates, dimensions, plain colors, bounded text and actual dates", () => {
  const badNodes = [
    { x: NaN }, { y: Infinity }, { x: 1_000_001 }, { y: -1_000_001 }, { width: 23 }, { height: 2401 },
    { color: "red" }, { color: "#fff" }, { color: "url(https://invalid.test)" }, { color: "var(--primary)" },
    { label: "x".repeat(501) }, { detail: "x".repeat(4001) }, { label: "unsafe\u0000label" },
    { shape: "script" }, { page: 0 }, { page: 1.5 }, { refdes: "x".repeat(161) },
  ];
  for (const patch of badNodes) {
    const doc = document(); Object.assign(doc.nodes[0], patch);
    assert.throws(() => parseDiagramDocument(doc), /圖表資料無效/);
  }
  for (const patch of [{ zoom: 0 }, { zoom: 8.01 }, { x: Infinity }]) {
    const doc = document(); Object.assign(doc.viewport, patch);
    assert.throws(() => parseDiagramDocument(doc), /縮放/);
  }
  assert.throws(() => parseDiagramDocument({ ...document(), createdAt: "2026-02-31T00:00:00.000Z" }), /時間/);
  assert.throws(() => parseDiagramDocument({ ...document(), title: " " }), /名稱/);
  assert.throws(() => parseDiagramDocument({ ...document(), version: 2 }), /版本/);
});

test("imports reject duplicate/dangling identifiers and invalid ports while permitting cycles", () => {
  for (const change of [
    (doc: DiagramDocument) => { doc.nodes[1].id = doc.nodes[0].id; },
    (doc: DiagramDocument) => { doc.edges.push({ ...doc.edges[0] }); },
    (doc: DiagramDocument) => { doc.edges[0].target = "absent"; },
    (doc: DiagramDocument) => { doc.edges[0].id = doc.nodes[0].id; },
    (doc: DiagramDocument) => { doc.edges[0].sourcePort = "center" as "left"; },
    (doc: DiagramDocument) => { doc.nodes[0].id = "../unsafe"; },
  ]) {
    const doc = document(); change(doc);
    assert.throws(() => parseDiagramDocument(doc), /圖表資料無效/);
  }
  const doc = document();
  doc.edges.push({ ...doc.edges[0], id: "self-edge", source: "node-1", target: "node-1" });
  doc.edges.push({ ...doc.edges[0], id: "back-edge", source: "node-2", target: "node-1" });
  assert.equal(parseDiagramDocument(doc).edges.length, 3);
});

test("the node and edge count limits cannot be bypassed by imported arrays", () => {
  const doc = document();
  doc.nodes = Array.from({ length: MAX_DIAGRAM_NODES }, (_, i) => node(`n-${i}`));
  doc.edges = Array.from({ length: MAX_DIAGRAM_EDGES }, (_, i) => ({ id: `e-${i}`, source: "n-0", target: "n-1", label: "", color: "#64748b" }));
  assert.equal(parseDiagramDocument(doc).edges.length, MAX_DIAGRAM_EDGES);
  doc.edges.push({ ...doc.edges[0], id: "one-too-many" });
  assert.throws(() => parseDiagramDocument(doc), /6000/);
  doc.edges = [];
  doc.nodes.push(node("one-too-many"));
  assert.throws(() => parseDiagramDocument(doc), /2000/);
});

test("Power Tree conversion preserves actual rail/converter topology, provenance, RefDes/page and the original session", () => {
  const input = session(), snapshot = structuredClone(input);
  const doc = createDiagramFromResult(input, "power");
  const converter = doc.nodes.find(node => node.refdes === "PU1")!;
  const source = doc.nodes.find(node => node.label.startsWith("P12V\n"))!;
  const target = doc.nodes.find(node => node.label.startsWith("P3V3\n"))!;
  assert.ok(source && target && converter);
  assert.equal(converter.page, 7);
  assert.match(converter.detail, /POWER_EN/);
  assert.ok(doc.edges.some(edge => edge.source === source.id && edge.target === converter.id));
  assert.ok(doc.edges.some(edge => edge.source === converter.id && edge.target === target.id && edge.label === "PL1"));
  assert.ok(doc.nodes.some(node => node.label.startsWith("AUX\n") && /not identified/.test(node.detail)));
  assert.deepEqual(doc.source, { kind: "power", sessionId: input.id, revision: "b", generated: input.result.meta.generated });
  assert.equal(parseDiagramDocument(doc).nodes.length, 4);
  assert.deepEqual(input, snapshot);
  const old = createDiagramFromResult(input, "power", "a");
  assert.equal(old.nodes.length, 1);
  assert.equal(old.source!.revision, "a");
  assert.match(old.title, /EVT/);
  const repeated = createDiagramFromResult(input, "power");
  assert.deepEqual(repeated.nodes.map(node => node.id), doc.nodes.map(node => node.id));
});

test("multi-output converters stay one editable IC and DNP/diode edges retain their visual distinction", () => {
  const input = session();
  const original = (input.result.powerTree.edges as Record<string, unknown>[])[0];
  (input.result.powerTree.edges as Record<string, unknown>[]).push({ ...original, rail_out: "P1V8", built: false, via: [] });
  const doc = createDiagramFromResult(input, "power");
  assert.equal(doc.nodes.filter(node => node.refdes === "PU1").length, 1);
  assert.ok(doc.nodes.some(node => node.label === "P1V8"));
  assert.ok(doc.edges.some(edge => edge.style === "dashed"));
});

test("I2C conversion uses SDA/SCL segments, real device addresses, upstream connector and mux-channel topology", () => {
  const input = session();
  const sda = { sid: "SDA:I2C0_SDA", line: "SDA", nets: ["I2C0_SDA"], devices: ["U12", "U31"], built_pullups: ["R1 2.2K -> P3V3"], dnp_pullups: [], links: [] };
  const scl = { sid: "SCL:I2C0_SCL", line: "SCL", nets: ["I2C0_SCL"], devices: ["U12", "U31"], built_pullups: [], dnp_pullups: [], links: [] };
  const child = { sid: "SDA:I2C3_SDA", line: "SDA", nets: ["I2C3_SDA"], devices: ["U12", "U50"], built_pullups: [], dnp_pullups: [], links: [] };
  input.result.i2cMap = {
    devices: {
      U12: { refdes: "U12", symbol: "PCA9548", kind: "mux", addr: 112, verified: true, built: true, page: 5, sda_seg: [sda.sid, child.sid], scl_seg: [scl.sid] },
      U31: { refdes: "U31", symbol: "TMP451", kind: "device", addr: 76, verified: false, built: true, page: 8, sda_seg: [sda.sid], scl_seg: [scl.sid], sda_pins: ["U31.3 SDA"] },
      U50: { refdes: "U50", symbol: "EEPROM", addr: 80, built: false, page: 9, sda_seg: [child.sid] },
    },
    buses: [
      { bid: "I2C0_SDA", sda_nets: ["I2C0_SDA"], scl_nets: ["I2C0_SCL"], devices: ["U12", "U31"], segments: [sda, scl], speed: "400 kHz", conn_pins: [["SDA", "I2C0_SDA", "CN3.B5 SDA0"]], part_values: { CN3: "HEADER" } },
      { bid: "I2C3_SDA", sda_nets: ["I2C3_SDA"], scl_nets: [], devices: ["U12", "U50"], segments: [child], parent: "U12 ch3", conn_pins: [], host_pins: [] },
    ],
  };
  const snapshot = structuredClone(input);
  const doc = createDiagramFromResult(input, "i2c");
  const mux = doc.nodes.find(node => node.refdes === "U12")!;
  const sensor = doc.nodes.find(node => node.refdes === "U31")!;
  const connector = doc.nodes.find(node => node.refdes === "CN3")!;
  const childBus = doc.nodes.find(node => node.label.startsWith("I2C3_SDA\n"))!;
  assert.equal(mux.shape, "diamond");
  assert.equal(sensor.page, 8);
  assert.match(sensor.label, /0x4C（未驗證）/);
  assert.match(connector.label, /HEADER/);
  assert.ok(doc.edges.some(edge => edge.source === mux.id && edge.target === childBus.id && edge.label === "ch3"));
  const childSegment = doc.nodes.find(node => node.label === "SDA\nI2C3_SDA")!;
  assert.ok(!doc.edges.some(edge => edge.source === childSegment.id && edge.target === mux.id), "a mux channel must not become its own downstream load");
  assert.ok(doc.edges.some(edge => edge.target === sensor.id && edge.label === "SDA"));
  assert.ok(doc.edges.some(edge => edge.target === sensor.id && edge.label === "SCL"));
  const dnp = doc.nodes.find(node => node.refdes === "U50")!;
  assert.match(dnp.label, /DNP/);
  assert.ok(doc.edges.some(edge => edge.target === dnp.id && edge.style === "dashed"));
  assert.ok(doc.edges.some(edge => edge.source === connector.id));
  assert.deepEqual(input, snapshot);
  assert.equal(parseDiagramDocument(doc).source!.kind, "i2c");
});

test("auto layout terminates on cycles/self loops, lays out disconnected nodes, and preserves input data", () => {
  const doc = document();
  doc.nodes.push(node("disconnected"));
  doc.edges.push({ ...doc.edges[0], id: "back", source: "node-2", target: "node-1" }, { ...doc.edges[0], id: "loop", target: "node-1" });
  const snapshot = structuredClone(doc);
  const laidOut = autoLayoutDiagram(doc);
  assert.deepEqual(doc, snapshot);
  assert.equal(new Set(laidOut.nodes.map(node => `${node.x}:${node.y}`)).size, 3);
  assert.deepEqual(laidOut.edges, doc.edges);
  assert.deepEqual(laidOut.viewport, { x: 0, y: 0, zoom: 1 });
  assert.equal(parseDiagramDocument(laidOut).nodes.length, 3);
  const repeated = autoLayoutDiagram(doc);
  assert.deepEqual(repeated.nodes, laidOut.nodes);
});

test("maximum-size cycles and extreme dimensions lay out within validated coordinate bounds without recursion", () => {
  const doc = createBlankDiagram();
  doc.nodes = Array.from({ length: MAX_DIAGRAM_NODES }, (_, i) => ({ ...node(`n-${String(i).padStart(4, "0")}`), width: 2400, height: 2400 }));
  doc.edges = doc.nodes.map((node, i) => ({ id: `e-${i}`, source: node.id, target: doc.nodes[(i + 1) % doc.nodes.length].id, label: "", color: "#64748b" }));
  const result = autoLayoutDiagram(doc);
  assert.equal(parseDiagramDocument(result).nodes.length, MAX_DIAGRAM_NODES);
  assert.ok(result.nodes.every(node => node.x >= 0 && node.x < 1_000_000 && node.y >= 0 && node.y < 1_000_000));
  assert.equal(new Set(result.nodes.map(node => `${node.x}:${node.y}`)).size, MAX_DIAGRAM_NODES);
});

test("source conversion stops at graph budgets and rejects malformed topology instead of making dangling edges", () => {
  const huge = session();
  huge.result.powerTree = { rails: Object.fromEntries(Array.from({ length: MAX_DIAGRAM_NODES + 1 }, (_, i) => [`P${i}`, {}])) };
  assert.throws(() => createDiagramFromResult(huge, "power"), /2000/);
  const broken = session();
  broken.result.powerTree = { rails: {}, edges: [{ conv: "U1", rail_in: "P12V" }] };
  assert.throws(() => createDiagramFromResult(broken, "power"), /缺少/);
});
