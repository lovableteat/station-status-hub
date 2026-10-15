import assert from "node:assert/strict";
import test from "node:test";
import { inflateRawSync } from "node:zlib";
import { DOMParser } from "@xmldom/xmldom";
import { diagramToDrawioXml } from "../../src/components/comparison/diagramDrawioExport.ts";
import { diagramEdgeEndpoint, diagramEdgeRoute } from "../../src/components/comparison/diagramGeometry.ts";
import { diagramNodeColors, diagramStrokeColor } from "../../src/components/comparison/diagramTheme.ts";
import { diagramSymbolLabelBox, diagramSymbolPortPosition, diagramSymbolPorts } from "../../src/components/comparison/diagramSymbols.ts";
import type { DiagramDocument, DiagramNode, DiagramRotation } from "../../src/components/comparison/diagramModel.ts";

const fixture = (): DiagramDocument => ({
  version: 1, id: "drawio-test", title: "電路圖", createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T01:00:00.000Z",
  viewport: { x: 20, y: 35, zoom: 0.8 },
  source: { kind: "power", sessionId: "session-1", revision: "b", generated: "2026-10-15" },
  nodes: [
    { id: "0", x: -50.25, y: -30, width: 180, height: 90, shape: "rectangle", label: "電源", detail: "輸入 12 V", color: "#79a9e8", fillColor: "#283d59" },
    { id: "1", x: 260, y: 80, width: 180, height: 120, shape: "resistor", label: "R1", detail: "10 kΩ", color: "#f1c232", refdes: "R1", page: 3 },
  ],
  edges: [{ id: "wire", source: "0", target: "1", sourcePort: "right", targetPort: "left", label: "VCC_3V3", color: "#5489c9", lineType: "elbow", arrowhead: "both", jump: "arc", width: 3, style: "dashed" }],
});

function parse(value: string) {
  return new DOMParser({ onError: (_level, message) => { throw new Error(message); } }).parseFromString(value, "text/xml");
}
function cell(root: ReturnType<typeof parse>, id: string) {
  const result = Array.from(root.getElementsByTagName("mxCell")).find(element => element.getAttribute("id") === id);
  assert.ok(result, `missing cell ${id}`);
  return result;
}
function styles(element: ReturnType<typeof cell>) {
  return Object.fromEntries(element.getAttribute("style")!.split(";").filter(Boolean).map(pair => {
    const split = pair.indexOf("=");
    return [pair.slice(0, split), pair.slice(split + 1)];
  }));
}
function stencil(element: ReturnType<typeof cell>) {
  const encoded = styles(element).shape.match(/^stencil\(([^)]+)\)$/)?.[1];
  assert.ok(encoded, "symbol must carry its portable editable stencil");
  return parse(decodeURIComponent(inflateRawSync(Buffer.from(encoded, "base64")).toString()));
}

test("exports an uncompressed editable mxfile with independent IDs, exact bounds and source metadata", () => {
  const doc = fixture(), original = structuredClone(doc), xml = diagramToDrawioXml(doc), root = parse(xml);
  assert.equal(root.documentElement.tagName, "mxfile");
  assert.equal(root.documentElement.getAttribute("compressed"), "false");
  assert.equal(root.getElementsByTagName("diagram")[0].getAttribute("name"), doc.title);
  assert.equal(root.getElementsByTagName("mxGraphModel")[0].getAttribute("background"), "#ffffff");
  assert.equal(root.getElementsByTagName("mxGraphModel")[0].getAttribute("autocheckSource"), JSON.stringify(doc.source));
  assert.equal(root.getElementsByTagName("mxGraphModel")[0].getAttribute("autocheckViewport"), JSON.stringify(doc.viewport));
  assert.equal(root.getElementsByTagName("mxCell").length, 5);
  assert.equal(cell(root, "0").hasAttribute("parent"), false);
  const node = cell(root, "node-0"), geometry = node.getElementsByTagName("mxGeometry")[0];
  assert.equal(node.getAttribute("vertex"), "1");
  assert.equal(node.getAttribute("value"), "電源\n輸入 12 V");
  assert.deepEqual(["x", "y", "width", "height"].map(key => geometry.getAttribute(key)), ["-50.25", "-30", "180", "90"]);
  assert.deepEqual(JSON.parse(node.getAttribute("autocheckNode")!), doc.nodes[0]);
  assert.deepEqual(doc, original, "conversion must not change the source document or its chosen colors");
});

test("every native basic shape and custom fill remains editable with the portable light-page palette", () => {
  const doc = fixture();
  doc.edges = [];
  doc.nodes = (["rectangle", "ellipse", "diamond", "note"] as const).map((shape, index) => ({ ...doc.nodes[0], id: shape, shape, x: index * 200 }));
  const root = parse(diagramToDrawioXml(doc));
  for (const [index, shape] of ["rectangle", "ellipse", "diamond", "note"].entries()) {
    const style = styles(cell(root, `node-${shape}`));
    assert.equal(style.shape, ["rectangle", "ellipse", "rhombus", "note"][index]);
    assert.equal(style.fillColor, "#283d59");
    assert.equal(style.fontColor, "#ffffff");
    assert.equal(style.strokeColor, diagramNodeColors(doc.nodes[index].color, "light", doc.nodes[index].fillColor).stroke);
    assert.equal(style.html, "0");
  }
  assert.equal(styles(cell(root, "node-rectangle")).rounded, "1");
  assert.equal(styles(cell(root, "node-note")).size, "18");
});

test("labels, details, titles and metadata are escaped as plaintext, preserving whitespace without active XML", () => {
  const doc = fixture();
  doc.title = 'Title <script> & "quoted"';
  doc.nodes[0].label = '<script onload="alert(1)"> & \'quoted\'\t 中文 😀';
  doc.nodes[0].detail = '<img src="https://example.test/track"/>\r\nnext';
  doc.edges[0].label = '"/><iframe src="https://example.test"/>\nNET';
  const xml = diagramToDrawioXml(doc), root = parse(xml);
  assert.match(xml, /&lt;script onload=&quot;alert\(1\)&quot;&gt; &amp; &apos;quoted&apos;&#9;/);
  assert.equal(cell(root, "node-0").getAttribute("value"), `${doc.nodes[0].label}\n${doc.nodes[0].detail}`);
  assert.equal(cell(root, "edge-wire").getAttribute("value"), doc.edges[0].label);
  assert.equal(root.getElementsByTagName("diagram")[0].getAttribute("name"), doc.title);
  for (const tag of ["script", "img", "image", "iframe", "foreignObject"]) assert.equal(root.getElementsByTagName(tag).length, 0);
  for (const node of Array.from(root.getElementsByTagName("mxCell"))) assert.equal(node.hasAttribute("onload"), false);
});

test("circuit stencils contain the real portable strokes, rotated terminals and upright caption bounds", () => {
  const doc = fixture();
  doc.edges = []; doc.nodes = [];
  for (const shape of ["resistor", "capacitor", "ground"] as const) for (const rotation of [0, 90, 180, 270] as DiagramRotation[]) {
    doc.nodes.push({ id: `${shape}-${rotation}`, x: 0, y: 0, width: 180, height: 120, shape, rotation, label: "R/C/GND", detail: "值", color: "#5489c9", fillColor: "#ff0000" });
  }
  const root = parse(diagramToDrawioXml(doc));
  for (const node of doc.nodes) {
    const element = cell(root, `node-${node.id}`), shape = stencil(element);
    assert.equal(styles(element).fillColor, "none", "circuit shapes never acquire a rectangular fill");
    assert.equal(styles(element).rotation, undefined, "geometry rotates while captions remain upright");
    const connections = Array.from(shape.getElementsByTagName("constraint"));
    assert.deepEqual(connections.map(item => item.getAttribute("name")), diagramSymbolPorts(node.shape, node.rotation));
    for (const connection of connections) {
      const port = connection.getAttribute("name")! as "left" | "right" | "top" | "bottom";
      const anchor = diagramSymbolPortPosition(node.shape, port, node.rotation)!;
      assert.equal(Number(connection.getAttribute("x")), anchor.x / 100);
      assert.equal(Number(connection.getAttribute("y")), anchor.y / 100);
      assert.equal(connection.getAttribute("perimeter"), "0");
    }
    const label = shape.getElementsByTagName("labelBounds")[0], bounds = diagramSymbolLabelBox(node.shape, node.rotation)!;
    assert.deepEqual(["x", "y", "w", "h"].map(key => Number(label.getAttribute(key))), [bounds.x, bounds.y, bounds.width, bounds.height]);
    assert.equal(label.getAttribute("if"), "boundedLbl");
    assert.ok(shape.getElementsByTagName("line").length >= (node.shape === "resistor" ? 8 : 4));
  }
  const resistor = stencil(cell(root, "node-resistor-90"));
  assert.deepEqual(["x", "y"].map(key => resistor.getElementsByTagName("move")[0].getAttribute(key)), ["50", "0"]);
  assert.deepEqual(["x", "y"].map(key => Array.from(resistor.getElementsByTagName("line")).at(-1)!.getAttribute(key)), ["50", "100"]);
});

test("Net Name exports the tag outline, its only terminal and the text area inside the tag", () => {
  const doc = fixture(); doc.edges = [];
  doc.nodes = [{ ...doc.nodes[0], id: "net", shape: "netlabel", label: "VCC_3V3", detail: "", height: 60 }];
  const root = parse(diagramToDrawioXml(doc)), node = cell(root, "node-net"), tag = stencil(node);
  assert.equal(node.getAttribute("value"), "VCC_3V3");
  assert.equal(tag.getElementsByTagName("close").length, 1);
  assert.equal(tag.getElementsByTagName("fillstroke").length, 1);
  assert.equal(tag.getElementsByTagName("constraint").length, 1);
  assert.equal(tag.getElementsByTagName("constraint")[0].getAttribute("name"), "left");
  assert.equal(tag.getElementsByTagName("labelBounds")[0].getAttribute("x"), "20");
});

test("attached edges normalize missing or unsupported rotated circuit ports using the shared endpoint rules", () => {
  const doc = fixture();
  doc.nodes[0] = { ...doc.nodes[0], shape: "capacitor", rotation: 90, width: 120, height: 180 };
  doc.nodes[1] = { ...doc.nodes[1], shape: "ground", rotation: 270, width: 100, height: 100 };
  delete doc.edges[0].sourcePort;
  doc.edges[0].targetPort = "top";
  const root = parse(diagramToDrawioXml(doc)), edge = cell(root, "edge-wire"), style = styles(edge);
  assert.equal(edge.getAttribute("source"), "node-0");
  assert.equal(edge.getAttribute("target"), "node-1");
  assert.deepEqual([style.exitX, style.exitY], ["0.5", "1"], "a rotated source defaults to the last real terminal");
  assert.deepEqual([style.entryX, style.entryY], ["0", "0.5"], "ground connects through its single real terminal");
  assert.equal(style.exitPerimeter, "0"); assert.equal(style.entryPerimeter, "0");
  assert.deepEqual(JSON.parse(edge.getAttribute("autocheckEdge")!), doc.edges[0]);
  assert.equal(edge.getElementsByTagName("mxGeometry")[0].getAttribute("relative"), "1");
});

test("free and mixed endpoints keep their actual coordinates and never invent a terminal cell", () => {
  const doc = fixture();
  doc.edges = [
    { ...doc.edges[0], id: "free", source: "", target: "", sourcePoint: { x: -120.75, y: 300 }, targetPoint: { x: 830, y: -80.125 }, lineType: "straight" },
    { ...doc.edges[0], id: "mixed", target: "", targetPoint: { x: 500, y: 400 }, lineType: "straight" },
  ];
  const root = parse(diagramToDrawioXml(doc)), free = cell(root, "edge-free"), mixed = cell(root, "edge-mixed");
  assert.equal(free.hasAttribute("source"), false); assert.equal(free.hasAttribute("target"), false);
  const endpoints = Array.from(free.getElementsByTagName("mxPoint"));
  assert.deepEqual(endpoints.map(item => [item.getAttribute("as"), item.getAttribute("x"), item.getAttribute("y")]), [["sourcePoint", "-120.75", "300"], ["targetPoint", "830", "-80.125"]]);
  assert.equal(mixed.getAttribute("source"), "node-0"); assert.equal(mixed.hasAttribute("target"), false);
  assert.equal(mixed.getElementsByTagName("mxPoint")[0].getAttribute("as"), "targetPoint");
});

test("arrowheads, custom width, dashes and crossing arches use editable draw.io line styles", () => {
  const doc = fixture();
  doc.edges = ["both", "end", "none"].map((arrowhead, index) => ({ ...doc.edges[0], id: `head-${index}`, arrowhead: arrowhead as "both" | "end" | "none", jump: index === 0 ? "arc" : "none", width: index + 1, style: index === 0 ? "dashed" : "solid" }));
  const root = parse(diagramToDrawioXml(doc));
  for (let index = 0; index < doc.edges.length; index++) {
    const style = styles(cell(root, `edge-head-${index}`));
    assert.equal(style.startArrow, index === 0 ? "block" : "none");
    assert.equal(style.endArrow, index === 2 ? "none" : "block");
    assert.equal(style.strokeWidth, String(index + 1));
    assert.equal(style.strokeColor, diagramStrokeColor(doc.edges[index].color));
    assert.equal(style.dashed, index === 0 ? "1" : "0");
    assert.equal(style.jumpStyle, index === 0 ? "arc" : "none");
  }
  const order = Array.from(root.getElementsByTagName("mxCell")).map(item => item.getAttribute("id"));
  assert.ok(order.indexOf("edge-head-0") > order.indexOf("edge-head-2"), "bridge owners are rendered after plain wires");
});

test("straight and elbow routes preserve shared bends, while cubic curves export editable sampled waypoints", () => {
  const doc = fixture();
  doc.edges = ["straight", "elbow", "curve"].map((lineType, index) => ({ ...doc.edges[0], id: `path-${index}`, lineType: lineType as "straight" | "elbow" | "curve" }));
  const root = parse(diagramToDrawioXml(doc));
  for (let index = 0; index < 2; index++) {
    const element = cell(root, `edge-path-${index}`), waypoints = Array.from(element.getElementsByTagName("mxPoint"));
    const expected = diagramEdgeRoute(doc.edges[index], doc.nodes).points.slice(1, -1);
    assert.deepEqual(waypoints.map(item => [Number(item.getAttribute("x")), Number(item.getAttribute("y"))]), expected.map(item => [item.x, item.y]));
    assert.equal(styles(element).curved, "0");
  }
  const curve = cell(root, "edge-path-2");
  assert.equal(styles(curve).curved, "1");
  assert.equal(curve.getElementsByTagName("mxPoint").length, 15);
  const source = diagramEdgeEndpoint(doc.edges[2], "source", doc.nodes).point, target = diagramEdgeEndpoint(doc.edges[2], "target", doc.nodes).point;
  for (const item of Array.from(curve.getElementsByTagName("mxPoint"))) {
    assert.ok(Number.isFinite(Number(item.getAttribute("x"))));
    assert.ok(Number(item.getAttribute("y")) >= Math.min(source.y, target.y) && Number(item.getAttribute("y")) <= Math.max(source.y, target.y));
  }
});

test("self loops retain the shared exterior polyline even when the native line type is curve", () => {
  const doc = fixture(); doc.nodes = [doc.nodes[0]];
  doc.edges = [{ ...doc.edges[0], source: "0", target: "0", sourcePort: "right", targetPort: "top", lineType: "curve" }];
  const edge = cell(parse(diagramToDrawioXml(doc)), "edge-wire");
  assert.equal(styles(edge).curved, "0");
  const expected = diagramEdgeRoute(doc.edges[0], doc.nodes).points.slice(1, -1);
  assert.deepEqual(Array.from(edge.getElementsByTagName("mxPoint")).map(item => [Number(item.getAttribute("x")), Number(item.getAttribute("y"))]), expected.map(item => [item.x, item.y]));
});

test("missing optional line fields keep the native right-to-left, elbow, end-arrow defaults", () => {
  const doc = fixture();
  doc.edges = [{ id: "default", source: "0", target: "1", label: "", color: "#5489c9" }];
  const style = styles(cell(parse(diagramToDrawioXml(doc)), "edge-default"));
  assert.deepEqual([style.exitX, style.exitY, style.entryX, style.entryY], ["1", "0.5", "0", "0.5"]);
  assert.equal(style.curved, "0"); assert.equal(style.startArrow, "none"); assert.equal(style.endArrow, "block");
  assert.equal(style.strokeWidth, "2"); assert.equal(style.dashed, "0"); assert.equal(style.jumpStyle, "none");
});

test("invalid documents and XML-forbidden Unicode fail before returning a corrupt file", () => {
  const doc = fixture(); doc.nodes[0].color = '#fff;image=https://example.test/track';
  assert.throws(() => diagramToDrawioXml(doc), /圖表資料無效/);
  const unicode = fixture(); unicode.nodes[0].label = "bad\ud800text";
  assert.throws(() => diagramToDrawioXml(unicode), /XML 不支援/);
  const unknown = fixture(); unknown.nodes[0].shape = "unsupported" as DiagramNode["shape"];
  assert.throws(() => diagramToDrawioXml(unknown), /圖表資料無效/);
});
