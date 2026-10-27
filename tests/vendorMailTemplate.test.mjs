import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const qa = createRequire(path.resolve(process.env.AUDIT_QA_DIR || '../qa-tools', 'package.json'));
const { JSDOM } = qa('jsdom');
const source = readFileSync(new URL('../src/components/material-requests/materialRequestExport.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const lib = {}; new Function('require', 'exports', output)(require, lib);

test('default subject matches the editable vendor/project bracket format', () => {
  assert.equal(typeof lib.renderVendorMailSubject, 'function');
  assert.equal(lib.renderVendorMailSubject(undefined, 'NXP', 'BOM.xlsx'), '[NXP][VERA_GPU][料號申請][蒐集]');
  assert.equal(lib.renderVendorMailSubject('[{廠商}][MyProject][確認]', 'TI', 'BOM.xlsx'), '[TI][MyProject][確認]');
  assert.equal(lib.renderVendorMailSubject('[{廠商}][{BOM}]', 'TI\r\nBcc:x', 'BOM.xlsx'), '[TI Bcc:x][BOM.xlsx]');
});

test('one content template preserves all words, formatting and signature around a split formatting token', () => {
  assert.equal(typeof lib.splitVendorMailTemplate, 'function');
  const document = new JSDOM('').window.document;
  const parts = lib.splitVendorMailTemplate('<p>中文 <b>保留粗體</b> &amp; &lt;hello&gt;</p><p><b>{{料件</b>清單}}</p><div>最後一段<br>簽名<img src="data:image/png;base64,AA==" alt="簽名圖片"></div>', document);
  const before = document.createElement('div'); before.innerHTML = parts.messageHtml;
  const after = document.createElement('div'); after.innerHTML = parts.signatureHtml;
  assert.match(before.textContent, /中文 保留粗體 & <hello>/);
  assert.match(after.textContent, /最後一段簽名/);
  assert.equal(after.querySelector('img').alt, '簽名圖片');
  assert.ok(before.querySelector('b'));
  assert.doesNotMatch(parts.messageHtml + parts.signatureHtml, /料件清單|料件<\/b>/);
});

test('missing or duplicate item placeholders block export rather than discarding authored text', () => {
  assert.equal(typeof lib.splitVendorMailTemplate, 'function');
  const document = new JSDOM('').window.document;
  for (const value of ['保留我的字', '{{料件清單}}<p>{{料件清單}}</p>']) assert.throws(() => lib.splitVendorMailTemplate(value, document), /一個.*料件清單/);
});
