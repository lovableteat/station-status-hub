import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { createBlankDrawioDocument, MAX_DRAWIO_BYTES, parseDrawioDocument, validateDrawioXml } from "../../src/components/comparison/drawioDocument.ts";

const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || "../qa-tools", "package.json"));
const { JSDOM } = qa("jsdom");
const browser = new JSDOM();
const originalParser = Object.getOwnPropertyDescriptor(globalThis, "DOMParser");
Object.defineProperty(globalThis, "DOMParser", { configurable: true, value: browser.window.DOMParser });
test.after(() => {
  browser.window.close();
  if (originalParser) Object.defineProperty(globalThis, "DOMParser", originalParser);
  else Reflect.deleteProperty(globalThis, "DOMParser");
});

const stamp = "2026-10-15T00:00:00.000Z";
const model = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="R1" value="R1 &amp; 10 kΩ" style="shape=mxgraph.electrical.resistors.resistor_1;strokeColor=#aa4400" parent="1" vertex="1"><mxGeometry x="42" y="80" width="100" height="40" as="geometry"/></mxCell></root></mxGraphModel>';
const compressed = deflateRawSync(encodeURIComponent(model)).toString("base64");
const native = `\uFEFF<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" modified="2026-10-15T00:00:00.000Z" version="28.2.6" custom="keep-me">\n  <diagram id="one" name="電路圖">${compressed}</diagram>\n  <diagram id="two" name="Uncompressed &amp; custom">${model}</diagram>\n</mxfile>\n`;
const document = () => ({ version: 1, id: "drawio-1", title: "電路圖", xml: native, createdAt: stamp, updatedAt: stamp });

test("native compressed and uncompressed multiple pages remain byte-identical with all metadata", () => {
  assert.equal(validateDrawioXml(native), native);
  const input = document();
  const parsed = parseDrawioDocument(input);
  assert.deepEqual(parsed, input);
  assert.notEqual(parsed, input);
  assert.equal(Buffer.compare(Buffer.from(parsed.xml), Buffer.from(native)), 0);
  input.title = "Changed in caller";
  assert.equal(parsed.title, "電路圖");
  assert.equal(validateDrawioXml(model), model);
  const nullPrototype = Object.assign(Object.create(null), document());
  assert.equal(Object.getPrototypeOf(parseDrawioDocument(nullPrototype)), Object.prototype);
});

test("blank documents contain a native editable page and unique cryptographic IDs", () => {
  const first = createBlankDrawioDocument("  新電路圖  ");
  const second = createBlankDrawioDocument(" ");
  assert.match(first.id, /^drawio-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
  assert.notEqual(first.id, second.id);
  assert.equal(first.title, "新電路圖");
  assert.equal(second.title, "未命名 DRAWIO 圖表");
  assert.equal(first.createdAt, first.updatedAt);
  assert.equal(validateDrawioXml(first.xml), first.xml);
  const xml = new browser.window.DOMParser().parseFromString(first.xml, "application/xml");
  assert.equal(xml.querySelectorAll("mxfile > diagram > mxGraphModel > root > mxCell").length, 2);
});

test("malformed XML, foreign containers and unsafe declarations are rejected before storage", () => {
  for (const xml of ["", "   ", "<mxfile>", "<mxfile/><mxfile/>", "<mxfile><diagram></mxfile>", "<html><mxGraphModel/></html>", "<svg/>", "<mxfile/>", "<mxfile><wrapper><diagram/></wrapper></mxfile>", '<mxfile><diagram name="&unknown;"/></mxfile>', '<!DOCTYPE mxfile [<!ENTITY demo "boom">]><mxfile><diagram>&demo;</diagram></mxfile>', '<!DOCTYPE mxfile SYSTEM "https://example.test/never-fetch"><mxfile><diagram/></mxfile>', '<!ENTITY demo "value"><mxfile><diagram/></mxfile>', "<mxfile><diagram>\u0000</diagram></mxfile>"]) {
    assert.throws(() => validateDrawioXml(xml), /DRAWIO 圖稿資料無效/);
  }
  for (const value of [null, {}, 1, false]) assert.throws(() => validateDrawioXml(value as string), /請選擇/);
});

test("XML byte limit uses UTF-8 and rejects oversize text before invoking the parser", () => {
  const envelope = "<mxfile><diagram></diagram></mxfile>";
  const exact = "<mxfile><diagram>" + "x".repeat(MAX_DRAWIO_BYTES - envelope.length) + "</diagram></mxfile>";
  let calls = 0;
  class Parser {
    parseFromString() {
      calls++;
      return { documentElement: { tagName: "mxfile", children: [{ tagName: "diagram" }] }, doctype: null, getElementsByTagName: () => [] };
    }
  }
  assert.equal(validateDrawioXml(exact, Parser as unknown as typeof DOMParser), exact);
  assert.equal(calls, 1);
  assert.throws(() => validateDrawioXml(exact + "x", Parser as unknown as typeof DOMParser), /20 MB/);
  const unicodeOversize = "<mxfile><diagram>" + "圖".repeat(Math.floor(MAX_DRAWIO_BYTES / 3)) + "</diagram></mxfile>";
  assert.ok(unicodeOversize.length < MAX_DRAWIO_BYTES);
  assert.throws(() => validateDrawioXml(unicodeOversize, Parser as unknown as typeof DOMParser), /20 MB/);
  assert.equal(calls, 1);
});

test("document validation rejects accessors, prototypes, symbols, unknown fields and incomplete records", () => {
  let getterRead = false;
  const accessor = { ...document() };
  Object.defineProperty(accessor, "xml", { get() { getterRead = true; return native; } });
  class CustomDocument { data = document(); }
  const bad = [null, [], new CustomDocument(), Object.assign(Object.create({ inherited: true }), document()), accessor, { ...document(), unknown: true }, { ...document(), [Symbol("payload")]: true }, JSON.parse('{"__proto__":{},"version":1}'), { ...document(), constructor: "forged" }, { ...document(), prototype: {} }];
  for (const item of bad) assert.throws(() => parseDrawioDocument(item), /DRAWIO 圖稿資料無效/);
  assert.equal(getterRead, false);
  for (const key of Object.keys(document())) {
    const incomplete: Record<string, unknown> = document();
    delete incomplete[key];
    assert.throws(() => parseDrawioDocument(incomplete), /缺少必要欄位/);
  }
});

test("document metadata enforces canonical time, bounded names and safe IDs without normalizing XML", () => {
  for (const mutation of [{ version: 2 }, { id: "../foreign" }, { id: "x".repeat(161) }, { title: " " }, { title: "x".repeat(241) }, { title: "name\u0000" }, { createdAt: "2026-02-30T00:00:00.000Z" }, { updatedAt: "2026-10-15T00:00:00Z" }, { xml: "<svg/>" }]) assert.throws(() => parseDrawioDocument({ ...document(), ...mutation }));
  assert.equal(parseDrawioDocument({ ...document(), title: "  keep spaces  " }).title, "  keep spaces  ");
});

test("unavailable XML parsing fails with an actionable error and does not accept unchecked content", () => {
  assert.throws(() => validateDrawioXml(native, null as unknown as typeof DOMParser), /瀏覽器不支援 XML 讀取/);
});
