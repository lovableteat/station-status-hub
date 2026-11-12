import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';

// Current sanitized files only. Never retrieve a historical credential baseline.
export const reviewedFilenames = [
  '20250704045846-aba86276-5cc5-4280-99de-c0bc1f03bfbf.sql',
  '20250706170245-978d1ca4-4fb0-40fd-88bd-aa753800bec8.sql',
  '20250706170658-86bd7765-9557-492e-8cb7-97dcde7ed99a.sql',
  '20250727034628-8bcf66f4-ca69-4cbe-9018-42163fb36f64.sql',
  '20250804074607_73e090c7-cfc7-4639-8434-58a1667db1a0.sql',
];

// Whole sanitized files, independently reviewed after credential removal.
// These are not password hashes or hashes of the retired secret-bearing source.
const sanitizedSourceDigests = [
  '3c688176a3a5f4f54fbcf067c9d588e38c08b88be65b0989c81505f256d030ee',
  'a31b970a8c4f3046d07769fca9f0da9eee22ad2d4ae90f840378fbe7fee39f23',
  '062e159fcff78287b348439f63fea07e65cd14596e90acf99efaa0abae6a0e78',
  'aa461397bcef0d608b5a3cd5abfa1404c94a1f7f16ab427a642487ddb7d6b53a',
  '062e159fcff78287b348439f63fea07e65cd14596e90acf99efaa0abae6a0e78',
];

// Preserve quoted bodies as one token: function-body semicolons are not migrations.
export function splitSqlStatements(source) {
  const statements = [];
  let statement = '';
  for (let i = 0; i < source.length;) {
    if (source.startsWith('--', i)) {
      const end = source.indexOf('\n', i);
      i = end < 0 ? source.length : end + 1;
      statement += '\n';
    } else if (source.startsWith('/*', i)) {
      let depth = 1;
      i += 2;
      while (depth && i < source.length) {
        if (source.startsWith('/*', i)) { depth++; i += 2; }
        else if (source.startsWith('*/', i)) { depth--; i += 2; }
        else i++;
      }
      assert.ok(!depth, 'unterminated SQL comment');
      statement += ' ';
    } else if (source[i] === "'" || source[i] === '"') {
      const quote = source[i];
      const start = i++;
      let closed = false;
      while (i < source.length) {
        if (source[i] !== quote) { i++; continue; }
        if (source[i + 1] === quote) { i += 2; continue; }
        i++;
        closed = true;
        break;
      }
      assert.ok(closed, 'unterminated SQL literal or identifier');
      statement += source.slice(start, i);
    } else if (source[i] === '$' && /^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.test(source.slice(i))) {
      const tag = source.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)[0];
      const end = source.indexOf(tag, i + tag.length);
      assert.ok(end >= 0, 'unterminated SQL function body');
      statement += source.slice(i, end + tag.length);
      i = end + tag.length;
    } else if (source[i] === ';') {
      if (statement.trim()) statements.push(statement.trim());
      statement = '';
      i++;
    } else statement += source[i++];
  }
  if (statement.trim()) statements.push(statement.trim());
  return statements;
}

const expectedStatements = [
  [
    /^create table public\.system_users\s*\(/i,
    /^create table public\.production_targets\s*\(/i,
    /^alter table public\.system_users enable row level security$/i,
    /^alter table public\.production_targets enable row level security$/i,
    /^create policy "Allow anonymous access to system_users" on public\.system_users /i,
    /^create policy "Allow anonymous access to production_targets" on public\.production_targets /i,
    /^create trigger update_system_users_updated_at /i,
    /^create trigger update_production_targets_updated_at /i,
    /^insert into public\.production_targets\s*\(daily_target, weekly_target\) values \(10, 50\)$/i,
  ],
  [
    /^drop policy if exists "Service role can insert users" on public\.system_users$/i,
    /^drop policy if exists "Users can view their own record" on public\.system_users$/i,
    /^drop policy if exists "Users can update their own record" on public\.system_users$/i,
    /^drop policy if exists "Service role can delete users" on public\.system_users$/i,
    /^create policy "Allow anonymous access to system_users" on public\.system_users /i,
  ],
  [],
  [
    /^create table public\.login_audit\s*\(/i,
    /^alter table public\.login_audit enable row level security$/i,
    /^create policy "Allow anonymous access to login_audit" on public\.login_audit /i,
    /^create or replace function public\.authenticate_user\(username_input text, password_input text\)/i,
  ],
  [],
];

export function assertSanitizedSubset(migrations) {
  assert.equal(migrations.length, reviewedFilenames.length);
  migrations.forEach(({ name, sql }, index) => {
    assert.equal(name, reviewedFilenames[index]);
    const statements = splitSqlStatements(sql);
    assert.equal(statements.length, expectedStatements[index].length, `${name}: unexpected executable statement`);
    statements.forEach((statement, position) => {
      assert.ok(expectedStatements[index][position].test(statement.replace(/\s+/g, ' ')), `${name}: retained statement contract changed`);
    });
    const code = statements.join('\n').replace(/"(public|workspace|system_users|password_hash)"/gi, '$1');
    assert.ok(!/\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(?:(?:public|workspace)\s*\.\s*)?system_users\b/i.test(code), `${name}: account mutation is prohibited`);
    assert.ok(!/\bpassword_hash\s*=/i.test(code), `${name}: credential assignment is prohibited`);
    assert.ok(!/\b(?:hash_password|verify_password)\s*\(\s*(?:[eE])?'/i.test(code), `${name}: fixed credential input is prohibited`);
    const digest = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
    // Never include received SQL or its digest in a failure report.
    assert.ok(digest === sanitizedSourceDigests[index], `${name}: reviewed sanitized source changed`);
  });
}

export async function loadSanitizedSubset() {
  const directory = new URL('../../supabase/migrations/', import.meta.url);
  const names = await readdir(directory);
  const migrations = [];
  for (const name of reviewedFilenames) {
    assert.deepEqual(names.filter(candidate => candidate.startsWith(name.slice(0, 14))), [name], 'retain each reviewed version exactly once');
    migrations.push({ name, sql: await readFile(new URL(name, directory), 'utf8') });
  }
  // Fail before SQL execution; errors contain a filename/rule, never SQL contents.
  assertSanitizedSubset(migrations);
  return migrations;
}
