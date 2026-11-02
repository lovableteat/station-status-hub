import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync('supabase/functions/openai-proxy/index.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture({ authenticated = true, permitted = true, keyPatch = {}, upstreamStatus = 200 } = {}) {
  let handler;
  const calls = [], permissions = [];
  const key = { api_key: 'fixture-openai-secret', is_active: true, expires_at: null, permissions: { metadata: { provider: 'openai', model: 'gpt-5.4', baseUrl: 'https://api.openai.com/v1' } }, ...keyPatch };
  const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: key, error: null }; } };
  const client = { auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'user' } : null }, error: null }) }, rpc: async (_name, args) => { permissions.push(args); return { data: permitted, error: null }; }, from: () => query };
  vm.runInNewContext('(function(require,module,exports){' + compiled + '\n})', {
    Deno: { env: { get: name => name === 'SUPABASE_URL' ? 'https://fixture.supabase.co' : 'fixture-anon' }, serve: fn => { handler = fn; } },
    Request, Response, Headers, TextDecoder, AbortController, Date, setTimeout, clearTimeout,
    fetch: async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ message: 'fixture-openai-secret', choices: [{ message: { content: 'ready' } }] }), { status: upstreamStatus, headers: { 'Retry-After': '20', 'x-request-id': 'fixture-request' } }); },
  })((name) => { assert.match(name, /@supabase\/supabase-js@2\.100\.0/); return { createClient: (_url, _key, options) => { assert.equal(options.global.headers.Authorization, 'Bearer fixture-user'); return client; } }; }, { exports: {} }, {});
  return { calls, permissions, run: (body = { operation: 'chat', apiKeyId: 'key', request: { model: 'gpt-5.4', messages: [{ role: 'user', content: 'hello' }] } }, { authorization = 'Bearer fixture-user', method = 'POST' } = {}) => handler(new Request('https://fixture.supabase.co/functions/v1/openai-proxy', { method, headers: authorization ? { Authorization: authorization } : {}, body: method === 'POST' ? JSON.stringify(body) : undefined })) };
}

test('proxy requires a verified user and current workspace permission before any provider call', async () => {
  for (const [options, request, expected] of [
    [{}, { authorization: '' }, 401],
    [{ authenticated: false }, {}, 401],
    [{ permitted: false }, {}, 403],
  ]) {
    const f = fixture(options);
    assert.equal((await f.run(undefined, request)).status, expected);
    assert.equal(f.calls.length, 0);
  }
});

test('preflight is available while unsupported methods and operations cannot call OpenAI', async () => {
  const f = fixture();
  assert.equal((await f.run(undefined, { method: 'OPTIONS', authorization: '' })).headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await f.run(undefined, { method: 'GET' })).status, 405);
  assert.equal((await f.run({ operation: 'https://untrusted.invalid' })).status, 400);
  assert.equal(f.calls.length, 0);
});

test('saved keys remain bound to enabled status, expiry, official provider and saved model', async () => {
  for (const patch of [
    { is_active: false }, { expires_at: '2000-01-01T00:00:00Z' },
    { permissions: { metadata: { provider: 'gemini', model: 'gpt-5.4', baseUrl: 'https://api.openai.com/v1' } } },
    { permissions: { metadata: { provider: 'openai', model: 'gpt-5.4', baseUrl: 'https://untrusted.invalid' } } },
    { permissions: { metadata: { provider: 'openai', model: 'different-model', baseUrl: 'https://api.openai.com/v1' } } },
  ]) {
    const f = fixture({ keyPatch: patch });
    assert.ok((await f.run()).status >= 400);
    assert.equal(f.calls.length, 0);
  }
});

test('proxy uses the stored key, fixes the upstream URL and preserves HTTP errors and retry headers', async () => {
  const f = fixture({ upstreamStatus: 429 });
  const response = await f.run({ operation: 'chat', apiKeyId: 'key', apiKey: 'ignored-client-key', url: 'https://untrusted.invalid', request: { model: 'gpt-5.4', messages: [{ role: 'user', content: 'hello' }], stream: true } });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '20');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(f.calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer fixture-openai-secret');
  assert.equal(f.calls[0].init.redirect, 'error');
  assert.equal(JSON.parse(f.calls[0].init.body).stream, undefined);
  assert.equal((await response.text()).includes('fixture-openai-secret'), false);
  assert.equal(f.permissions[0].p_action, 'view');
});

test('model discovery and unsaved-key verification require editing permission and only reach the official model endpoint', async () => {
  const f = fixture();
  const response = await f.run({ operation: 'models', apiKey: 'new-fixture-key' });
  assert.equal(response.status, 200);
  assert.equal(f.permissions[0].p_action, 'edit');
  assert.equal(f.calls[0].url, 'https://api.openai.com/v1/models');
  assert.equal(f.calls[0].init.body, undefined);
  assert.equal(f.calls[0].init.headers.Authorization, 'Bearer new-fixture-key');
});
