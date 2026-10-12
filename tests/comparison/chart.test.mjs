import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../../src/components/comparison/ComparisonCharts.tsx', import.meta.url), 'utf8');
test('PDF nodes remain keyboard links after their untrusted href is removed', () => {
  for (const attribute of ['tabindex', 'role', 'aria-label']) assert.ok(source.includes(`anchor.setAttribute("${attribute}"`));
  assert.match(source, /FORBID_ATTR: \["href", "xlink:href"\]/);
  assert.match(source, /ADD_ATTR: \["data-pdf-page", "role"\]/);
  assert.match(source, /onKeyDown=\{event =>[\s\S]*?event\.key === "Enter" \|\| event\.key === " "/);
});
test('diagram PDF navigation only opens bounded integer pages in the known local PDF', () => {
  const handler = source.slice(source.indexOf('  const openPdf = '), source.indexOf('  return <section'));
  const script = ts.transpileModule(`function factory(pdfUrl: string, window: unknown) { ${handler}\nreturn openPdf; } factory`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const factory = vm.runInNewContext(script);
  const opened = [];
  const open = factory('/known.pdf', { open: (...args) => opened.push(args) });
  const target = page => ({ closest: () => ({ getAttribute: () => page }) });
  for (const page of [null, '', '0', '-1', '1.5', '10001', 'Infinity', 'javascript:alert(1)']) open(target(page));
  assert.equal(opened.length, 0);
  open(target('2'));
  assert.deepEqual(opened, [['/known.pdf#page=2', '_blank', 'noopener,noreferrer']]);
});
