const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {spawn, spawnSync} = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const image = process.env.PERMISSION_TEST_POSTGRES_IMAGE || 'postgres:15-alpine';
const container = `station-permission-race-${process.pid}`;
const actorA = '00000000-0000-4000-8000-000000000001';
const actorB = '00000000-0000-4000-8000-000000000002';
const actorC = '00000000-0000-4000-8000-000000000003';
const access = JSON.stringify({
  'station-status': 'none',
  'material-requests': 'none',
  'data-center': 'edit',
  'user-management': 'edit',
});

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {encoding: 'utf8', ...options});
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function psql(sql, tuplesOnly = false) {
  return docker([
    'exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
    ...(tuplesOnly ? ['-A', '-t'] : []),
    '-U', 'postgres', '-d', 'permission_test',
  ], {input: sql});
}

function session(sql, onOutput) {
  const child = spawn('docker', [
    'exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
    '-U', 'postgres', '-d', 'permission_test',
  ], {stdio: ['pipe', 'pipe', 'pipe']});
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => {
    stdout += chunk;
    onOutput?.(stdout);
  });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.end(sql);
  return new Promise(resolve => child.on('close', code => resolve({code, stdout, stderr})));
}

function authenticated(uid, statement) {
  return `
select set_config('test.uid', '${uid}', false);
select set_config('test.role', 'authenticated', false);
set role authenticated;
${statement}
`;
}

function rpc(target, manager) {
  return `select public.set_user_access_permissions(
    '${target}'::uuid,
    array['data_center_edit']::public.page_permission[],
    '${access}'::jsonb,
    'postgres-race-fixture',
    ${manager}
  );`;
}

test('real PostgreSQL closes the queued revocation race and enforces ACLs', {timeout: 120000}, async () => {
  docker(['run', '--rm', '-d', '--name', container,
    '-e', 'POSTGRES_PASSWORD=permission-test-only',
    '-e', 'POSTGRES_DB=permission_test', image]);

  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const logs = spawnSync('docker', ['logs', container], {encoding: 'utf8'});
      const ready = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], {encoding: 'utf8'});
      const initializationFinished = `${logs.stdout}\n${logs.stderr}`
        .includes('PostgreSQL init process complete; ready for start up.');
      if (initializationFinished && ready.status === 0) break;
      await new Promise(resolve => setTimeout(resolve, 250));
      if (attempt === 59) throw new Error(`PostgreSQL did not become ready: ${ready.stderr}`);
    }

    psql(readFileSync(path.join(__dirname, 'fixtures', 'permission-boundary-postgres-setup.sql'), 'utf8'));
    psql(readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261002170000_align_account_permission_mutation_entrypoints.sql'), 'utf8'));
    assert.equal(
      psql(`select
        has_function_privilege('anon','public.set_user_access_permissions(uuid,public.page_permission[],jsonb,text)','execute'),
        has_function_privilege('authenticated','public.set_user_access_permissions(uuid,public.page_permission[],jsonb,text)','execute'),
        has_table_privilege('authenticated','workspace.user_page_permissions','insert')`, true),
      'f|t|t',
      'SQL2 secures the RPC but intentionally has not closed the legacy table boundary',
    );
    psql(readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261003075222_close_permission_table_boundary.sql'), 'utf8'));

    let locked;
    const lockedSignal = new Promise(resolve => { locked = resolve; });
    const revoker = session(`
begin;
update workspace.system_users
set permissions = '{"workspaceAccess":{"user-management":"none"},"pagePermissions":[],"performanceManager":false}'::jsonb
where id = '${actorA}'::uuid;
\\echo ACTOR_LOCKED
select pg_sleep(2);
commit;
`, output => { if (output.includes('ACTOR_LOCKED')) locked(); });

    await lockedSignal;
    const queuedAt = Date.now();
    const queuedSave = session(authenticated(actorA, rpc(actorA, 'true')));
    const [revoked, save] = await Promise.all([revoker, queuedSave]);
    assert.equal(revoked.code, 0, revoked.stderr);
    assert.notEqual(save.code, 0, 'queued self-save must be rejected after revocation');
    assert.match(save.stderr, /User management edit access required/);
    assert.ok(Date.now() - queuedAt >= 1200, 'save waited behind the revocation row lock');
    assert.equal(
      psql(`select permissions #>> '{workspaceAccess,user-management}' || '|' || (permissions->'pagePermissions')::text from workspace.system_users where id='${actorA}'`, true),
      'none|[]',
      'revoked durable permissions were not restored',
    );

    psql(`update workspace.system_users set role='admin', permissions=jsonb_set(permissions,'{workspaceAccess,user-management}','"edit"') where id in ('${actorA}','${actorC}')`);
    const [crossA, crossC] = await Promise.all([
      session(authenticated(actorA, rpc(actorC, 'true'))),
      session(authenticated(actorC, rpc(actorA, 'false'))),
    ]);
    assert.equal(crossA.code, 0, crossA.stderr);
    assert.equal(crossC.code, 0, crossC.stderr);
    assert.doesNotMatch(crossA.stderr + crossC.stderr, /deadlock detected/i);

    const acl = psql(`
select
  has_function_privilege('anon','public.set_user_access_permissions(uuid,public.page_permission[],jsonb,text,boolean)','execute'),
  has_function_privilege('authenticated','public.set_user_access_permissions(uuid,public.page_permission[],jsonb,text,boolean)','execute'),
  has_function_privilege('service_role','public.set_user_access_permissions(uuid,public.page_permission[],jsonb,text,boolean)','execute'),
  has_table_privilege('anon','workspace.user_page_permissions','select'),
  has_table_privilege('authenticated','workspace.user_page_permissions','select'),
  has_table_privilege('authenticated','workspace.user_page_permissions','insert'),
  has_table_privilege('authenticated','workspace.user_page_permissions','update'),
  has_table_privilege('authenticated','workspace.user_page_permissions','delete'),
  has_table_privilege('service_role','workspace.user_page_permissions','insert');
`, true);
    assert.equal(acl, 'f|t|t|f|t|f|f|f|t');

    const visibleToOrdinary = psql(authenticated(actorB,
      'select string_agg(user_id::text, \',\' order by user_id) from workspace.user_page_permissions;'), true)
      .split(/\r?\n/).at(-1);
    assert.equal(visibleToOrdinary, actorB, 'RLS exposes only the ordinary actor own row');

    const serviceSave = psql(`
select set_config('test.uid', '', false);
select set_config('test.role', 'service_role', false);
set role service_role;
${rpc(actorB, 'true')}
`, true);
    assert.match(serviceSave, /service_role/);
    assert.equal(
      psql(`select permissions->>'performanceManager' from workspace.system_users where id='${actorB}'`, true),
      'true',
      'service role retains the intended atomic entrypoint',
    );

    psql(readFileSync(path.join(__dirname, '..', 'docs', 'audits', '2026-10-03-permission-boundary-safe-containment.sql'), 'utf8'));
    assert.equal(
      psql(`select
        has_function_privilege('authenticated','public.set_user_access_permissions(uuid,public.page_permission[],jsonb,text,boolean)','execute'),
        has_function_privilege('service_role','public.set_user_access_permissions(uuid,public.page_permission[],jsonb,text,boolean)','execute'),
        has_table_privilege('authenticated','workspace.user_page_permissions','select'),
        has_table_privilege('authenticated','workspace.user_page_permissions','insert')`, true),
      'f|t|t|f',
      'containment disables authenticated mutation without reopening table writes',
    );

    console.log(JSON.stringify({
      database: 'PostgreSQL 15 disposable Docker container',
      independentSessions: true,
      queuedRevocationRejected: true,
      deterministicCrossUserLocks: true,
      effectiveAclMatrix: true,
      intermediateSql2StateChecked: true,
      failClosedContainmentChecked: true,
      productionWrites: false,
    }));
  } finally {
    spawnSync('docker', ['rm', '-f', container], {encoding: 'utf8'});
  }
});
