const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {spawn, spawnSync} = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const image = process.env.PERMISSION_TEST_POSTGRES_IMAGE || 'postgres:17.4-alpine';
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
select set_config('request.jwt.claim.sub', '${uid}', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set role authenticated;
${statement}
`;
}

function identity(uid, statement) {
  return `
select set_config('request.jwt.claim.sub', '${uid}', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
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

test('PostgreSQL 17.4 runs SQL1→SQL2→SQL3 and closes account mutation races', {timeout: 180000}, async () => {
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
    psql(readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261002160000_enforce_explicit_permission_revocation.sql'), 'utf8'));
    psql("insert into supabase_migrations.schema_migrations(version, name) values ('20261002160000', 'enforce_explicit_permission_revocation')");
    assert.equal(
      psql(identity(actorB, "select workspace.current_user_has_stored_page_permission('data_center_view');"), true).split(/\r?\n/).at(-1),
      'f',
      'an explicit empty durable array revokes the legacy row',
    );
    psql(`update workspace.system_users set permissions = permissions - 'pagePermissions' where id='${actorB}'`);
    assert.equal(
      psql(identity(actorB, "select workspace.current_user_has_stored_page_permission('data_center_view');"), true).split(/\r?\n/).at(-1),
      't',
      'legacy fallback is used only when the durable key is absent',
    );
    psql(`update workspace.system_users set permissions = jsonb_set(permissions, '{pagePermissions}', '{"bad":true}'::jsonb) where id='${actorB}'`);
    assert.equal(
      psql(identity(actorB, "select workspace.current_user_has_stored_page_permission('data_center_view');"), true).split(/\r?\n/).at(-1),
      'f',
      'a malformed durable value fails closed instead of restoring legacy access',
    );
    psql(`update workspace.system_users set permissions = '{"workspaceAccess":{},"pagePermissions":["data_center_view"]}'::jsonb where id='${actorB}'`);
    assert.equal(
      psql(authenticated(actorB, 'select public.can_view_data_center_projects();'), true).split(/\r?\n/).at(-1),
      't',
      'a missing workspace key retains the documented detailed-permission fallback',
    );
    psql(`update workspace.system_users set permissions = '{"workspaceAccess":[],"pagePermissions":["data_center_view"]}'::jsonb where id='${actorB}'`);
    assert.equal(
      psql(authenticated(actorB, 'select public.can_view_data_center_projects();'), true).split(/\r?\n/).at(-1),
      'f',
      'a malformed workspace container fails closed',
    );
    psql(`update workspace.system_users set permissions = '{"workspaceAccess":{"user-management":"none"},"pagePermissions":[],"performanceManager":false}'::jsonb where id='${actorB}'`);

    psql(readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261002170000_align_account_permission_mutation_entrypoints.sql'), 'utf8'));
    psql("insert into supabase_migrations.schema_migrations(version, name) values ('20261002170000', 'align_account_permission_mutation_entrypoints')");
    assert.equal(
      psql(`select
        has_function_privilege('anon','public.set_user_access_permissions(uuid,public.page_permission[],jsonb,text)','execute'),
        has_function_privilege('authenticated','public.set_user_access_permissions(uuid,public.page_permission[],jsonb,text)','execute'),
        has_table_privilege('authenticated','workspace.user_page_permissions','insert')`, true),
      'f|t|t',
      'SQL2 secures the RPC but intentionally has not closed the legacy table boundary',
    );
    psql(readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261003075222_close_permission_table_boundary.sql'), 'utf8'));
    psql("insert into supabase_migrations.schema_migrations(version, name) values ('20261003075222', 'close_permission_table_boundary')");

    const downgradeAttempt = await session(readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '20261002170000_align_account_permission_mutation_entrypoints.sql'),
      'utf8',
    ));
    assert.notEqual(downgradeAttempt.code, 0, 'SQL2 must refuse to run after SQL3');
    assert.match(downgradeAttempt.stderr, /SQL2 cannot run after SQL3/);

    psql("delete from supabase_migrations.schema_migrations where version='20261002170000'");
    const missingPrerequisite = await session(readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '20261003075222_close_permission_table_boundary.sql'),
      'utf8',
    ));
    assert.notEqual(missingPrerequisite.code, 0, 'SQL3 must require the SQL2 migration record');
    assert.match(missingPrerequisite.stderr, /SQL3 requires SQL2/);
    psql("insert into supabase_migrations.schema_migrations(version, name) values ('20261002170000', 'align_account_permission_mutation_entrypoints')");

    const safeRoster = psql(authenticated(actorA, `
      select string_agg(
        id::text || ':' || username || ':' || coalesce(display_name, '') || ':' || role || ':' || status,
        ',' order by username
      )
      from workspace.system_users;
    `), true).split(/\r?\n/).at(-1);
    assert.match(safeRoster, /actor-a:Actor A:engineer:active/);
    assert.match(safeRoster, /ordinary-b:Ordinary B:engineer:active/);

    const forbiddenRosterColumn = await session(authenticated(actorA,
      'select created_at from workspace.system_users limit 1;'));
    assert.notEqual(forbiddenRosterColumn.code, 0, 'the browser role must not read fields outside safe-seven');
    assert.match(forbiddenRosterColumn.stderr, /permission denied/i);

    const profileSave = psql(authenticated(actorA, `select workspace.update_system_user_admin_profile(
      '${actorB}'::uuid, null, null, null, null, 'Saved through guarded profile RPC'
    );`), true);
    assert.match(profileSave, /Saved through guarded profile RPC/);
    psql(authenticated(actorA, rpc(actorB, 'true')));
    assert.equal(
      psql(`select display_name || '|' || (permissions->>'performanceManager') from workspace.system_users where id='${actorB}'`, true),
      'Saved through guarded profile RPC|true',
      'profile and permission admin saves succeed without browser table writes',
    );

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

    psql(`
      update workspace.system_users
      set role='engineer', status='active', permissions='{"workspaceAccess":{"user-management":"edit"},"pagePermissions":["admin_edit"],"performanceManager":false}'::jsonb
      where id='${actorA}';
      update workspace.system_users set status='pending' where id='${actorB}';
    `);
    let approvalLocked;
    const approvalLockedSignal = new Promise(resolve => { approvalLocked = resolve; });
    const approvalRevoker = session(`
begin;
update workspace.system_users
set permissions = '{"workspaceAccess":{"user-management":"none"},"pagePermissions":[],"performanceManager":false}'::jsonb
where id = '${actorA}'::uuid;
\\echo APPROVAL_ACTOR_LOCKED
select pg_sleep(2);
commit;
`, output => { if (output.includes('APPROVAL_ACTOR_LOCKED')) approvalLocked(); });
    await approvalLockedSignal;
    const queuedApprovalAt = Date.now();
    const queuedApproval = session(authenticated(actorA,
      `select public.approve_system_user('${actorB}'::uuid);`));
    const [approvalRevoked, approval] = await Promise.all([approvalRevoker, queuedApproval]);
    assert.equal(approvalRevoked.code, 0, approvalRevoked.stderr);
    assert.notEqual(approval.code, 0, 'queued approval must be rejected after revocation');
    assert.match(approval.stderr, /Administrator permission required/);
    assert.ok(Date.now() - queuedApprovalAt >= 1200, 'approval waited behind the actor row lock');
    assert.equal(psql(`select status from workspace.system_users where id='${actorB}'`, true), 'pending');

    psql(`
      update workspace.system_users
      set role='admin', permissions='{"workspaceAccess":{"user-management":"edit"},"pagePermissions":["admin_edit"],"performanceManager":false}'::jsonb
      where id='${actorA}';
      update workspace.system_users set role='engineer', status='active' where id='${actorB}';
    `);
    let profileLocked;
    const profileLockedSignal = new Promise(resolve => { profileLocked = resolve; });
    const profileRevoker = session(`
begin;
update workspace.system_users
set role='engineer', permissions='{"workspaceAccess":{"user-management":"none"},"pagePermissions":[],"performanceManager":false}'::jsonb
where id = '${actorA}'::uuid;
\\echo PROFILE_ACTOR_LOCKED
select pg_sleep(2);
commit;
`, output => { if (output.includes('PROFILE_ACTOR_LOCKED')) profileLocked(); });
    await profileLockedSignal;
    const queuedProfileAt = Date.now();
    const queuedProfile = session(authenticated(actorA, `select workspace.update_system_user_admin_profile(
      '${actorB}'::uuid, null, null, 'admin', 'inactive', null
    );`));
    const [profileRevoked, profileUpdate] = await Promise.all([profileRevoker, queuedProfile]);
    assert.equal(profileRevoked.code, 0, profileRevoked.stderr);
    assert.notEqual(profileUpdate.code, 0, 'queued role/status update must be rejected after revocation');
    assert.match(profileUpdate.stderr, /Administrator permission required/);
    assert.ok(Date.now() - queuedProfileAt >= 1200, 'profile update waited behind the actor row lock');
    assert.equal(
      psql(`select role || '|' || status from workspace.system_users where id='${actorB}'`, true),
      'engineer|active',
      'revoked actor did not change target role or activation',
    );

    psql(`update workspace.system_users set role='admin', permissions=jsonb_set(permissions,'{workspaceAccess,user-management}','"edit"') where id in ('${actorA}','${actorC}')`);
    let barrierLocked;
    const barrierLockedSignal = new Promise(resolve => { barrierLocked = resolve; });
    const barrier = session(`
begin;
select pg_advisory_xact_lock(424242);
\\echo CROSS_BARRIER_LOCKED
select pg_sleep(2);
commit;
`, output => { if (output.includes('CROSS_BARRIER_LOCKED')) barrierLocked(); });
    await barrierLockedSignal;
    const crossStartedAt = Date.now();
    const crossAPromise = session(authenticated(actorA, `begin;
select pg_advisory_xact_lock_shared(424242);
select pg_sleep(0.2);
${rpc(actorC, 'true')}
commit;`));
    const crossCPromise = session(authenticated(actorC, `begin;
select pg_advisory_xact_lock_shared(424242);
select pg_sleep(0.2);
${rpc(actorA, 'false')}
commit;`));
    const [, crossA, crossC] = await Promise.all([barrier, crossAPromise, crossCPromise]);
    assert.equal(crossA.code, 0, crossA.stderr);
    assert.equal(crossC.code, 0, crossC.stderr);
    assert.doesNotMatch(crossA.stderr + crossC.stderr, /deadlock detected/i);
    assert.ok(Date.now() - crossStartedAt >= 1200, 'both opposing saves were released from the same barrier');

    psql(`update workspace.system_users set role='admin', status='active', permissions='{"workspaceAccess":{"user-management":"edit"},"pagePermissions":["admin_edit"],"performanceManager":false}'::jsonb where id='${actorA}'`);
    const [backupSession, laptopSession] = await Promise.all([
      session(authenticated(actorA, `select workspace.update_system_user_admin_profile('${actorB}', null, null, null, 'inactive', 'Backup session');`)),
      session(authenticated(actorA, `select workspace.update_system_user_admin_profile('${actorC}', null, null, null, null, 'Laptop session');`)),
    ]);
    assert.equal(backupSession.code, 0, backupSession.stderr);
    assert.equal(laptopSession.code, 0, laptopSession.stderr);
    assert.equal(
      psql(`select string_agg(display_name, '|' order by id) from workspace.system_users where id in ('${actorB}','${actorC}')`, true),
      'Backup session|Laptop session',
      'independent sessions for the same account remain authorized without device binding',
    );
    psql(`update workspace.system_users set status='active' where id='${actorB}'`);

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
    select set_config('request.jwt.claim.sub', '', false);
    select set_config('request.jwt.claim.role', 'service_role', false);
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
        has_function_privilege('authenticated','workspace.update_system_user_admin_profile(uuid,text,text,text,text,text)','execute'),
        has_function_privilege('authenticated','workspace.approve_system_user(uuid)','execute'),
        has_table_privilege('authenticated','workspace.user_page_permissions','select'),
        has_table_privilege('authenticated','workspace.user_page_permissions','insert')`, true),
      'f|t|f|f|t|f',
      'containment disables authenticated permission/profile/activation mutation without reopening table writes',
    );

    console.log(JSON.stringify({
      database: 'PostgreSQL 17.4 disposable Docker container',
      fullMigrationOrder: ['SQL1', 'SQL2', 'SQL3'],
      independentSessions: true,
      queuedRevocationRejected: true,
      queuedApprovalRejected: true,
      queuedRoleStatusMutationRejected: true,
      multiSessionAccountAccess: true,
      deterministicCrossUserLocks: true,
      effectiveAclMatrix: true,
      restrictedRosterLoad: true,
      guardedAdminSaveFlows: true,
      intermediateSql2StateChecked: true,
      migrationOrderGuardsChecked: true,
      failClosedContainmentChecked: true,
      productionWrites: false,
    }));
  } finally {
    spawnSync('docker', ['rm', '-f', container], {encoding: 'utf8'});
  }
});
