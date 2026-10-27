import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { JSDOM } = createRequire(path.resolve('../qa-tools/package.json'))('jsdom');
const { React, create, act, loader } = require('./support/renderHarness.cjs');

function fixture(value = '<p>開頭</p><p>{{料件清單}}</p><p>簽名</p>') {
  const dom = new JSDOM('<div id="editor"></div>'), document = dom.window.document;
  const node = document.querySelector('div'), readers = [], busy = [], changes = [];
  document.execCommand = (_, _ignored, html) => { node.insertAdjacentHTML('beforeend', html); };
  class FileReader { readAsDataURL() { readers.push(this); } }
  const { VendorMailEditor } = loader({ globals: { document, window: dom.window, FileReader } })('src/components/material-requests/VendorMailEditor.tsx');
  const ref = React.createRef(); let root;
  act(() => { root = create(React.createElement(VendorMailEditor, { ref, value, onChange: html => changes.push(html), onBusyChange: state => busy.push(state) }), { createNodeMock: element => element.props.contentEditable ? node : null }); });
  return { ref, root, node, readers, busy, changes, editor: () => root.root.findByProps({ contentEditable: true }), close: () => act(() => root.unmount()) };
}

test('snapshot reads the live DOM even before input/blur state catches up, and mount retains persisted text', () => {
  const f = fixture();
  assert.match(f.node.innerHTML, /簽名/);
  f.node.innerHTML += '<p>最後一刻輸入</p>';
  assert.match(f.ref.current.snapshot(), /最後一刻輸入/);
  act(() => f.editor().props.onInput());
  const saved = f.changes.at(-1); f.close();
  const reopened = fixture(saved);
  assert.equal(reopened.ref.current.snapshot(), saved); reopened.close();
});

test('IME and image loading block export; typing while loading survives and filenames are escaped', async () => {
  const f = fixture();
  act(() => f.editor().props.onCompositionStart());
  assert.throws(() => f.ref.current.snapshot(), /選字/);
  act(() => f.editor().props.onCompositionEnd());
  act(() => f.root.root.findByProps({ type: 'file' }).props.onChange({ target: { files: [{ type: 'image/png', name: 'a"<b>.png' }], value: '' } }));
  assert.throws(() => f.ref.current.snapshot(), /圖片/);
  f.node.innerHTML += '<p>讀圖時輸入</p>'; act(() => f.editor().props.onInput());
  await act(async () => { f.readers[0].result = 'data:image/png;base64,aA=='; f.readers[0].onload(); });
  assert.match(f.ref.current.snapshot(), /讀圖時輸入/);
  assert.equal(f.node.querySelector('img').alt, 'a"<b>.png');
  assert.equal(f.busy.at(-1), false); f.close();
});

test('a delayed image from a closed editor does not insert into another editor', async () => {
  const f = fixture();
  act(() => f.root.root.findByProps({ type: 'file' }).props.onChange({ target: { files: [{ type: 'image/png', name: 'old.png' }], value: '' } }));
  f.close();
  await act(async () => { f.readers[0].result = 'data:image/png;base64,aA=='; f.readers[0].onload(); });
  assert.equal(f.node.querySelector('img'), null);
});
