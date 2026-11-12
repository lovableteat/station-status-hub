import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const runner = new URL('./legacyPcbPostgrest.integration.cjs', import.meta.url);
const source = await readFile(runner, 'utf8');

test('PostgREST service test is PR-only, official pinned containers and loopback only', () => {
  assert.match(source, /postgres:17\.4-alpine/);
  assert.match(source, /postgrest\/postgrest:v12\.2\.12@sha256:5f4ce744539bbba786b4e24dbbd95bdb2a956dcf568c5374995a0ff4a68f5bd2/);
  assert.match(source, /assert\.equal\(process\.env\.GITHUB_ACTIONS, 'true'/);
  assert.match(source, /assert\.equal\(process\.env\.GITHUB_EVENT_NAME, 'pull_request'/);
  assert.ok(source.indexOf("assert.equal(process.env.GITHUB_EVENT_NAME") < source.indexOf("docker(['run'"));
  assert.match(source, /127\.0\.0\.1::3000/);
  assert.match(source, /'--network', 'container:' \+ pg/);
  assert.doesNotMatch(source, /VITE_SUPABASE|SUPABASE_URL|SERVICE_ROLE_KEY|--network', 'host'/);
  assert.match(source, /for \(const name of \[rest,pg\]\) spawnSync\('docker',\['rm','-f',name\]/);
  assert.match(source, /randomBytes\(32\)/);
  assert.match(source, /redact\(r\.stderr/);
});

test('PostgREST proof executes actual SDK and production reader against real HTTP', () => {
  assert.match(source, /require\('@supabase\/supabase-js'\)/);
  assert.match(source, /read\('src\/lib\/systemUserProfiles\.ts'\)/);
  assert.match(source, /return fetch\(url,/);
  assert.match(source, /url\.pathname = url\.pathname\.slice\('\/rest\/v1'\.length\)/);
  assert.match(source, /isolatedEnforcementBody\(read\('docs\/security-proposals\/legacy-pcb\/02-close-raw-permissions-PENDING\.sql'\)\)/);
  assert.match(source, /await f\.fixture\(db\)/);
  assert.match(source, /reader\.readSystemUserProfile/);
  assert.match(source, /reader\.listSystemUserProfiles/);
  assert.match(source, /system_users\(permissions\)/);
  assert.match(source, /realtimeVerified:false/);
  const syntax = spawnSync(process.execPath, ['--check', fileURLToPath(runner)], { encoding:'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test('shared synthetic fixture can be recorded without loading PGlite or using Docker', async () => {
  const { fixture, addAccount } = await import('./fixtures/legacy-pcb-security/database.mjs');
  const statements = [], parameters = [];
  const adapter = { exec: async sql => { statements.push(sql); }, query: async (sql, args) => { parameters.push({ sql,args }); return {rows:[]}; } };
  assert.equal(await fixture(adapter), adapter);
  await addAccount(adapter, 1);
  assert.ok(statements.length > 20);
  assert.equal(parameters.filter(q => q.sql.includes('schema_migrations')).length, 3);
  assert.equal(parameters.at(-1).sql.startsWith('insert into workspace.system_users'), true);
  assert.equal(parameters.filter(q => q.sql.includes('schema_migrations')).every(q => Array.isArray(q.args[2])), true);
});
