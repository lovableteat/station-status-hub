import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { React, create, act, loader } = require('./support/renderHarness.cjs');
const load = loader({ transform(source, file) {
  if (!file.endsWith('MaterialRequestPage.tsx')) return source;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return ast.statements.filter(node =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'VirtualAlternativeValue'
    || ts.isImportDeclaration(node) && node.moduleSpecifier.text === 'lucide-react'
  ).map(node => node.getText(ast)).join('\n');
} });

test('virtual number copies the exact source value and cannot open an editor or write data', () => {
  const { VirtualAlternativeValue } = load('src/components/material-requests/MaterialRequestPage.tsx');
  const copied = [];
  let root;
  act(() => { root = create(React.createElement(VirtualAlternativeValue, { value: '000-VIRTUAL-A', onCopy: value => copied.push(value) })); });
  const button = root.root.findByType('button');
  assert.equal(button.props['aria-label'], '複製虛擬料號：000-VIRTUAL-A');
  act(() => button.props.onClick());
  assert.deepEqual(copied, ['000-VIRTUAL-A']);
  assert.equal(root.root.findAllByType('input').length, 0);
  act(() => root.update(React.createElement(VirtualAlternativeValue, { value: '   ', onCopy: value => copied.push(value) })));
  assert.equal(root.root.findAllByType('button').length, 0);
  assert.match(JSON.stringify(root.toJSON()), /未提供/);
  assert.deepEqual(copied, ['000-VIRTUAL-A']);
  act(() => root.unmount());
});
