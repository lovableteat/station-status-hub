import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const version = '20261112022029';
const filename = `${version}_restrict_anonymous_login_audit_access.sql`;
const directory = new URL('../supabase/migrations/', import.meta.url);
const sql = await readFile(new URL(filename, directory));

// The original PENDING comment is immutable historical ledger text, not status.
test('applied login-audit migration retains the exact verified server statement', () => {
  assert.equal(sql.length, 4521);
  assert.equal(createHash('sha256').update(sql).digest('hex'),
    '6f0a61cb237f41df51239433a3112257ccef4480a635cc43c7c9d653c5ba49c5');
});

test('applied login-audit migration has its original unique version and name', async () => {
  assert.deepEqual((await readdir(directory)).filter(name => name.startsWith(`${version}_`)), [filename]);
});

test('immutable login-audit containment changes only the reviewed anon table ACL', () => {
  const source = sql.toString('utf8').replace(/^--.*$/gm, '');
  const revokes = [...source.matchAll(/revoke\s+all\s+privileges\s+on\s+table\s+(\S+)\s+from\s+(\w+);/gi)];
  assert.equal(revokes.length, 1);
  assert.deepEqual(revokes[0].slice(1), ['workspace.login_audit', 'anon']);
  assert.doesNotMatch(source, /\b(?:insert into|update\s+\w|delete from|truncate\s+table|drop\s|alter\s|create\s+(?:or replace\s+)?function|grant\s)\b/i);
  assert.match(source, /set local lock_timeout='1s'/);
  assert.match(source, /set local statement_timeout='5s'/);
  assert.equal((source.match(/unexpected column grant/g) ?? []).length, 2);
  assert.equal((source.match(/anonymous role membership drift/g) ?? []).length, 2);
  assert.equal((source.match(/definition or execution context drift/g) ?? []).length, 4);
  assert.match(source, /has_any_column_privilege\('anon','workspace\.login_audit'/);
  assert.match(source, /\$postcheck\$;\s*commit;\s*$/);
});

test('immutable login-audit statement uses LF on Windows checkouts', async () => {
  const attributes = await readFile(new URL('../.gitattributes', import.meta.url), 'utf8');
  assert.ok(attributes.split(/\r?\n/).includes(`supabase/migrations/${filename} text eol=lf`));
});
