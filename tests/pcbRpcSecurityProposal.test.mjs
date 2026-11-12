import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const read = name => readFile(new URL(name, import.meta.url), 'utf8');
const candidate = await read('../docs/security-proposals/pcb-rpc-cutover-PENDING.sql');
const functions = JSON.parse(await read('fixtures/pcb-rpc-security/functions.json'));
const targets = functions.filter(f => f.proname.includes('pcb_designer') && f.anon_execute);
const actorCheck = [
  'BEGIN',
  '  -- Derive the actor from verified Supabase Auth, never a supplied account ID.',
  '  IF p_user_id IS NULL',
  '    OR p_user_id IS DISTINCT FROM workspace.current_system_user_id() THEN',
  "    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PCB account identity mismatch';",
  '  END IF;',
  '',
].join('\r\n');
const stationOnly = await read('../docs/security-proposals/02-bind-station-delete-identities-after-pcb.sql');

test('reviewed PCB candidate retains exact bytes and stays outside automatic migrations', async () => {
  assert.equal(Buffer.byteLength(candidate), 39502);
  assert.equal(createHash('sha256').update(candidate).digest('hex'), 'eb164dac09eba533cf2006c42c12d259608c64f9b42a668f16ed09881800a77a');
  const migrations = await readdir(new URL('../supabase/migrations', import.meta.url));
  assert.equal(migrations.some(name => /pcb.*(?:rpc.*cutover|security)/i.test(name)), false);
  assert.match(candidate, /LOCAL CANDIDATE ONLY\. NOT APPLIED TO PRODUCTION/);
});

test('all twelve existing bodies change only by adding verified system-account guard', () => {
  assert.equal(targets.length, 12);
  assert.equal((candidate.match(/CREATE OR REPLACE FUNCTION /g) ?? []).length, 12);
  for (const f of targets) {
    assert.ok(candidate.includes(f.definition.replace('BEGIN\r\n', actorCheck)), f.signature);
    assert.ok(candidate.includes(`REVOKE EXECUTE ON FUNCTION ${f.signature} FROM PUBLIC, anon;`));
    const originalHash = createHash('md5').update(f.definition).digest('hex');
    const hardenedHash = createHash('md5').update(f.definition.replace('BEGIN\r\n', actorCheck)).digest('hex');
    assert.ok(candidate.includes(originalHash));
    assert.ok(candidate.includes(hardenedHash));
    assert.equal(stationOnly.split(hardenedHash).length - 1, 2, 'station-only pre/postflight pin '+f.signature);
  }
  assert.doesNotMatch(candidate, /^\s*(?:GRANT|ALTER TABLE|DROP|TRUNCATE)\b/im);
  assert.doesNotMatch(candidate, /p_user_id\s*(?:=|IS DISTINCT FROM)\s*auth\.uid\(\)/);
});

test('station-only successor preserves original two delete replacements and never replaces PCB functions', async () => {
  const oldStage = await read('../docs/security-proposals/02-bind-rpc-identities.sql');
  const replacementBlock = sql => sql.match(/do \$delete_rpc_replacements\$[\s\S]*?\$delete_rpc_replacements\$;/)[0];
  assert.equal(replacementBlock(stationOnly), replacementBlock(oldStage));
  assert.deepEqual([...stationOnly.matchAll(/CREATE OR REPLACE FUNCTION ([^(]+)/g)].map(m=>m[1]), ['public.delete_test_system', 'workspace.delete_test_system']);
  assert.doesNotMatch(stationOnly, /^\s*(?:GRANT|REVOKE)\b/im);
  assert.match(oldStage, /PCB RPC sequence conflict/);
  assert.ok(oldStage.indexOf('PCB RPC sequence conflict') < oldStage.indexOf('CREATE OR REPLACE FUNCTION'));
});

test('retired rollback contains no permission or function restoration', async () => {
  const rollback = await read('../docs/security-proposals/pcb-rpc-rollback-RETIRED.sql');
  assert.match(rollback, /RAISE EXCEPTION 'PCB rollback retired/);
  assert.doesNotMatch(rollback, /\b(?:GRANT|CREATE OR REPLACE|DELETE FROM|TRUNCATE|UPDATE)\b/i);
});

test('portable PCB fixture contains schema/definitions only and no real account IDs or network target', async () => {
  for (const file of ['functions.json', 'schema.json', 'constraints.json']) {
    const text = await read('fixtures/pcb-rpc-security/'+file);
    assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    assert.doesNotMatch(text, /https?:\/\/|postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]{20}/);
  }
  const testSource = await read('pcbRpcSecurity.postgres.mjs');
  assert.doesNotMatch(testSource, /\/workspace\/shared|production-(?:functions|schema|constraints)\.json|DATABASE_URL|SUPABASE_URL/);
  assert.match(testSource, /new PGlite\(\)/);
});
