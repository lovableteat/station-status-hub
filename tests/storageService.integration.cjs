// Real disposable Storage API/PostgreSQL. No hosted project, credentials or data.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHmac, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const images = {
  pg: 'postgres:17.4-alpine@sha256:7062a2109c4b51f3c792c7ea01e83ed12ef9a980886e3b3d380a7d2e5f6ce3f5',
  storage: 'supabase/storage-api:v1.89.12@sha256:8526956cb462e9f7d392e9848ec77133b2769982ed614e9753cc687e8e4339a6',
};
const uid = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const quote = s => "'" + String(s).replaceAll("'", "''") + "'";
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('real Storage HTTP preserves historical paths and enforces attachment matrix', { timeout: 300000 }, async t => {
  assert.ok((process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_EVENT_NAME === 'pull_request')
    || process.env.STORAGE_COMPAT_LOCAL === '1', 'Use the isolated PR workflow or explicit local Docker opt-in');
  const suffix = randomBytes(6).toString('hex');
  const pg = `attachment-pg-${suffix}`, storage = `attachment-api-${suffix}`, network = `attachment-net-${suffix}`;
  const password = randomBytes(24).toString('hex'), secret = randomBytes(32).toString('hex');
  const secrets = new Set([password, secret]);
  const redact = value => [...secrets].reduce((s, key) => s.replaceAll(key, '[test credential]'), String(value));
  function docker(args, options = {}) {
    const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024, ...options });
    if (r.status !== 0) throw new Error(`Disposable Docker ${args[0]}: ${redact(r.stderr || r.error?.message || r.status)}`);
    return r.stdout.trim();
  }
  const sql = text => docker(['exec', '-i', pg, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], { input: text });
  function token(sub, role = 'authenticated', expires = 3600) {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const payload = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ role, ...(sub ? { sub } : {}), exp: Math.floor(Date.now() / 1000) + expires });
    const jwt = payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
    secrets.add(jwt); return jwt;
  }
  const actors = { anon: token(null, 'anon'), editor: token(uid(1)), viewer: token(uid(2)),
    inactive: token(uid(3)), otherWorkspace: token(uid(4)), unmapped: token(uid(5)),
    missingSubject: token(null), expired: token(uid(1), 'authenticated', -60), service: token(null, 'service_role') };
  const origin = 'http://127.0.0.1:5000';
  async function request(route, actor, options = {}) {
    const url = new URL(route, origin);
    assert.equal(url.origin, origin, 'No non-loopback or cross-origin request');
    const headers = new Headers(options.headers);
    if (actor) headers.set('Authorization', 'Bearer ' + actors[actor]);
    // The internal-only network deliberately publishes no host port. Make real
    // localhost HTTP requests inside this exact disposable container instead.
    const code = `let input=''; for await (const c of process.stdin) input+=c;
      const q=JSON.parse(input); const u=new URL(q.url);
      if(u.origin!=='http://127.0.0.1:5000') throw Error('Nonlocal request');
      const r=await fetch(u,{method:q.method,headers:q.headers,
        body:q.body===null?undefined:Buffer.from(q.body,'base64'),redirect:'error',signal:AbortSignal.timeout(10000)});
      console.log(JSON.stringify({status:r.status,headers:Object.fromEntries(r.headers),body:Buffer.from(await r.arrayBuffer()).toString('base64')}));`;
    const result = JSON.parse(docker(['exec', '-i', storage, 'node', '--input-type=module', '-e', code], {
      input: JSON.stringify({ url: url.href, method: options.method || 'GET', headers: Object.fromEntries(headers),
        body: options.body === undefined ? null : Buffer.from(options.body).toString('base64') }), timeout: 15000,
    }));
    return new Response([204,304].includes(result.status) ? null : Buffer.from(result.body,'base64'), {status:result.status,headers:result.headers});
  }
  const json = (method, value) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const objectPath = (bucket, name) => `${bucket}/${name.split('/').map(encodeURIComponent).join('/')}`;
  async function success(response, label) {
    const body = await response.text();
    assert.ok(response.ok, `${label}: HTTP ${response.status} ${redact(body).slice(0, 500)}`);
    return body;
  }
  async function denied(response, label) {
    assert.ok(response.status >= 400 && response.status < 500, `${label}: expected 4xx, received ${response.status}`);
    await response.arrayBuffer();
  }
  const rows = [];
  async function observe(actor, operation, response, allowed) {
    rows.push({ actor, operation, status: response.status, expected: allowed ? 'allow' : 'deny' });
    if (allowed) return success(response, `${actor} ${operation}`);
    return denied(response, `${actor} ${operation}`);
  }
  try {
    // Pull only pinned official images before creating an internal-only network.
    docker(['pull', images.pg]); docker(['pull', images.storage]);
    docker(['network', 'create', '--internal', network]);
    docker(['run', '--rm', '-d', '--name', pg, '--network', network,
      '--tmpfs', '/var/lib/postgresql/data:rw', '-e', 'POSTGRES_PASSWORD=' + password, images.pg]);
    for (let i = 0; ; i++) {
      const r = spawnSync('docker', ['exec', pg, 'pg_isready', '-U', 'postgres'], { encoding: 'utf8' });
      if (r.status === 0 && docker(['logs', pg]).includes('PostgreSQL init process complete')) break;
      if (i === 119) throw new Error('PostgreSQL readiness timeout');
      await sleep(250);
    }
    sql(`create schema auth; create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
        nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;`);
    const env = { DATABASE_URL: `postgres://postgres:${password}@${pg}:5432/postgres`, AUTH_JWT_SECRET: secret,
      ANON_KEY: actors.anon, SERVICE_KEY: actors.service, DB_INSTALL_ROLES: 'true', STORAGE_BACKEND: 'file',
      FILE_STORAGE_BACKEND_PATH: '/var/lib/storage', GLOBAL_S3_BUCKET: 'synthetic', TENANT_ID: 'synthetic',
      REGION: 'local', SERVER_PORT: '5000', PG_QUEUE_ENABLE: 'false', ENABLE_IMAGE_TRANSFORMATION: 'false',
      IMAGE_TRANSFORMATION_ENABLED: 'false', S3_PROTOCOL_ENABLED: 'false', FILE_SIZE_LIMIT: '1048576' };
    docker(['run', '--rm', '-d', '--name', storage, '--network', network,
      '--tmpfs', '/var/lib/storage:rw,mode=1777', ...Object.entries(env).flatMap(([k,v]) => ['-e', `${k}=${v}`]), images.storage]);
    for (let i = 0; ; i++) {
      try { if ((await request('/bucket', 'service')).ok) break; } catch {}
      if (i === 119) throw new Error('Storage readiness timeout: ' + redact(docker(['logs', storage])).slice(-5000));
      await sleep(250);
    }
    sql(`create schema workspace;
      create table workspace.system_users(id uuid primary key, auth_user_id uuid, status text, role text, permissions jsonb);
      create table workspace.user_page_permissions(user_id uuid,permission text);
      grant usage on schema auth,workspace to anon,authenticated,service_role;
      grant execute on function auth.uid() to anon,authenticated,service_role;
      insert into workspace.system_users values
        ('${uid(11)}','${uid(1)}','active','user','{"workspaceAccess":{"station-status":"edit"}}'),
        ('${uid(12)}','${uid(2)}','active','user','{"workspaceAccess":{"station-status":"view"}}'),
        ('${uid(13)}','${uid(3)}','inactive','admin','{}'),
        ('${uid(14)}','${uid(4)}','active','user','{"workspaceAccess":{"station-status":"none","ai-chat":"edit"}}');`);
    const helper = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/legacy-pcb-security/sequence-authorization-function.json'), 'utf8'));
    sql(helper.definition + `; revoke all on function workspace.current_user_can_workspace(text,text) from public;
      grant execute on function workspace.current_user_can_workspace(text,text) to authenticated,service_role;
      create policy synthetic_legacy_open on storage.objects for all to public using(true) with check(true);`);
    const buckets = ['issue-attachments', 'task-attachments', 'unrelated-control'];
    const seed = Buffer.from('Synthetic original attachment bytes\n% 中文\n');
    for (const bucket of buckets) {
      await success(await request('/bucket', 'service', json('POST', { id: bucket, name: bucket, public: true })), 'create synthetic bucket');
      await denied(await request('/object/' + objectPath(bucket, 'history/invalid%name.txt'), 'service', {
        method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'must not be stored' }), 'service rejects literal percent in a new object key');
      await success(await request('/object/' + objectPath(bucket, 'history/old image.txt'), 'service', {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'cache-control': '0' }, body: seed }), 'seed synthetic file');
    }
    const original = bucket => objectPath(bucket, 'history/old image.txt');
    assert.equal(sql("select count(*) from storage.objects where name like '%invalid%name%'"), '0');
    const historical = `/storage/v1/object/public/${original(buckets[0])}`;
    sql(`create table workspace.synthetic_documents(html text); insert into workspace.synthetic_documents values(${quote(`<p>unchanged</p><img src="${historical}">`)});`);
    const snapshot = () => sql(`select jsonb_build_object('objects',(select jsonb_agg(to_jsonb(o) order by bucket_id,name) from storage.objects o),
      'documents',(select jsonb_agg(to_jsonb(d)) from workspace.synthetic_documents d),
      'accounts',(select jsonb_agg(to_jsonb(a) order by id) from workspace.system_users a))::text;`);
    for (const bucket of buckets) assert.equal(digest(Buffer.from(await (await request('/object/public/' + original(bucket))).arrayBuffer())), digest(seed));
    const before = snapshot();
    // Apply the exact proposal, not an abbreviated policy clone.
    sql(readFileSync(path.join(root, 'docs/security-proposals/03-private-attachments.sql'), 'utf8'));
    assert.equal(snapshot(), before, 'Cutover preserves every synthetic object metadata, account and document byte');
    assert.equal(sql("select string_agg(id||':'||public::text,',' order by id) from storage.buckets"),
      'issue-attachments:false,task-attachments:false,unrelated-control:true');
    for (const bucket of buckets.slice(0, 2)) {
      await observe('anonymous-browser', `${bucket}:old-public-url`, await request('/object/public/' + original(bucket)), false);
      for (const actor of Object.keys(actors)) {
        const allowed = ['editor','viewer','service'].includes(actor);
        const r = await request('/object/authenticated/' + original(bucket), actor);
        if (allowed) { assert.equal(digest(Buffer.from(await observe(actor, `${bucket}:download`, r, true))), digest(seed)); }
        else await observe(actor, `${bucket}:download`, r, false);
        const signed = await request('/object/sign/' + original(bucket), actor, json('POST', { expiresIn: 3 }));
        const body = await observe(actor, `${bucket}:sign`, signed, allowed);
        if (allowed) {
          const route = JSON.parse(body).signedURL; assert.equal(typeof route, 'string');
          const bytes = Buffer.from(await (await request(route)).arrayBuffer()); assert.equal(digest(bytes), digest(seed));
        }
      }
      for (const actor of ['anon','viewer','inactive','otherWorkspace','unmapped','missingSubject','expired','editor']) {
        const name = `writes/${actor}.txt`, target = objectPath(bucket, name), allowed = actor === 'editor';
        await observe(actor, `${bucket}:upload`, await request('/object/' + target, actor, {
          method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'synthetic new file' }), allowed);
        // Existing objects are seeded independently so denied inserts cannot conceal missing UPDATE/DELETE guards.
        if (!allowed) await success(await request('/object/' + target, 'service', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'original' }), 'seed mutation target');
        await observe(actor, `${bucket}:replace`, await request('/object/' + target, actor, {
          method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'replacement' }), allowed);
        const removed = await request('/object/' + bucket, actor, json('DELETE', { prefixes: [name] }));
        // Storage may return 200 [] when RLS filters a delete. Assert retained/removed bytes as well as HTTP.
        let deleted = 0;
        if (removed.ok) {
          const result = JSON.parse(await success(removed, 'delete response'));
          assert.ok(Array.isArray(result)); deleted = result.length;
          assert.equal(deleted, allowed ? 1 : 0, `${actor}: deletion must match authorization`);
        } else { assert.equal(allowed, false); await denied(removed, `${actor}:delete`); }
        rows.push({actor,operation:`${bucket}:delete`,removed:deleted,expected:allowed?'allow':'deny'});
        if (!allowed) {
          assert.equal(await success(await request('/object/authenticated/' + target, 'service'), 'retained rejected target'), 'original');
          await success(await request('/object/' + bucket, 'service', json('DELETE', { prefixes: [name] })), 'clean synthetic target');
        }
      }
    }
    const short = JSON.parse(await success(await request('/object/sign/' + original(buckets[0]), 'viewer', json('POST', { expiresIn: 1 })), 'short signature')).signedURL;
    await sleep(2100); await denied(await request(short), 'expired signature');
    const valid = JSON.parse(await success(await request('/object/sign/' + original(buckets[0]), 'viewer', json('POST', { expiresIn: 30 })), 'pre-revocation signature')).signedURL;
    sql(`update workspace.system_users set status='inactive' where auth_user_id='${uid(2)}'`);
    await denied(await request('/object/sign/' + original(buckets[0]), 'viewer', json('POST', { expiresIn: 30 })), 'revoked viewer cannot mint');
    // Already-issued signed URLs are bearer capabilities until expiration, not immediate revocation.
    assert.equal(digest(Buffer.from(await (await request(valid)).arrayBuffer())), digest(seed));
    sql(`update workspace.system_users set status='active' where auth_user_id='${uid(2)}'`);
    assert.equal(snapshot(), before, 'Only temporary synthetic mutation targets were removed; original rows and bytes survive');
    assert.equal(digest(Buffer.from(await (await request('/object/public/' + original('unrelated-control'))).arrayBuffer())), digest(seed));
    console.log(JSON.stringify({ scope: 'disposable real Storage API/PostgreSQL, not hosted CDN or old browser proof', images, originalSha256: digest(seed), matrix: rows }));
  } catch (error) {
    throw new Error(redact(error.stack || error));
  } finally {
    for (const name of [storage, pg]) spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8', timeout: 15000 });
    spawnSync('docker', ['network', 'rm', network], { encoding: 'utf8', timeout: 15000 });
  }
});
