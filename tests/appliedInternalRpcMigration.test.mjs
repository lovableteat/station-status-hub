import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const version = '20261112001122';
const filename = `${version}_restrict_internal_stats_cleanup_execution.sql`;
const directory = new URL('../supabase/migrations/', import.meta.url);
const sql = await readFile(new URL(filename, directory));

// This is the existing server ledger statement, not a new pending migration.
// Changing any applied byte requires review, not an update of this expected hash.
test('applied four-RPC migration retains exact verified server statement bytes', () => {
  assert.equal(sql.length, 3793);
  assert.equal(createHash('sha256').update(sql).digest('hex'),
    '2921e3d36f18df8a970214dc519b9b7a4fbf8edc8eca4a492ab4096dd639cbcf');
});

test('applied migration preserves the original unique version and name', async () => {
  const matching = (await readdir(directory)).filter(name => name.startsWith(`${version}_`));
  assert.deepEqual(matching, [filename]);
});

test('immutable applied SQL has only the reviewed four-function privilege mutation', () => {
  const source = sql.toString('utf8').replace(/^--.*$/gm, '');
  const revokes = [...source.matchAll(/revoke execute on function\s+([\s\S]*?)\s+from public, anon, authenticated;/gi)];
  assert.equal(revokes.length, 1);
  assert.deepEqual(revokes[0][1].split(',').map(part => part.trim()).sort(), [
    'public.calculate_daily_production_stats()',
    'public.cleanup_old_notifications()',
    'workspace.calculate_daily_production_stats()',
    'workspace.cleanup_old_notifications()',
  ]);
  assert.doesNotMatch(source, /\b(?:insert into|update\s+\w|delete from|truncate|drop|create\s+(?:or replace\s+)?function|grant\s+execute)\b/i);
  assert.match(source, /set local lock_timeout = '2s'/);
  assert.match(source, /set local statement_timeout = '10s'/);
  assert.equal((source.match(/Metadata drift:/g) ?? []).length, 2);
  assert.match(source, /notify pgrst, 'reload schema';\s*commit;\s*$/);
});

test('immutable migration stays LF even in an autocrlf Windows checkout', async () => {
  const attributes = await readFile(new URL('../.gitattributes', import.meta.url), 'utf8');
  const rule = `supabase/migrations/${filename} text eol=lf`;
  assert.ok(attributes.split(/\r?\n/).includes(rule));
});
