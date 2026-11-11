const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
const { JSDOM } = qa('jsdom');

// Real libraries, synthetic in-memory data, and no production services.
test('patched rich text stack retains text, formatting, tables and images without inherited executable attributes', () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="editor"></div></body></html>', { pretendToBeVisual: true });
  const previous = new Map();
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'DOMParser', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: typeof dom.window[name] === 'function' && ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(name) ? dom.window[name].bind(dom.window) : dom.window[name] });
  }
  let editor;
  try {
    const { Editor, mergeAttributes } = require('@tiptap/core');
    const StarterKit = require('@tiptap/starter-kit').default;
    const Image = require('@tiptap/extension-image').default;
    const Link = require('@tiptap/extension-link').default;
    const { TextStyle } = require('@tiptap/extension-text-style');
    const { Color } = require('@tiptap/extension-color');
    const { Table, TableRow, TableHeader, TableCell } = require('@tiptap/extension-table');
    assert.match(fs.readFileSync('src/components/ui/rich-text-editor.tsx', 'utf8'), /trailingNode:\s*false/, 'the application opts out of the new content-changing default');
    editor = new Editor({
      element: dom.window.document.getElementById('editor'),
      extensions: [StarterKit.configure({ link: false, trailingNode: false }), Link, Image, TextStyle, Color, Table, TableRow, TableHeader, TableCell],
      content: '<p><strong>保留原文</strong> <em>進度</em></p><table><tbody><tr><td><p>欄位資料</p></td></tr></tbody></table><img src="https://example.invalid/synthetic.png">',
    });
    const before = editor.getJSON();
    const html = editor.getHTML();
    assert.match(html, /<strong>保留原文<\/strong>/);
    assert.match(html, /<em>進度<\/em>/);
    assert.match(html, /欄位資料/);
    assert.match(html, /synthetic\.png/);
    editor.commands.setContent(html);
    assert.deepEqual(editor.getJSON(), before, 'existing content round-trips without losing table, image, or formatting');
    const attributes = mergeAttributes({ title: 'retained' }, JSON.parse('{"__proto__":{"onclick":"unsafe"},"class":"safe"}'));
    assert.equal(attributes.title, 'retained');
    assert.equal(attributes.class, 'safe');
    assert.equal(attributes.onclick, undefined);
    assert.equal(Object.getPrototypeOf(attributes), Object.prototype, 'the untrusted key remains data, never an inherited event handler');
    const purifier = require('dompurify')(dom.window);
    const sanitized = purifier.sanitize('<p>保留內容</p><img src=x onerror=alert(1)><a href="javascript:alert(1)">連結</a>');
    assert.match(sanitized, /保留內容/);
    assert.doesNotMatch(sanitized, /onerror|javascript:/i);
    assert.match(purifier.sanitize('<table><tbody><tr><td>工程內容</td></tr></tbody></table>'), /<td>工程內容<\/td>/);
  } finally {
    editor?.destroy();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    dom.window.close();
  }
});

test('ExcelJS with the patched UUID dependency preserves workbook values, formulas, styles and conditional formatting', async () => {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('原始欄位');
  sheet.addRow(['料號', '數量', '公式']);
  sheet.addRow(['PN-001', 11, { formula: 'B2*2', result: 22 }]);
  sheet.getCell('A2').font = { bold: true };
  sheet.addConditionalFormatting({ ref: 'B2', rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: [0], style: { font: { color: { argb: 'FF008800' } } } }] });
  const bytes = await workbook.xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(bytes);
  const read = restored.getWorksheet('原始欄位');
  assert.equal(read.getCell('A2').value, 'PN-001');
  assert.equal(read.getCell('B2').value, 11);
  assert.equal(read.getCell('C2').formula, 'B2*2');
  assert.equal(read.getCell('C2').result, 22);
  assert.equal(read.getCell('A2').font.bold, true);
  assert.equal(read.conditionalFormattings.length, 1);
  const uuid = createRequire(require.resolve('exceljs'))('uuid');
  assert.match(uuid.v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('PPTX export retains text and embedded image after the image-size security override', async () => {
  const PptxGenJS = require('pptxgenjs');
  const JSZip = require('jszip');
  const presentation = new PptxGenJS();
  const slide = presentation.addSlide();
  slide.addText('保留簡報內容', { x: 1, y: 1, w: 4, h: 1 });
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
  slide.addImage({ data: `image/png;base64,${png}`, x: 1, y: 2, w: 1, h: 1 });
  const bytes = await presentation.write({ outputType: 'nodebuffer' });
  const zip = await JSZip.loadAsync(bytes);
  assert.match(await zip.file('ppt/slides/slide1.xml').async('string'), /保留簡報內容/);
  const image = Object.keys(zip.files).find(name => /^ppt\/media\/.+\.png$/.test(name));
  assert.ok(image, 'original image remains embedded');
  assert.deepEqual(await zip.file(image).async('nodebuffer'), Buffer.from(png, 'base64'));
});
