import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const version = '20261112013540';
const filename = `${version}_restrict_anonymous_delete_test_system_execution.sql`;
const directory = new URL('../supabase/migrations/', import.meta.url);
const sql = await readFile(new URL(filename, directory));

// Exact existing server ledger statement. Its original preparation comment is
// immutable historical text, not an instruction to reapply it or change bytes.
test('applied anonymous-delete migration retains exact verified server statement', () => {
  assert.equal(sql.length, 3036);
  assert.equal(createHash('sha256').update(sql).digest('hex'),
    'adacc5680f243956c685c29b6f7c99f2932947431141d09ab15080b4371443a8');
});

test('applied anonymous-delete migration keeps its original unique version and name', async () => {
  assert.deepEqual((await readdir(directory)).filter(name => name.startsWith(`${version}_`)), [filename]);
});

test('immutable delete containment only revokes two anonymous RPC grants', () => {
  const source = sql.toString('utf8').replace(/^--.*$/gm, '');
  const revokes = [...source.matchAll(/revoke execute on function\s+([\s\S]*?)\s+from public,anon;/gi)];
  assert.equal(revokes.length, 1);
  assert.deepEqual(revokes[0][1].split(',').map(part => part.trim()).sort(), [
    'public.delete_test_system(uuid)', 'workspace.delete_test_system(uuid)',
  ]);
  assert.doesNotMatch(source, /\b(?:insert into|update\s+\w|delete from|truncate|drop|create\s+(?:or replace\s+)?function|grant\s+execute)\b/i);
  assert.match(source, /set local lock_timeout = '1s'/);
  assert.match(source, /set local statement_timeout = '10s'/);
  assert.match(source, /Machine deletion is currently running; postpone ACL cutover/);
  assert.match(source, /Reviewed RPC metadata drift/);
  assert.match(source, /Existing caller privilege lost/);
  assert.match(source, /notify pgrst, 'reload schema';\s*commit;\s*$/);
});

test('exact applied anonymous-delete SQL remains LF on Windows checkouts', async () => {
  const attributes = await readFile(new URL('../.gitattributes', import.meta.url), 'utf8');
  assert.ok(attributes.split(/\r?\n/).includes(`supabase/migrations/${filename} text eol=lf`));
});
