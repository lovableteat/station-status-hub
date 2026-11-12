// CI-only, disposable PostgreSQL + PostgREST. No production URLs, keys or data.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHmac } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { createClient } = require('@supabase/supabase-js');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const postgresImage = 'postgres:17.4-alpine';
// Official Docker registry manifest digest verified for v12.2.12 (linux amd64/arm64).
const postgrestImage = 'postgrest/postgrest:v12.2.12@sha256:5f4ce744539bbba786b4e24dbbd95bdb2a956dcf568c5374995a0ff4a68f5bd2';
const redactions = new Set();
const redact = value => [...redactions].reduce((s, secret) => s.replaceAll(secret, '[ephemeral test credential]'), String(value));
const read = name => readFileSync(path.join(root, name), 'utf8');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function docker(args, options = {}) {
  const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, ...options });
  // Never echo Docker env arguments, which contain ephemeral test credentials.
  if (r.status !== 0) throw new Error(`Isolated Docker ${args[0]} failed: ${redact(r.stderr || r.error?.message || r.status)}`);
  return r.stdout.trim();
}
function quote(value) {
  if (value === null || value === undefined) return 'NULL';
  if (Array.isArray(value)) return `ARRAY[${value.map(quote).join(',')}]`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') { assert.ok(Number.isFinite(value)); return String(value); }
  return "'" + String(typeof value === 'object' ? JSON.stringify(value) : value).replaceAll("'", "''") + "'";
}
function bind(sql, values) { return sql.replace(/\$(\d+)\b/g, (_, n) => { assert.ok(Number(n) <= values.length); return quote(values[Number(n) - 1]); }); }
function actualReader(client) {
  const source = ts.transpileModule(read('src/lib/systemUserProfiles.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext('(function(require,module,exports){' + source + '\n})', { console, Set, Object, Array, Error })(name => {
    assert.equal(name, '@/integrations/supabase/client'); return { supabase: client };
  }, module, module.exports);
  return module.exports;
}
function snapshot(n) {
  return { projects: [{ id: `project-${n}`, name: `Synthetic ${n}`, updatedAt: '2026-01-01T00:00:00Z' }],
    library: [{ id: `custom-${n}`, source: 'custom' }, { id: `builtin-${n}`, source: 'built-in' }],
    templates: [{ id: `PRIVATE-TEMPLATE-${n}` }], activeProjectId: `project-${n}`,
    pendingPlacementsByProject: { private: `PRIVATE-PENDING-${n}` }, modelAssets: { private: `PRIVATE-MODEL-${n}` },
    unknownPrivate: `PRIVATE-UNKNOWN-${n}`, remoteDeletions: { projects: [`deleted-${n}`], library: [], templates: [`PRIVATE-DELETED-${n}`] },
    updatedAt: '2026-01-01T00:00:00Z' };
}

test('real PostgREST and SDK enforce sanitized profiles and protected legacy PCB reads', { timeout: 240000 }, async t => {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Run container execution only in authorized GitHub CI');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'pull_request', 'This service test is only for the isolated PR workflow');
  const pg = `legacy-pcb-http-pg-${process.pid}`, rest = `legacy-pcb-http-rest-${process.pid}`;
  const password = randomBytes(24).toString('hex'), secret = randomBytes(32).toString('hex');
  redactions.add(password); redactions.add(secret);
  let origin; const requests = [];
  const psql = sql => docker(['exec', '-i', pg, 'psql', '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'legacy_pcb_test'], { input: sql });
  // Fixture setup has session-scoped SET statements. Execute its recorded
  // commands in one psql session rather than losing those settings per call.
  let recordingFixture = true;
  const fixtureStatements = [];
  const db = {
    exec: async sql => { if (recordingFixture) fixtureStatements.push(sql); else psql(sql); },
    query: async (sql, values = []) => {
      sql = bind(sql, values).trim().replace(/;$/, '');
      if (recordingFixture) { fixtureStatements.push(sql); return { rows: [] }; }
      if (/^select\b/i.test(sql)) return { rows: JSON.parse(psql(`select coalesce(json_agg(result),'[]'::json) from (${sql}) result;`)) };
      psql(sql); return { rows: [] };
    },
  };
  function token(sub, role = 'authenticated', expired = false) {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const value = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ role, ...(sub ? { sub } : {}), exp: Math.floor(Date.now()/1000) + (expired ? -3600 : 3600) });
    return value + '.' + createHmac('sha256', secret).update(value).digest('base64url');
  }
  async function http(endpoint, bearer, options = {}) {
    const url = new URL(endpoint, origin); assert.equal(url.origin, origin);
    const headers = new Headers(options.headers); headers.set('accept-profile', 'workspace'); headers.set('content-profile', 'workspace');
    if (bearer) headers.set('authorization', 'Bearer ' + bearer);
    return fetch(url, { ...options, headers, signal: options.signal || AbortSignal.timeout(15000) });
  }
  function sdk(bearer) {
    return createClient(origin, 'synthetic-api-key-not-a-production-credential', {
      db: { schema: 'workspace' }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: 'Bearer ' + bearer }, fetch: async (input, options = {}) => {
        const url = new URL(typeof input === 'string' ? input : input.url || String(input));
        assert.equal(url.origin, origin); assert.ok(url.pathname.startsWith('/rest/v1/'), 'SDK cannot contact Auth or any other service');
        url.pathname = url.pathname.slice('/rest/v1'.length);
        requests.push({ method: options.method || 'GET', path: url.pathname, query: url.search, body: options.body });
        return fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      } },
    });
  }
  const success = result => { assert.equal(result.error, null); return result.data; };
  try {
    docker(['run', '--rm', '-d', '--name', pg, '-e', 'POSTGRES_PASSWORD=' + password,
      '-e', 'POSTGRES_DB=legacy_pcb_test', '-p', '127.0.0.1::3000', postgresImage]);
    for (let i = 0; i < 90; i++) {
      const logs = spawnSync('docker', ['logs', pg], { encoding: 'utf8' });
      const ready = spawnSync('docker', ['exec', pg, 'pg_isready', '-U', 'postgres'], { encoding: 'utf8' });
      if (ready.status === 0 && `${logs.stdout}\n${logs.stderr}`.includes('PostgreSQL init process complete')) break;
      if (i === 89) throw new Error('Disposable PostgreSQL readiness timeout');
      await sleep(250);
    }
    const f = await import(pathToFileURL(path.join(__dirname, 'fixtures/legacy-pcb-security/database.mjs')).href);
    await f.fixture(db);
    psql(fixtureStatements.join(';\n'));
    recordingFixture = false;
    // Adapt only the synthetic Auth stub to PostgREST's actual verified JWT GUC.
    psql(`create or replace function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;`);
    for (let n = 1; n <= 5; n++) await f.addAccount(db, n, { role: n === 4 ? 'admin' : 'engineer', status: n === 5 ? 'disabled' : 'active', permissions: {
      workspaceAccess: { 'pcb-designer': n === 3 ? 'none' : 'edit', 'station-status': 'edit' },
      pagePermissions: ['dashboard_view'], preserved: { nested: [false, null, '繁體'] }, pcbDesignerWorkspace: snapshot(n),
    } });
    await f.addAccount(db, 6, { permissions: null }); await f.addAccount(db, 7, { permissions: [] });
    psql(`update workspace.system_users set created_at=created_at+(substring(id::text,25)::int * interval '1 day');
      create table workspace.synthetic_profile_refs(id integer primary key,user_id uuid references workspace.system_users(id));
      insert into workspace.synthetic_profile_refs values(1,'${f.uid(1)}');
      alter table workspace.synthetic_profile_refs enable row level security;
      create policy synthetic_refs_read on workspace.synthetic_profile_refs for select to authenticated using(true);
      grant select on workspace.synthetic_profile_refs to authenticated;`);
    const before = psql('select jsonb_agg(to_jsonb(u) order by id) from workspace.system_users u');
    await db.exec(read('docs/security-proposals/legacy-pcb/01-add-read-apis-PENDING.sql'));
    await db.exec(read('docs/security-proposals/pcb-rpc-cutover-PENDING.sql'));
    const { isolatedEnforcementBody } = await import(pathToFileURL(path.join(__dirname, 'fixtures/legacy-pcb-security/release-gate.mjs')).href);
    await db.exec(isolatedEnforcementBody(read('docs/security-proposals/legacy-pcb/02-close-raw-permissions-PENDING.sql')));
    assert.equal(psql('select jsonb_agg(to_jsonb(u) order by id) from workspace.system_users u'), before);
    psql(`create role synthetic_authenticator login noinherit password ${quote(password)};
      grant anon,authenticated,service_role to synthetic_authenticator;`);
    const port = docker(['port', pg, '3000/tcp']); assert.match(port, /^127\.0\.0\.1:\d+$/); origin = `http://${port}`;
    docker(['run', '--rm', '-d', '--name', rest, '--network', 'container:' + pg,
      '-e', `PGRST_DB_URI=postgres://synthetic_authenticator:${password}@127.0.0.1:5432/legacy_pcb_test`,
      '-e', 'PGRST_DB_SCHEMAS=workspace', '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', 'PGRST_JWT_SECRET=' + secret,
      '-e', 'PGRST_SERVER_HOST=0.0.0.0', '-e', 'PGRST_SERVER_PORT=3000', postgrestImage]);
    for (let i = 0; i < 90; i++) {
      try { if ((await http('/', null, { signal: AbortSignal.timeout(1000) })).status === 200) break; } catch { /* server not ready */ }
      if (i === 89) throw new Error('Disposable PostgREST readiness timeout'); await sleep(250);
    }
    const user = sdk(token(f.uid(101))), nonPcb = sdk(token(f.uid(103))), admin = sdk(token(f.uid(104)));
    const reader = actualReader(nonPcb);
    await t.test('production TypeScript reader uses real zero-argument POST RPC filtering and ordering', async () => {
      const own = success(await reader.readSystemUserProfile(f.uid(1)));
      assert.deepEqual(Object.keys(own), f.fields); assert.equal(own.approved_at, null); assert.equal(own.approved_by, null);
      assert.equal(own.permissions.pcbDesignerWorkspace, undefined); assert.deepEqual(own.permissions.preserved, { nested: [false, null, '繁體'] });
      const all = success(await reader.listSystemUserProfiles()); assert.equal(all.length, 7);
      assert.deepEqual(all.map(row => row.id), [7,6,5,4,3,2,1].map(f.uid));
      assert.equal(all.find(row => row.id === f.uid(6)).permissions, null); assert.deepEqual(all.find(row => row.id === f.uid(7)).permissions, []);
      assert.equal(success(await reader.readSystemUserProfile(f.uid(999))), null, 'maybeSingle maps actual zero-row response to null');
      const calls = requests.filter(r => r.path === '/rpc/list_system_user_profiles');
      assert.ok(calls.some(r => r.method === 'POST' && r.query.includes('id=eq.') && r.body === '{}'));
      assert.ok(calls.some(r => r.method === 'POST' && r.query.includes('order=created_at.desc')));
    });
    await t.test('raw column, JSON paths, filters and whole-row requests are denied by actual SQL', async () => {
      for (const [select, filter] of [['permissions'], ['permissions->pcbDesignerWorkspace'], ['*'], ['id','permissions->pcbDesignerWorkspace=not.is.null']]) {
        const params = new URLSearchParams({ select });
        if (filter) { const i = filter.indexOf('='); params.set(filter.slice(0,i),filter.slice(i+1)); }
        const r = await http('/system_users?' + params, token(f.uid(103)));
        assert.equal(r.status, 403); assert.equal((await r.json()).code, '42501');
      }
      const visible = success(await nonPcb.from('system_users').select(f.fields.filter(x => x !== 'permissions').join(',')));
      assert.equal(visible.length, 7);
    });
    await t.test('real embedded relationship retains public identity but rejects embedded permissions', async () => {
      const permitted = success(await nonPcb.from('synthetic_profile_refs').select('id,system_users(id,username)'));
      assert.equal(permitted[0].system_users.id, f.uid(1));
      const denied = await nonPcb.from('synthetic_profile_refs').select('id,system_users(permissions)');
      assert.equal(denied.status, 403); assert.equal(denied.error.code, '42501');
    });
    await t.test('legacy RPC keeps exact own snapshot and never includes others private fields', async () => {
      const data = success(await user.rpc('load_pcb_designer_legacy_workspace'));
      assert.equal(data.schemaVersion, 1); assert.equal(data.ownSnapshotPresent, true); assert.deepEqual(data.ownSnapshot, snapshot(1));
      assert.equal(data.sharedCatalog.length, 5); assert.equal(JSON.stringify(data.sharedCatalog).includes('PRIVATE-'), false);
      assert.deepEqual(data.sharedCatalog.map(row => row.library.length), [1,1,1,1,1]);
      const spoof = await user.rpc('load_pcb_designer_legacy_workspace', { p_user_id: f.uid(2) });
      assert.ok(spoof.error); assert.equal(spoof.error.code, 'PGRST202');
    });
    for (const [name, bearer] of [
      ['non-PCB', token(f.uid(103))], ['disabled', token(f.uid(105))], ['unmapped', token(f.uid(999))],
      ['old application ID is not an Auth subject', token(f.uid(1))], ['subject missing', token(null)],
      ['expired session', token(f.uid(101),'authenticated',true)], ['service role',token(f.uid(104),'service_role')],
    ]) await t.test('legacy HTTP access denied for ' + name, async () => {
      const r = await http('/rpc/load_pcb_designer_legacy_workspace', bearer, { method:'POST',headers:{'content-type':'application/json'},body:'{}' });
      assert.ok([401,403].includes(r.status));
      const data = await r.json(); assert.ok(data.code); assert.equal(JSON.stringify(data).includes('PRIVATE-'), false);
    });
    await t.test('anonymous old tab cannot retrieve either contract or raw permissions', async () => {
      for (const endpoint of ['/rpc/list_system_user_profiles','/rpc/load_pcb_designer_legacy_workspace']) {
        const r = await http(endpoint,null,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}); assert.ok([401,403].includes(r.status));
      }
    });
    await t.test('scalar HEAD is not an authorization probe; anonymous GET and POST remain denied', async () => {
      // A no-body HEAD can let PostgreSQL omit an unused scalar expression.
      // Do not treat its status as evidence that the RPC actually executed.
      const endpoint = '/rpc/load_pcb_designer_legacy_workspace';
      const head = await http(endpoint, null, { method:'HEAD' });
      assert.ok([200,401,403].includes(head.status));
      assert.equal(await head.text(), '');
      for (const method of ['GET','POST']) {
        const options = method === 'POST'
          ? { method, headers:{'content-type':'application/json'}, body:'{}' }
          : { method };
        const response = await http(endpoint, null, options);
        assert.ok([401,403].includes(response.status));
        const error = await response.json();
        assert.equal(error.code, '42501');
        assert.equal(JSON.stringify(error).includes('PRIVATE-'), false);
      }
      console.log(JSON.stringify({ syntheticScalarHeadStatus:head.status, headIsNotAuthorizationEvidence:true }));
    });
    await t.test('all HTTP reads and denials preserve every synthetic account and snapshot', async () => {
      assert.equal(psql('select jsonb_agg(to_jsonb(u) order by id) from workspace.system_users u'), before);
    });
    await t.test('real normal permission setter preserves the exact legacy key and unrelated fields', async () => {
      const access = { 'pcb-designer':'view','station-status':'view','material-requests':'none','data-center':'none' };
      success(await admin.rpc('set_user_access_permissions', { p_user_id:f.uid(2),p_permissions:['dashboard_view'],p_workspace_access:access,p_granted_by:'Synthetic HTTP admin',p_performance_manager:true }));
      const value = JSON.parse(psql(`select permissions from workspace.system_users where id='${f.uid(2)}'`));
      assert.deepEqual(value.pcbDesignerWorkspace,snapshot(2)); assert.deepEqual(value.preserved,{nested:[false,null,'繁體']});
      assert.deepEqual(value.workspaceAccess,access); assert.equal(value.performanceManager,true);
    });
    const digests = [postgresImage, postgrestImage].map(image => JSON.parse(docker(['image','inspect',image,'--format','{{json .RepoDigests}}'])));
    console.log(JSON.stringify({ imageRepoDigests:digests, postgres:postgresImage,postgrest:postgrestImage,realSdk:true,actualReader:true,actualHttp:true,syntheticOnly:true,productionWrites:false,realtimeVerified:false }));
  } finally {
    for (const name of [rest,pg]) spawnSync('docker',['rm','-f',name],{encoding:'utf8',timeout:15000});
  }
});
