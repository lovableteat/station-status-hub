import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function fixture({ rpc, fetch, invoke, accelerateLongTimers = false }) {
  const cache = new Map(), timers = new Set(), events = [];
  const timer = (callback, ms) => {
    const id = setTimeout(() => { timers.delete(id); callback(); }, accelerateLongTimers && ms >= 8_000 ? 20 : ms);
    timers.add(id); return id;
  };
  const clear = id => { timers.delete(id); clearTimeout(id); };
  const load = file => {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const require = spec => spec === '@/integrations/supabase/client' ? { supabase: { rpc, functions: { invoke } } }
      : load(spec.startsWith('@/') ? path.resolve('src', spec.slice(2) + '.ts') : path.resolve(path.dirname(file), spec + '.ts'));
    vm.runInNewContext('(function(require,module,exports){' + output + '\n})', { console: { error() {} }, Date, Intl, AbortController, DOMException, Headers, Response, fetch, crypto: globalThis.crypto, setTimeout: timer, clearTimeout: clear, window: { dispatchEvent: event => events.push(event.type) }, CustomEvent }, { filename: file })(require, module, module.exports);
    return module.exports;
  };
  return { ...load('src/components/api-management/aiUsageTelemetry.ts'), ...load('src/components/api-management/aiProviderTransport.ts'), events, dispose: () => timers.forEach(clearTimeout) };
}
const pending = () => new Promise(() => {});
const builder = promise => Object.assign(promise, { abortSignal(signal) { this.signal = signal; return this; } });
const input = { apiKeyId: 'key', provider: 'gemini', model: 'gemini-3.8-flash', source: 'ai-chat', attemptNumber: 1, url: 'https://provider.invalid', init: { method: 'POST' }, timeoutMs: 100 };

test('headers arriving without a body cannot hold the UI forever; fetch is aborted and timeout recorded', async () => {
  const records = []; let signal;
  const f = fixture({ rpc: (name, args) => { records.push([name, args]); return builder(Promise.resolve({ error: null })); }, fetch: async (_url, init) => { signal = init.signal; return { status: 200, arrayBuffer: pending }; } });
  try {
    await assert.rejects(f.trackedProviderFetch({ ...input, timeoutMs: 30 }), error => error.kind === 'timeout');
    assert.equal(signal.aborted, true);
    const finish = records.find(([name]) => name === 'finish_ai_model_usage_attempt');
    assert.equal(finish[1].p_outcome, 'timeout');
  } finally { f.dispose(); }
});

test('a stalled telemetry completion does not hold back a ready provider answer', async () => {
  let finishing = false;
  const f = fixture({ rpc: name => builder(name.startsWith('finish') ? (finishing = true, pending()) : Promise.resolve({ error: null })), fetch: async () => new Response('{"answer":"ready"}', { status: 200, headers: { 'Content-Type': 'application/json' } }) });
  try {
    const response = await Promise.race([f.trackedProviderFetch(input), new Promise((_, reject) => setTimeout(() => reject(new Error('answer blocked by telemetry')), 250))]);
    assert.deepEqual(await response.json(), { answer: 'ready' });
    assert.equal(finishing, true);
  } finally { f.dispose(); }
});

test('a stalled or rejected usage gate is bounded and does not send an untracked provider request', async () => {
  for (const result of [pending(), Promise.resolve({ error: { message: 'permission denied' } })]) {
    let calls = 0;
    const f = fixture({ accelerateLongTimers: true, rpc: () => builder(result), fetch: async () => { calls++; return new Response('{}'); } });
    try {
      await assert.rejects(f.trackedProviderFetch({ ...input, timeoutMs: 25_000 }), error => error.kind === 'tracking');
      assert.equal(calls, 0);
    } finally { f.dispose(); }
  }
});

test('HTTP errors retain status, retry delay and body even if usage completion fails', async () => {
  const records = [];
  const f = fixture({ rpc: (name, args) => { records.push([name, args]); return builder(Promise.resolve({ error: name.startsWith('finish') ? { message: 'offline' } : null })); }, fetch: async () => new Response('{"error":{"message":"overloaded"}}', { status: 503, headers: { 'Retry-After': '20' } }) });
  try {
    const response = await f.trackedProviderFetch(input);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Retry-After'), '20');
    assert.equal((await response.json()).error.message, 'overloaded');
    assert.equal(records[1][1].p_outcome, 'http_error');
    assert.equal('p_api_key' in records[0][1], false);
  } finally { f.dispose(); }
});

test('saved OpenAI requests use the authenticated backend without sending the provider key', async () => {
  const calls = []; let directCalls = 0;
  const f = fixture({
    rpc: () => builder(Promise.resolve({ error: null })),
    fetch: async () => { directCalls++; return new Response('{}'); },
    invoke: async (name, options) => {
      calls.push({ name, options });
      return { data: { choices: [{ message: { content: 'proxy ready' } }] }, error: null, response: new Response('{}') };
    },
  });
  try {
    const response = await f.trackedProviderFetch({ ...input, provider: 'openai', model: 'gpt-5.4', url: 'https://api.openai.com/v1/chat/completions', init: { method: 'POST', headers: { Authorization: 'Bearer fixture-openai-secret' }, body: JSON.stringify({ model: 'gpt-5.4', messages: [{ role: 'user', content: 'hello' }] }) } });
    assert.equal(directCalls, 0);
    assert.equal(calls[0].name, 'openai-proxy');
    assert.equal(calls[0].options.body.apiKeyId, 'key');
    assert.equal(JSON.stringify(calls).includes('fixture-openai-secret'), false);
    assert.equal((await response.json()).choices[0].message.content, 'proxy ready');
  } finally { f.dispose(); }
});

test('OpenAI backend HTTP failures preserve retry headers and never fall back to the blocked browser route', async () => {
  let directCalls = 0;
  const f = fixture({
    rpc: () => builder(Promise.resolve({ error: null })),
    fetch: async () => { directCalls++; return new Response('{}'); },
    invoke: async () => ({ data: null, error: new Error('HTTP error'), response: new Response('{"error":{"message":"limited"}}', { status: 429, headers: { 'Retry-After': '20' } }) }),
  });
  try {
    const response = await f.trackedProviderFetch({ ...input, provider: 'openai', url: 'https://api.openai.com/v1/chat/completions', init: { method: 'POST', body: '{}' } });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Retry-After'), '20');
    assert.equal(directCalls, 0);
  } finally { f.dispose(); }
});

test('unsaved OpenAI model discovery uses the same backend and cancellation remains AbortError', async () => {
  const controller = new AbortController(); let calls = 0;
  const f = fixture({
    rpc: () => builder(Promise.resolve({ error: null })),
    fetch: async () => { throw new Error('browser route must not be used'); },
    invoke: async (_name, options) => {
      calls++;
      assert.equal(options.body.operation, 'models');
      assert.equal(options.body.apiKey, 'fixture-new-key');
      if (options.signal?.aborted) return { error: new Error('aborted') };
      return { data: { data: [{ id: 'gpt-5.4' }] }, error: null };
    },
  });
  try {
    const init = { method: 'GET', headers: { Authorization: 'Bearer fixture-new-key' }, signal: controller.signal };
    assert.equal((await (await f.fetchAiProvider('openai', 'https://api.openai.com/v1/models', init)).json()).data[0].id, 'gpt-5.4');
    controller.abort();
    await assert.rejects(f.fetchAiProvider('openai', 'https://api.openai.com/v1/models', init), error => error.name === 'AbortError');
    assert.equal(calls, 2);
  } finally { f.dispose(); }
});

test('an unreachable OpenAI backend returns a network failure without exposing the provider key', async () => {
  const f = fixture({ invoke: async () => ({ error: new Error('fetch failed') }), fetch: async () => { throw new Error('unexpected direct call'); } });
  try {
    await assert.rejects(f.fetchAiProvider('openai', 'https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer fixture-secret' } }), error => error.kind === 'network' && !error.message.includes('fixture-secret'));
  } finally { f.dispose(); }
});
