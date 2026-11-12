import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile, access } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const fromParser = createRequire(require.resolve('@typescript-eslint/typescript-estree'));
const fromRimraf = createRequire(require.resolve('rimraf'));
const { Minimatch, minimatch } = fromParser('minimatch');
const { glob } = fromRimraf('glob');

test('the parser uses a patched narrow override while legacy consumers retain their supported major', async () => {
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(fromParser('minimatch/package.json').version, '11.0.8');
  assert.equal(lock.packages['node_modules/minimatch'].version, '3.1.5');
  assert.equal(lock.packages['node_modules/sucrase'].version, '3.35.1');
  assert.equal(lock.packages['node_modules/rimraf'].version, '6.1.4');
  assert.equal(fromRimraf('glob/package.json').version, '14.0.5');
  for (const [file, pattern, expected] of [
    ['eslint.config.js', '*.js', true], ['.eslintrc.js', '*.js', true],
    ['src/App.tsx', 'src/**/*.tsx', true], ['src/App.tsx', '*.tsx', false],
    ['src/deep/a.ts', 'src/**/*.ts', true], ['src/a.js', 'src/**/*.ts', false],
    ['src/a.test.ts', '**/*.test.{ts,mjs}', true], ['src/a.ts', '**/*.test.{ts,mjs}', false],
  ]) assert.equal(minimatch(file, pattern, { dot: true }), expected, `${file} / ${pattern}`);
});

test('minimatch bounds globstar-parent amplification before allocating excess patterns', () => {
  // Only four segments and an eight-row budget: proves the fix without a costly DoS payload.
  const pattern = '**/../x/y/'.repeat(4) + 'target';
  assert.throws(() => new Minimatch(pattern, { optimizationLevel: 2, braceExpandMax: 8 }),
    { name: 'RangeError', message: /too many patterns/ });
});

test('patched glob stops directory reads after cancellation and retains ordinary discovery', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'station-glob-synthetic-'));
  try {
    for (const directory of ['one/nested', 'two/nested']) {
      await mkdir(path.join(cwd, directory), { recursive: true });
      await writeFile(path.join(cwd, directory, 'fixture.ts'), '// synthetic fixture only\n');
    }
    assert.deepEqual((await glob('**/*.ts', { cwd })).sort(), ['one/nested/fixture.ts', 'two/nested/fixture.ts']);
    const controller = new AbortController();
    let reads = 0;
    const observedFs = { ...fs, readdir(directory, options, callback) {
      reads++;
      fs.readdir(directory, options, (error, entries) => {
        if (!controller.signal.aborted) controller.abort(new Error('synthetic-cancel'));
        callback(error, entries);
      });
    } };
    await assert.rejects(glob('**/*', { cwd, signal: controller.signal, fs: observedFs }), /synthetic-cancel/);
    const atRejection = reads;
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(reads, atRejection, 'no new directory I/O is scheduled after rejection');
    assert.equal(reads, 1);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('the patched router keeps the declarative HashRouter and its prior update timing', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.dependencies['react-router-dom'], '7.18.5');
  assert.equal(require('react-router-dom/package.json').version, '7.18.5');
  const source = await readFile(new URL('../src/components/auth/AuthenticatedApplication.tsx', import.meta.url), 'utf8');
  assert.match(source, /<HashRouter useTransitions=\{false\}>/);
  assert.doesNotMatch(source, /createBrowserRouter|RouterProvider/);
});


test('updated Rimraf glob only removes the selected synthetic directory and Sucrase still transpiles config syntax', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'station-tools-synthetic-'));
  try {
    await mkdir(path.join(cwd, 'selected-fixture'));
    await writeFile(path.join(cwd, 'selected-fixture', 'discard.txt'), 'synthetic disposable fixture');
    await writeFile(path.join(cwd, 'retained.txt'), 'synthetic retained fixture');
    assert.equal(await require('rimraf').rimraf(path.join(cwd, 'selected-*'), { glob: true }), true);
    await assert.rejects(access(path.join(cwd, 'selected-fixture')), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(cwd, 'retained.txt'), 'utf8'), 'synthetic retained fixture');
    const compiled = require('sucrase').transform('export const config: { value: number } = { value: 3 };', { transforms: ['typescript', 'imports'] }).code;
    const module = { exports: {} };
    new Function('module', 'exports', compiled)(module, module.exports);
    assert.deepEqual(module.exports.config, { value: 3 });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
