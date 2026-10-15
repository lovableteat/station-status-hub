import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { parseDiagramDocument, type DiagramDocument } from "../../src/components/comparison/diagramModel.ts";
import { diagramToSvg } from "../../src/components/comparison/diagramExport.ts";
import { DIAGRAM_THEME, diagramNodeColors, diagramStrokeColor } from "../../src/components/comparison/diagramTheme.ts";
import { buildDiagramEdgeRoutes } from "../../src/components/comparison/diagramGeometry.ts";
import { diagramSymbolGraphics, diagramSymbolLabelBox, isElectricalSymbol } from "../../src/components/comparison/diagramSymbols.ts";

const source = await readFile(new URL("../../src/components/comparison/diagramExport.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function documentFixture(): DiagramDocument {
  return {
    version: 1, id: "diagram-export", title: "工程圖", createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      { id: "node-a", x: 0, y: 0, width: 120, height: 60, shape: "rectangle", label: "輸入電源", detail: "12 V", color: "#ffffff", refdes: "J1", page: 2 },
      { id: "node-b", x: 300, y: 140, width: 140, height: 80, shape: "ellipse", label: "負載 U1", detail: "3.3 V", color: "#111827" },
    ],
    edges: [{ id: "edge-a-b", source: "node-a", target: "node-b", sourcePort: "left", targetPort: "bottom", label: "電源線", color: "#334155", style: "dashed" }],
  };
}
function viewBox(svg: string) {
  return svg.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number);
}
function path(svg: string, id: string) {
  return svg.match(new RegExp(`data-edge-id="${id}" d="([^"]+)"`))![1];
}

test("SVG exports escape labels and metadata, render every supported shape, and contain no active or external content", () => {
  const doc = documentFixture();
  doc.title = '工程圖 <script>alert("title")</script>';
  doc.nodes[0].label = '<script>alert("node")</script> & 中文';
  doc.nodes[0].detail = '<image href="https://example.test/track" onload="alert(1)"/>';
  doc.nodes.push({ ...doc.nodes[0], id: "diamond", x: -200, y: -140, shape: "diamond" }, { ...doc.nodes[0], id: "note", x: 600, y: 240, shape: "note" });
  const svg = diagramToSvg(doc);
  assert.match(svg, /&lt;script&gt;alert\(&quot;node&quot;\)&lt;\/script&gt;/);
  assert.match(svg, /&amp; 中文/);
  assert.match(svg, /<rect data-node-id="node-a"/);
  assert.match(svg, /<ellipse data-node-id="node-b"/);
  assert.match(svg, /<polygon data-node-id="diamond"/);
  assert.match(svg, /<path data-node-id="note"/);
  assert.match(svg, /fill="#1f2937" clip-path=/, "pale nodes need dark readable labels");
  assert.doesNotMatch(svg, /<script|<foreignObject|<image|<iframe/);
  for (const tag of svg.match(/<[^>]+>/g) ?? []) assert.doesNotMatch(tag, /\s(?:href|src|onload)=/);
  assert.match(svg, /<marker[^>]+id="diagram-arrow-0"/);
  assert.match(svg, /stroke-dasharray="7 5"/);
  assert.match(svg, /<tspan[^>]*>/);
});

test("light canvas keeps pastel nodes and low-contrast connections legible without changing saved colors", () => {
  const luminance = (color: string) => {
    const values = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const contrast = (first: string, second: string) => {
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  for (const color of ["#ffffff", "#ffff00", "#79c9be", "#ef7b78", "#94a3b8", "#111827", "#000000"]) {
    const colors = diagramNodeColors(color);
    assert.match(colors.fill, /^#[a-f0-9]{6}$/);
    assert.ok(contrast(colors.text, colors.fill) >= 7, `node label contrast for ${color}`);
    assert.ok(contrast(colors.detail, colors.fill) >= 4.5, `node detail contrast for ${color}`);
    assert.ok(contrast(colors.stroke, DIAGRAM_THEME.canvas) >= 3.5, `stroke contrast for ${color}`);
    const doc = documentFixture();
    doc.nodes[0].color = color; doc.edges[0].color = color;
    const original = structuredClone(doc);
    const svg = diagramToSvg(doc);
    assert.ok(svg.includes(`data-node-id="node-a" fill="${colors.fill}" stroke="${colors.stroke}"`));
    assert.ok(svg.includes(`fill="${diagramStrokeColor(color)}"/></marker>`));
    assert.match(svg, new RegExp(`data-edge-id="edge-a-b"[^>]*stroke="${colors.stroke}"`));
    assert.doesNotMatch(svg, /color-mix|rgba\(|hsl\(/);
    assert.deepEqual(doc, original, "render colors must not replace the user's stored palette");
  }
});

test("edge endpoints honor explicit ports and bounds include negative nodes, arrow controls and labels", () => {
  const doc = documentFixture();
  doc.edges[0].lineType = "curve";
  const svg = diagramToSvg(doc);
  const numbers = path(svg, "edge-a-b").match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  assert.deepEqual(numbers.slice(0, 2), [0, 30], "source must begin at its left border");
  assert.ok(numbers[2] < 0);
  assert.equal(numbers[3], 30, "source tangent must point outward through its left port");
  assert.equal(numbers[4], 370);
  assert.ok(numbers[5] > 220, "target tangent must approach the bottom port from outside");
  assert.deepEqual(numbers.slice(-2), [370, 220]);
  const [x, y, width, height] = viewBox(svg);
  for (let index = 0; index < numbers.length; index += 2) {
    assert.ok(numbers[index] >= x && numbers[index] <= x + width);
    assert.ok(numbers[index + 1] >= y && numbers[index + 1] <= y + height);
  }
  assert.ok(x < 0 && y < 0);
  assert.ok(x + width > 440 && y + height > 220);
});

test("self edges route outside the node with correctly oriented source and target ports", () => {
  const doc = documentFixture();
  doc.nodes = [doc.nodes[0]];
  doc.edges = [{ id: "self", source: "node-a", target: "node-a", sourcePort: "right", targetPort: "top", label: "重試", color: "#334155" }];
  const svg = diagramToSvg(doc);
  const route = path(svg, "self");
  assert.match(route, /^M120 30 L160 30 /);
  assert.match(route, /L60 -40 L60 0$/);
  assert.ok(viewBox(svg)[1] <= -72, "loop and label must remain inside export bounds");
  doc.edges[0].targetPort = "right";
  const samePort = diagramToSvg(doc);
  assert.match(path(samePort, "self"), /^M120 30 L160 30 /);
  assert.match(path(samePort, "self"), /L160 30 L120 30$/);
});

test("unspecified ports match the editor's right-to-left defaults, including self edges", () => {
  const doc = documentFixture();
  delete doc.edges[0].sourcePort; delete doc.edges[0].targetPort;
  const numbers = path(diagramToSvg(doc), "edge-a-b").match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  assert.deepEqual(numbers.slice(0, 2), [120, 30]);
  assert.deepEqual(numbers.slice(-2), [300, 180]);
  doc.edges[0].target = "node-a";
  assert.match(path(diagramToSvg(doc), "edge-a-b"), /^M120 30 L160 30 /);
  assert.match(path(diagramToSvg(doc), "edge-a-b"), /L-40 30 L0 30$/);
});

test("export validation rejects unsafe colors, invalid coordinates and missing endpoints without mutating its input", () => {
  const original = documentFixture();
  const before = structuredClone(original);
  diagramToSvg(original);
  assert.deepEqual(original, before);
  for (const mutate of [
    (doc: DiagramDocument) => { doc.nodes[0].color = '#fff" onload="alert(1)'; },
    (doc: DiagramDocument) => { doc.nodes[0].x = Infinity; },
    (doc: DiagramDocument) => { doc.edges[0].target = "missing-node"; },
  ]) {
    const bad = documentFixture(); mutate(bad);
    assert.throws(() => diagramToSvg(bad), /圖表資料無效/);
  }
  const empty = documentFixture(); empty.nodes = []; empty.edges = [];
  assert.deepEqual(viewBox(diagramToSvg(empty)), [0, 0, 640, 360]);
});

interface HarnessOptions { image?: "hold" | "error" | "empty" | "constructor-error"; canvas?: "missing" | "draw-error" | "encode-error" | "encode-empty"; noBody?: boolean; clickError?: boolean; invalidPdf?: boolean; missingPdf?: boolean }
function exportHarness(options: HarnessOptions = {}) {
  const blobs = new Map<string, Blob>(), revoked: string[] = [], downloads: { name: string; blob: Blob }[] = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const images: FakeImage[] = [], anchors: { removed: boolean }[] = [], drawings: number[][] = [], pdfs: { options: Record<string, unknown>; image?: unknown[]; properties?: unknown }[] = [];
  let timerId = 0;
  class FakeImage {
    naturalWidth = options.image === "empty" ? 0 : 100;
    naturalHeight = 100;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() { if (options.image === "constructor-error") throw new Error("Image constructor failed"); images.push(this); }
    set src(_value: string) {
      if (options.image === "hold") return;
      queueMicrotask(() => options.image === "error" ? this.onerror?.() : this.onload?.());
    }
    removeAttribute() {}
  }
  const canvas = {
    width: 0, height: 0,
    getContext: () => options.canvas === "missing" ? null : {
      fillStyle: "", fillRect() {},
      drawImage(_image: unknown, ...values: number[]) { if (options.canvas === "draw-error") throw new Error("draw failed"); drawings.push(values); },
    },
    toBlob(callback: (blob: Blob | null) => void) {
      if (options.canvas === "encode-error") throw new Error("encoding failed");
      queueMicrotask(() => callback(options.canvas === "encode-empty" ? null : new Blob(["synthetic PNG"], { type: "image/png" })));
    },
  };
  class FakePdf {
    item: { options: Record<string, unknown>; image?: unknown[]; properties?: unknown };
    constructor(value: Record<string, unknown>) { this.item = { options: value }; pdfs.push(this.item); }
    setProperties(value: unknown) { this.item.properties = value; }
    addImage(...value: unknown[]) { this.item.image = value; }
    output() { return new Blob([options.invalidPdf ? "invalid" : "%PDF-1.7\nsynthetic"], { type: "application/pdf" }); }
  }
  const context = {
    exports: {}, Blob, TextEncoder, structuredClone, Uint8Array,
    Image: FakeImage,
    URL: {
      createObjectURL(blob: Blob) { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; },
      revokeObjectURL(url: string) { revoked.push(url); },
    },
    setTimeout(callback: () => void, delay: number) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    document: {
      body: options.noBody ? undefined : { appendChild() {} },
      createElement(type: string) {
        if (type === "canvas") return canvas;
        assert.equal(type, "a");
        const anchor = { download: "", href: "", rel: "", style: { display: "" }, removed: false,
          click() { if (options.clickError) throw new Error("download blocked"); downloads.push({ name: this.download, blob: blobs.get(this.href)! }); },
          remove() { this.removed = true; },
        };
        anchors.push(anchor); return anchor;
      },
    },
    require(name: string) {
      if (name === "./diagramModel.ts") return { parseDiagramDocument };
      if (name === "./diagramTheme.ts") return { DIAGRAM_THEME, diagramNodeColors, diagramStrokeColor };
      if (name === "./diagramGeometry.ts") return { buildDiagramEdgeRoutes };
      if (name === "./diagramSymbols.ts") return { diagramSymbolGraphics, diagramSymbolLabelBox, isElectricalSymbol };
      assert.equal(name, "jspdf");
      if (options.missingPdf) throw new Error("PDF module unavailable");
      return { jsPDF: FakePdf };
    },
  };
  vm.runInNewContext(compiled, context);
  const fireTimers = (delay: number) => {
    for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.callback(); }
  };
  return {
    download: (context.exports as { downloadDiagram: (doc: DiagramDocument, format: "json" | "svg" | "png" | "pdf") => Promise<void> }).downloadDiagram,
    blobs, revoked, downloads, timers, images, anchors, canvas, drawings, pdfs, fireTimers,
  };
}

test("JSON download is editable validated data and releases its download URL", async () => {
  const harness = exportHarness();
  const doc = documentFixture(); doc.title = 'Power / Tree: "工程圖"';
  await harness.download(doc, "json");
  assert.equal(harness.downloads.length, 1);
  assert.match(harness.downloads[0].name, /\.autocheck-diagram\.json$/);
  assert.doesNotMatch(harness.downloads[0].name, /[<>:"/\\|?*]/);
  assert.deepEqual(parseDiagramDocument(JSON.parse(await harness.downloads[0].blob.text())), doc);
  assert.equal(harness.anchors[0].removed, true);
  harness.fireTimers(10_000);
  assert.equal(harness.revoked.length, 1);
  const bad = { ...doc, script: "alert(1)" } as DiagramDocument;
  await assert.rejects(harness.download(bad, "json"), /圖表資料無效/);
  assert.equal(harness.downloads.length, 1);
});

test("node-free drawing exports preserve line routes, arrowheads, widths and editable JSON endpoints", async () => {
  const doc = documentFixture(); doc.nodes = [];
  doc.edges = [
    { id: "straight", source: "", target: "", sourcePoint: { x: -200, y: -100 }, targetPoint: { x: 400, y: 200 }, label: "手畫箭頭", color: "#2563eb", lineType: "straight", arrowhead: "both", width: 8 },
    { id: "elbow", source: "", target: "", sourcePoint: { x: 0, y: 0 }, targetPoint: { x: 100, y: 100 }, label: "", color: "#334155", lineType: "elbow", arrowhead: "none", width: 1, style: "dashed" },
    { id: "curve", source: "", target: "", sourcePoint: { x: 0, y: 200 }, targetPoint: { x: 400, y: 200 }, label: "", color: "#334155", lineType: "curve" },
  ];
  const svg = diagramToSvg(doc);
  assert.equal(path(svg, "straight"), "M-200 -100 L400 200");
  assert.match(path(svg, "elbow"), /L/); assert.doesNotMatch(path(svg, "elbow"), /C/);
  assert.match(path(svg, "curve"), /C/);
  assert.match(svg, /data-edge-id="straight"[^>]*stroke-width="8"[^>]*marker-start="url\(#diagram-arrow-0\)"[^>]*marker-end="url\(#diagram-arrow-0\)"/);
  assert.match(svg, /id="diagram-arrow-0"[^>]*markerWidth="24"[^>]*orient="auto-start-reverse"/);
  assert.doesNotMatch(svg.match(/data-edge-id="elbow"[^>]*>/)![0], /marker-/);
  assert.doesNotMatch(svg, /id="diagram-arrow-1"/);
  assert.match(svg, /data-edge-id="curve"[^>]*stroke-width="2"[^>]*marker-end=/);
  const [x, y, width, height] = viewBox(svg);
  assert.ok(x <= -232 && y <= -132 && x + width >= 432 && y + height >= 232);
  for (const format of ["json", "svg", "png", "pdf"] as const) {
    const harness = exportHarness();
    await harness.download(doc, format);
    assert.equal(harness.downloads.length, 1);
    if (format === "json") assert.deepEqual(parseDiagramDocument(JSON.parse(await harness.downloads[0].blob.text())), doc);
    if (format === "svg") assert.equal(await harness.downloads[0].blob.text(), svg);
    if (format === "png" || format === "pdf") assert.ok(harness.drawings[0][2] > 0 && harness.drawings[0][3] > 0);
    harness.fireTimers(10_000);
    assert.equal(new Set(harness.revoked).size, harness.blobs.size);
  }
});

test("electrical symbols, net labels, chosen frame fills, crossing bridges and double arrows reach every export format", async () => {
  const doc = documentFixture();
  doc.nodes = [
    { id: "R1", x: 0, y: 0, width: 180, height: 120, shape: "resistor", label: "R1", detail: "10 kΩ", color: "#f97316", rotation: 90 },
    { id: "C1", x: 240, y: 0, width: 180, height: 120, shape: "capacitor", label: "C1", detail: "100 nF", color: "#2563eb" },
    { id: "gnd", x: 480, y: 0, width: 100, height: 100, shape: "ground", label: "GND", detail: "", color: "#0f766e", rotation: 270 },
    { id: "net", x: 640, y: 0, width: 180, height: 60, shape: "netlabel", label: "I2C_SDA <R1>", detail: "", color: "#7c3aed", fillColor: "#e2e8f0" },
    { id: "frame", x: 880, y: 0, width: 180, height: 100, shape: "rectangle", label: "Controller", detail: "U1", color: "#f97316", fillColor: "#111827" },
  ];
  doc.edges = [
    { id: "horizontal", source: "", target: "", sourcePoint: { x: 0, y: 250 }, targetPoint: { x: 200, y: 250 }, label: "", color: "#2563eb", lineType: "straight", arrowhead: "none", jump: "arc" },
    { id: "vertical", source: "", target: "", sourcePoint: { x: 100, y: 180 }, targetPoint: { x: 100, y: 320 }, label: "", color: "#7c3aed", lineType: "straight", arrowhead: "both", jump: "arc" },
  ];
  const snapshot = structuredClone(doc), svg = diagramToSvg(doc);
  for (const shape of ["resistor", "capacitor", "ground", "netlabel"] as const) {
    assert.match(svg, new RegExp(`data-symbol="${shape}"`));
    assert.ok(svg.includes(`d="${diagramSymbolGraphics(shape)!.paths[0]}"`));
  }
  assert.match(svg, /transform="rotate\(90 50 50\)"/);
  assert.match(svg, /transform="rotate\(270 50 50\)"/);
  assert.match(svg, /10 kΩ/); assert.match(svg, /100 nF/);
  assert.match(svg, /I2C_SDA &lt;R1&gt;/);
  assert.match(svg, /data-node-id="frame" fill="#111827"/);
  const frameColors = diagramNodeColors("#f97316", "light", "#111827");
  assert.match(svg, new RegExp(`fill="${frameColors.text}" clip-path="url\\(#diagram-node-4\\)"`));
  assert.match(svg, /fill="#e2e8f0" stroke=/);
  assert.ok(/[QA]/.test(path(svg, "horizontal") + path(svg, "vertical")), "the exported crossing contains a real bridge curve");
  assert.match(svg, /data-edge-id="vertical"[^>]*marker-start="url\(#diagram-arrow-1\)"[^>]*marker-end="url\(#diagram-arrow-1\)"/);
  for (const format of ["json", "svg", "png", "pdf"] as const) {
    const harness = exportHarness();
    await harness.download(doc, format);
    assert.equal(harness.downloads.length, 1);
    if (format === "json") assert.deepEqual(parseDiagramDocument(JSON.parse(await harness.downloads[0].blob.text())), snapshot);
    else {
      const exportedSvg = format === "svg" ? await harness.downloads[0].blob.text() : await harness.blobs.get("blob:test-0")!.text();
      assert.equal(exportedSvg, svg, `${format} must use the same circuit strokes, names, fills and bridges`);
    }
  }
  assert.deepEqual(doc, snapshot);
});

test("export bridges erase the underpass using a background halo while preserving original arrow marker identities", () => {
  const doc = documentFixture(); doc.nodes = [];
  doc.edges = [
    { id: "bridge", source: "", target: "", sourcePoint: { x: 0, y: 50 }, targetPoint: { x: 200, y: 50 }, label: "top wire", color: "#2563eb", lineType: "straight", arrowhead: "both", width: 5, jump: "arc" },
    { id: "underpass", source: "", target: "", sourcePoint: { x: 100, y: -50 }, targetPoint: { x: 100, y: 150 }, label: "under wire", color: "#7c3aed", lineType: "straight", arrowhead: "none", width: 2, jump: "none" },
    { id: "other-bridge", source: "", target: "", sourcePoint: { x: 250, y: 0 }, targetPoint: { x: 350, y: 0 }, label: "no crossing", color: "#2563eb", lineType: "straight", arrowhead: "end", jump: "arc" },
  ];
  const svg = diagramToSvg(doc);
  assert.ok(svg.indexOf('data-edge-id="underpass"') < svg.indexOf('data-bridge-for="bridge"'), "an earlier document edge can own the bridge and must paint after the underpass");
  assert.ok(svg.indexOf('data-bridge-for="bridge"') < svg.indexOf('data-edge-id="bridge"'), "the halo must paint before its foreground arch");
  assert.ok(svg.indexOf('data-edge-id="bridge"') < svg.indexOf('data-edge-id="other-bridge"'), "bridge owners retain their relative document order");
  const halo = svg.match(/<path data-bridge-for="bridge"[^>]+\/>/)![0];
  assert.match(halo, / d="M[^"]+Q[^"]+"/);
  assert.match(halo, /fill="none" stroke="#ffffff" stroke-width="9"/);
  assert.match(halo, /pointer-events="none"/);
  assert.doesNotMatch(halo, /marker-/);
  assert.doesNotMatch(svg, /data-bridge-for="(?:underpass|other-bridge)"/);
  assert.match(svg, /data-edge-id="bridge"[^>]*marker-start="url\(#diagram-arrow-0\)"[^>]*marker-end="url\(#diagram-arrow-0\)"/);
  assert.match(svg, /data-edge-id="other-bridge"[^>]*marker-end="url\(#diagram-arrow-2\)"/);
  assert.doesNotMatch(JSON.stringify(parseDiagramDocument(doc)), /bridgePath|data-bridge-for/);
});

test("PNG exports use a detached snapshot, respect pixel limits and release SVG resources and canvas memory", async () => {
  const harness = exportHarness({ image: "hold" });
  const doc = documentFixture();
  doc.nodes[1].x = 8000; doc.nodes[1].y = 4500;
  const exporting = harness.download(doc, "png");
  doc.title = "changed while exporting"; doc.nodes[0].label = "late mutation";
  harness.images[0].onload!();
  await exporting;
  assert.equal(harness.downloads[0].name, "AutoCheck-工程圖.png");
  const source = await harness.blobs.get("blob:test-0")!.text();
  assert.match(source, /輸入電源/);
  assert.doesNotMatch(source, /late mutation/);
  assert.equal(harness.downloads[0].blob.type, "image/png");
  const [, , width, height] = harness.drawings[0];
  assert.ok(width <= 8192 && height <= 8192 && width * height <= 16 * 1024 * 1024);
  assert.equal(harness.revoked.includes("blob:test-0"), true);
  assert.equal(harness.canvas.width, 0); assert.equal(harness.canvas.height, 0);
  assert.equal(harness.images[0].onload, null); assert.equal(harness.images[0].onerror, null);
  harness.fireTimers(10_000);
  assert.equal(new Set(harness.revoked).size, harness.blobs.size);
});

test("PDF download rasterizes Chinese labels and fits the wide drawing into an explicit landscape page", async () => {
  const harness = exportHarness();
  const doc = documentFixture(); doc.nodes[1].x = 2000;
  await harness.download(doc, "pdf");
  assert.equal(harness.pdfs.length, 1);
  const pdf = harness.pdfs[0];
  assert.equal(pdf.options.orientation, "landscape");
  const [pageWidth, pageHeight] = pdf.options.format as number[];
  assert.ok(pageWidth > pageHeight && pageWidth <= 14000 && pageHeight <= 14000);
  assert.equal(pdf.image![1], "PNG");
  assert.equal(pdf.image![2], 24); assert.equal(pdf.image![3], 24);
  assert.equal(pdf.image![4], pageWidth - 48); assert.equal(pdf.image![5], pageHeight - 48);
  assert.equal(await harness.downloads[0].blob.slice(0, 5).text(), "%PDF-");
  assert.match(harness.downloads[0].name, /\.pdf$/);
  harness.fireTimers(10_000);
});

test("image, canvas, PDF and browser download failures reject without fake successful downloads or leaked SVG URLs", async () => {
  for (const options of [
    { image: "error" }, { image: "empty" }, { image: "constructor-error" },
    { canvas: "missing" }, { canvas: "draw-error" }, { canvas: "encode-error" }, { canvas: "encode-empty" },
    { invalidPdf: true }, { missingPdf: true }, { clickError: true }, { noBody: true },
  ] as HarnessOptions[]) {
    const harness = exportHarness(options);
    await assert.rejects(harness.download(documentFixture(), options.invalidPdf || options.missingPdf ? "pdf" : "png"));
    assert.deepEqual(harness.downloads, [], JSON.stringify(options));
    assert.equal(new Set(harness.revoked).size, harness.blobs.size, `all URLs must be revoked: ${JSON.stringify(options)}`);
    assert.equal(harness.timers.size, 0);
  }
});

test("oversized raster layouts and stalled image decoding fail explicitly while SVG export remains available", async () => {
  const doc = documentFixture(); doc.nodes[1].x = 1_000_000;
  const large = exportHarness();
  await assert.rejects(large.download(doc, "png"), /範圍太大/);
  assert.equal(large.blobs.size, 0);
  await large.download(doc, "svg");
  assert.match(large.downloads[0].name, /\.svg$/);
  large.fireTimers(10_000);
  const stalled = exportHarness({ image: "hold" });
  const pending = stalled.download(documentFixture(), "png");
  const rejected = assert.rejects(pending, /逾時/);
  stalled.fireTimers(20_000);
  await rejected;
  assert.equal(stalled.downloads.length, 0);
  assert.equal(stalled.revoked.length, 1);
  assert.equal(stalled.timers.size, 0);
});
