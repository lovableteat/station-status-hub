import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertSanitizedSubset, loadSanitizedSubset, splitSqlStatements } from './support/historicalCredentialSanitization.mjs';

const migrations = await loadSanitizedSubset();

test('five historical migrations retain their versions and contain no account seed/reset', () => {
  assertSanitizedSubset(migrations);
});

test('credential-only migration placeholders contain no executable statements', () => {
  for (const index of [2, 4]) {
    assert.deepEqual(splitSqlStatements(migrations[index].sql), []);
    assert.ok(migrations[index].sql.trim().startsWith('--'), 'keep an explanatory placeholder');
  }
});

test('retained login RPC keeps its signature, response contract and verification flow', () => {
  const sql = migrations[3].sql;
  const contracts = [
    /authenticate_user\(username_input text, password_input text\)/,
    /RETURNS TABLE\(user_id uuid, username character varying, role character varying, display_name character varying, success boolean\)/i,
    /LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = ''/i,
    /public\.verify_password\(password_input, user_record\.password_hash\)/,
    /FROM public\.system_users/,
    /system_users\.status = 'active'/,
    /false as success/,
  ];
  for (const contract of contracts) assert.ok(contract.test(sql), 'retained login contract changed');
  assert.equal((sql.match(/INSERT INTO public\.login_audit/g) ?? []).length, 2);
});

test('guards reject an added synthetic account write, executable no-op or hidden block', () => {
  for (const added of [
    'UPDATE public.system_users SET status = NULL;',
    'DO $$ BEGIN DELETE FROM public.system_users; END $$;',
    'SELECT 1;',
  ]) {
    const changed = migrations.map(item => ({ ...item }));
    changed[2].sql += `\n${added}`;
    assert.throws(() => assertSanitizedSubset(changed), /unexpected executable statement/);
  }
  const changed = migrations.map(item => ({ ...item }));
  changed[3].sql = changed[3].sql.replace('BEGIN', 'BEGIN UPDATE public.system_users SET status = NULL;');
  assert.throws(() => assertSanitizedSubset(changed), /account mutation is prohibited/);
});

test('sanitization contracts accept both LF and Windows CRLF checkouts', () => {
  assertSanitizedSubset(migrations.map(item => ({ ...item, sql: item.sql.replace(/\r?\n/g, '\r\n') })));
});

test('clean source pins reject synthetic comment and default changes before execution', () => {
  const commentChanged = migrations.map(item => ({ ...item }));
  commentChanged[2].sql += '\n-- synthetic unexpected annotation\n';
  assert.throws(() => assertSanitizedSubset(commentChanged), /reviewed sanitized source changed/);

  const defaultChanged = migrations.map(item => ({ ...item }));
  defaultChanged[0].sql = defaultChanged[0].sql.replace("DEFAULT 'engineer'", "DEFAULT 'synthetic-role'");
  assert.throws(() => assertSanitizedSubset(defaultChanged), /reviewed sanitized source changed/);
});

test('SQL statement scanner respects comments, quoted delimiters and function bodies', () => {
  const statements = splitSqlStatements(`-- ignored ;\n/* outer /* nested */ comment */
    SELECT 'synthetic;value';
    CREATE FUNCTION fixture() RETURNS void LANGUAGE plpgsql AS $body$ BEGIN PERFORM 1; END; $body$;
    SELECT "synthetic;identifier";`);
  assert.equal(statements.length, 3);
  assert.ok(statements[1].includes('PERFORM 1;'));
  assert.throws(() => splitSqlStatements('/* incomplete'), /unterminated SQL comment/);
});

test('both PR CI workflows run the isolated historical migration regression', async () => {
  const directory = new URL('../.github/workflows/', import.meta.url);
  // Keep the required workflow names explicit so a renamed/dropped check cannot pass silently.
  for (const name of ['audit-on-main.yml', 'audit-regression.yml']) {
    const workflow = await readFile(new URL(name, directory), 'utf8');
    assert.ok(workflow.includes('tests/historicalCredentialSanitization.postgres.mjs'), `${name}: missing historical migration SQL regression`);
    assert.ok(/PGLITE_MODULE=.*node --test tests\/historicalCredentialSanitization\.postgres\.mjs/.test(workflow), `${name}: missing isolated PostgreSQL engine configuration`);
  }
});
