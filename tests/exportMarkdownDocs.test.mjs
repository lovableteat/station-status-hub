import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const exporter = resolve('scripts/export-markdown-docs.mjs');
const folder = '機台管理系統.md';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'markdown-handoff-test-'));
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['config', 'core.autocrlf', 'false'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/example/reference.git'], { cwd: root });
  await mkdir(join(root, 'docs'), { recursive: true });
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'docs', '文件包導讀.md'), '# Start\n[Guide](./guide.md)\n');
  await writeFile(join(root, 'docs', 'guide.md'), '# Guide\n[Home](../README.md?view=1#root)\n[Code](../src/app.ts)\n[Missing](./old.md)\n[reference]: ../README.md#root\n[old]: ./absent.md\n```md\n[example](./not-real.md)\n```\n');
  await writeFile(join(root, 'README.md'), '# Root\n[Start](./docs/文件包導讀.md)\n[`Guide`](./docs/guide.md)\n`[literal](./missing.md)`\n');
  await writeFile(join(root, 'docs', 'README.md'), '# Nested\n');
  await writeFile(join(root, 'docs', 'Mixed.Md'), '# Mixed case\n');
  await writeFile(join(root, 'src', 'app.ts'), 'export {};\n');
  await writeFile(join(root, '.gitignore'), 'node_modules/\ntmp/\n');
  await mkdir(join(root, 'node_modules'), { recursive: true });
  await writeFile(join(root, 'node_modules', 'README.md'), 'Not project documentation.');
  await mkdir(join(root, '.superpowers', 'sdd'), { recursive: true });
  await writeFile(join(root, '.superpowers', 'sdd', '.gitignore'), '*\n');
  await writeFile(join(root, '.superpowers', 'sdd', 'report.md'), '# Historical project report\n');
  execFileSync('git', ['add', '--all'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture'], { cwd: root });
  return root;
}

function run(root, ...args) {
  return spawnSync(process.execPath, [exporter, ...args], { cwd: root, encoding: 'utf8' });
}

test('collects every project Markdown into one folder with unique names and portable links', async () => {
  const root = await fixture();
  const generated = run(root);
  assert.equal(generated.status, 0, generated.stderr);
  assert.deepEqual((await readdir(join(root, folder))).sort(), ['00_閱讀指南.md', '99_原始文件對照索引.md', 'README.md', 'docs__README.md', 'docs__guide.md', 'docs__Mixed.Md', '.superpowers__sdd__report.md'].sort());
  assert.match(decodeURI(await readFile(join(root, folder, 'README.md'), 'utf8')), /\]\(\.\/00_閱讀指南\.md\)/);
  const home = await readFile(join(root, folder, 'README.md'), 'utf8');
  assert.match(home, /\[`Guide`\]\(\.\/docs__guide\.md\)/, 'inline code in a link label still has a portable destination');
  assert.match(home, /`\[literal\]\(\.\/missing\.md\)`/, 'an entire literal inline link remains unchanged');
  const guide = await readFile(join(root, folder, 'docs__guide.md'), 'utf8');
  assert.match(guide, /\]\(\.\/README\.md\?view=1#root\)/);
  assert.match(guide, /\[reference\]: \.\/README\.md#root/);
  assert.match(guide, /`\[old\]: \.\/absent\.md`（未收錄參照）/);
  assert.match(guide, /https:\/\/github\.com\/example\/reference\/blob\/[a-f0-9]+\/src\/app\.ts/);
  assert.match(guide, /未收錄參照/);
  assert.match(guide, /\[example\]\(\.\/not-real\.md\)/, 'code examples remain literal');
  assert.equal(await readFile(join(root, 'docs', 'README.md'), 'utf8'), '# Nested\n', 'originals are untouched');
  assert.equal(run(root, '--check').status, 0);
  const before = await readFile(join(root, folder, '99_原始文件對照索引.md'), 'utf8');
  assert.equal(run(root).status, 0);
  assert.equal(await readFile(join(root, folder, '99_原始文件對照索引.md'), 'utf8'), before);
  await writeFile(join(root, 'docs', 'README.md'), '# Updated\n');
  assert.notEqual(run(root, '--check').status, 0, 'stale exports fail without writing');
});

test('refuses flattened filename collisions instead of overwriting an original document', async () => {
  const root = await fixture();
  await writeFile(join(root, 'docs__README.md'), '# Different source\n');
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /collision/i);
});

test('rejects credential-shaped content without printing or packaging its value', async () => {
  const root = await fixture();
  const credential = 'sbp_' + 'x'.repeat(40);
  await writeFile(join(root, 'docs', 'private.md'), credential);
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /credential/i);
  assert.ok(!result.stderr.includes(credential));
});

test('preserves unexpected files and non-file output entries without overwriting them', async () => {
  const root = await fixture();
  await mkdir(join(root, folder));
  await writeFile(join(root, folder, 'my-note.md'), '# User note\n');
  assert.notEqual(run(root).status, 0);
  assert.equal(await readFile(join(root, folder, 'my-note.md'), 'utf8'), '# User note\n');
  const other = await fixture();
  await mkdir(join(other, folder, 'README.md'), { recursive: true });
  assert.notEqual(run(other).status, 0);
});

test('reserves the index name case-insensitively on Windows', async () => {
  const root = await fixture();
  await writeFile(join(root, '99_原始文件對照索引.MD'), '# User source\n');
  const result = run(root);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /collision/i);
});
