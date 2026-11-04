import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync('supabase/functions/openai-proxy/index.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const messages = [{ role: 'user', content: 'Read the synthetic SPEC and fill the JSON table.' }];
const schema = {
  type: 'object', additionalProperties: false, required: ['reply', 'tables'],
  properties: {
    reply: { type: 'string' },
    tables: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['templateId', 'columns', 'rows'], properties: {
      templateId: { type: 'string', enum: ['template-1'] },
      columns: { type: 'array', items: { type: 'string' } },
      rows: { type: 'array', items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['value', 'sourceId', 'quote'], properties: {
        value: { type: 'string' }, sourceId: { type: 'string' }, quote: { type: 'string' },
      } } } },
    } } },
  },
};
const format = value => ({ type: 'json_schema', json_schema: { name: 'material_spec_fill', strict: true, schema: value } });
function fixture({ permitted = true } = {}) {
  let handler;
  const calls = [];
  const key = { api_key: 'synthetic-private-key', is_active: true, expires_at: null, permissions: { metadata: { provider: 'openai', model: 'gpt-5.4', baseUrl: 'https://api.openai.com/v1' } } };
  const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: key, error: null }; } };
  const client = { rpc: async () => ({ data: permitted, error: null }), from: () => query };
  vm.runInNewContext('(function(require,module,exports){' + compiled + '\n})', {
    Deno: { env: { get: () => 'synthetic' }, serve: value => { handler = value; } },
    Request, Response, Headers, TextDecoder, AbortController, Date, setTimeout, clearTimeout,
    fetch: async (url, init) => { calls.push({ url, init }); return Response.json({ choices: [{ message: { content: 'ok' } }] }); },
  })((specifier) => { assert.match(specifier, /^npm:@supabase\/supabase-js@2\.100\.0$/); return { createClient: () => client }; }, { exports: {} }, {});
  return { calls, run: (options = {}, operation = 'chat') => handler(new Request('https://synthetic.supabase.co/functions/v1/openai-proxy', {
    method: 'POST', headers: { Authorization: 'Bearer synthetic-session' }, body: JSON.stringify({ operation, apiKeyId: 'synthetic-key-id', request: { model: 'gpt-5.4', messages, ...options } }),
  })) };
}

test('an ordinary existing chat keeps its original upstream body without new defaults', async () => {
  const f = fixture();
  assert.equal((await f.run()).status, 200);
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { model: 'gpt-5.4', messages });
});

test('validated precision and complete-output options reach the official provider unchanged', async () => {
  for (const budget of [16_384, 32_768]) {
    const f = fixture();
    const options = { reasoning_effort: 'high', max_completion_tokens: budget, response_format: format(schema), store: false };
    assert.equal((await f.run(options)).status, 200);
    assert.deepEqual(JSON.parse(f.calls[0].init.body), { model: 'gpt-5.4', messages, ...options });
    assert.equal(f.calls[0].url, 'https://api.openai.com/v1/chat/completions');
  }
});

test('invalid completion budgets and reasoning controls fail before the upstream call', async () => {
  for (const options of [
    ...[0, -1, 32_769, 1.5, '16384', true, null].map(max_completion_tokens => ({ max_completion_tokens })),
    ...['unbounded', 10, {}, null].map(reasoning_effort => ({ reasoning_effort })),
    { store: true }, { store: 'false' },
  ]) {
    const f = fixture();
    assert.equal((await f.run(options)).status, 400, JSON.stringify(options));
    assert.equal(f.calls.length, 0);
  }
});

test('response format names, schema shape and external references are rejected safely', async () => {
  const invalid = [null, [], { type: 'tool' }, { type: 'json_object', url: 'https://synthetic.invalid' },
    { type: 'json_schema', json_schema: { name: '../invalid', schema } },
    { type: 'json_schema', json_schema: { name: 'x'.repeat(65), schema } },
    { type: 'json_schema', json_schema: { name: 'valid', strict: 'true', schema } },
    format({ type: 'array' }), format({ type: 'object', properties: [] }), format({ type: 'object', required: 'all' }),
    format({ type: 'object', properties: { field: { type: 'unknown' } } }),
    format({ type: 'object', properties: { field: { $ref: 'https://synthetic.invalid/schema' } } }),
    format({ type: 'object', description: 'x'.repeat(33_000) }),
  ];
  for (const response_format of invalid) {
    const f = fixture();
    const response = await f.run({ response_format });
    assert.equal(response.status, 400);
    assert.equal(f.calls.length, 0);
    assert.ok(!(await response.text()).includes('synthetic-private-key'));
  }
});

test('schema complexity is bounded without confusing property names with schema keywords', async () => {
  let deep = { type: 'string' };
  for (let i = 0; i < 20; i++) deep = { type: 'array', items: deep };
  const f = fixture();
  assert.equal((await f.run({ response_format: format({ type: 'object', properties: { deep } }) })).status, 400);
  assert.equal(f.calls.length, 0);
  const valid = { type: 'object', additionalProperties: false, required: ['required', 'properties'], properties: { required: { type: 'string' }, properties: { type: 'string' } } };
  assert.equal((await f.run({ response_format: format(valid) })).status, 200);
});

test('generation options cannot enable tools, streaming, metadata or override access checks', async () => {
  const f = fixture();
  assert.equal((await f.run({ max_completion_tokens: 16_384, stream: true, tools: [{ type: 'function' }], metadata: { private: 'should-not-forward' }, temperature: 1 })).status, 200);
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { model: 'gpt-5.4', messages, max_completion_tokens: 16_384 });
  const denied = fixture({ permitted: false });
  assert.equal((await denied.run({ response_format: format(schema), reasoning_effort: 'high' })).status, 403);
  assert.equal(denied.calls.length, 0);
});

test('simple JSON and text output formats are supported while model discovery stays unchanged', async () => {
  for (const type of ['json_object', 'text']) {
    const f = fixture();
    assert.equal((await f.run({ response_format: { type } })).status, 200);
    assert.deepEqual(JSON.parse(f.calls[0].init.body).response_format, { type });
  }
  const f = fixture();
  assert.equal((await f.run({ reasoning_effort: 'invalid' }, 'models')).status, 200);
  assert.equal(f.calls[0].init.body, undefined);
  assert.equal(f.calls[0].url, 'https://api.openai.com/v1/models');
});
