import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/api-management/aiRequestRecovery.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { AiRequestFailure, classifyAiFailure, requestAiWithRecovery, readAiCooldowns, writeAiCooldowns, nextPacificMidnight } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const targets = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'].map(model => ({ id: `key::${model}`, model, cooldownUntil: 0 }));

test('503 switches to another model once, records cooldown and exposes the actual successful model', async () => {
  const requests = [], failures = [], progress = [];
  const reply = await requestAiWithRecovery({
    targets, now: () => 1_000,
    execute: async (target, attempt, timeout) => {
      requests.push([target.model, attempt, timeout]);
      if (attempt === 1) throw classifyAiFailure(503, { error: { message: 'overloaded' } });
      return 'answer';
    },
    onFailure: (target, failure, until) => failures.push([target.id, failure.kind, until]),
    onProgress: value => progress.push(value),
  });
  assert.deepEqual(requests, [['gemini-3.8-flash', 1, 25_000], ['gemini-3.5-flash-lite', 2, 25_000]]);
  assert.equal(reply.result, 'answer');
  assert.equal(reply.target.model, 'gemini-3.5-flash-lite');
  assert.deepEqual(failures, [[targets[0].id, 'busy', 91_000]]);
  assert.match(progress[1], /gemini-3.5-flash-lite/);
});

test('cooldown survives reopening and prevents requests until expiry', async () => {
  let stored;
  writeAiCooldowns({ [targets[0].id]: 91_000 }, { setItem: (_key, value) => { stored = value; } });
  const restored = readAiCooldowns({ getItem: () => stored }, 1_000);
  const requests = [];
  await requestAiWithRecovery({ targets: targets.map(target => ({ ...target, cooldownUntil: restored[target.id] || 0 })), now: () => 1_000, execute: async target => { requests.push(target.model); return 'answer'; } });
  assert.deepEqual(requests, ['gemini-3.5-flash-lite']);
  assert.deepEqual(readAiCooldowns({ getItem: () => stored }, 92_000), {});
  assert.deepEqual(readAiCooldowns({ getItem: () => '{invalid' }), {});
  await assert.rejects(requestAiWithRecovery({ targets: targets.map(target => ({ ...target, cooldownUntil: 91_000 })), now: () => 1_000, execute: async () => assert.fail('cooled model must not be called') }), /未重送請求/);
});

test('provider RetryInfo and Retry-After determine the earliest permitted retry', async () => {
  assert.equal(classifyAiFailure(429, { error: { details: [{ retryDelay: '47s' }] } }, '60').retryAfterMs, 60_000);
  let time = 0, attempts = 0;
  const waits = [];
  await requestAiWithRecovery({
    targets: [targets[0]], now: () => time, random: () => 0,
    execute: async () => { if (++attempts === 1) throw classifyAiFailure(429, { error: { details: [{ retryDelay: '47s' }] } }); return 'answer'; },
    pause: async ms => { waits.push(ms); time += ms; },
  });
  assert.deepEqual(waits, [47_000]);
  attempts = 0; time = 0; waits.length = 0;
  await requestAiWithRecovery({ targets: [targets[0]], now: () => time, random: () => 0, execute: async () => { if (++attempts === 1) throw classifyAiFailure(429, {}); return 'answer'; }, pause: async ms => { waits.push(ms); time += ms; } });
  assert.deepEqual(waits, [60_000]);
});

test('authentication, invalid content, billing and failed usage gate stop immediately', async () => {
  for (const kind of ['auth', 'model-access', 'invalid', 'billing', 'tracking']) {
    let calls = 0;
    await assert.rejects(requestAiWithRecovery({ targets, execute: async () => { calls++; throw new AiRequestFailure(kind, kind); } }), error => error.kind === kind);
    assert.equal(calls, 1);
  }
  assert.equal(classifyAiFailure(403, {}).kind, 'auth');
  assert.equal(classifyAiFailure(402, {}).kind, 'billing');
  assert.equal(classifyAiFailure(429, { error: { message: 'billing credits exhausted' } }).kind, 'billing');
  assert.equal(classifyAiFailure(429, { error: { details: [{ quotaId: 'GenerateRequestsPerDay' }] } }).kind, 'daily-quota');
});

test('Sol entitlement rejection explains model access without treating the working key as invalid', async () => {
  const payload = { error: {
    message: 'Project `proj_private` does not have access to model `gpt-6.1-sol`',
    type: 'invalid_request_error', code: 'model_not_found',
  } };
  const failure = classifyAiFailure(403, payload);
  assert.equal(failure.kind, 'model-access');
  assert.equal(failure.status, 403);
  assert.match(failure.message, /尚未開通「gpt-6\.1-sol」/);
  assert.match(failure.message, /OpenAI 平台/);
  assert.doesNotMatch(failure.message, /金鑰無效|重新登入|proj_private/);
  let calls = 0;
  await assert.rejects(requestAiWithRecovery({ targets, execute: async () => {
    calls++;
    throw failure;
  } }), error => error === failure);
  assert.equal(calls, 1, 'must not substitute another model after a model permission rejection');
  const missing = classifyAiFailure(404, { error: { code: 'model_not_found', message: 'Unknown model' } });
  assert.equal(missing.kind, 'model-access');
  assert.match(missing.message, /模型名稱及使用權限/);
  assert.equal(classifyAiFailure(401, payload).kind, 'auth');
  assert.equal(classifyAiFailure(403, { error: { message: 'API Key 無效' } }).kind, 'auth');
});

test('daily limits are not immediately retried and Pacific reset respects daylight saving', async () => {
  let calls = 0;
  await assert.rejects(requestAiWithRecovery({ targets: [targets[0]], execute: async () => { calls++; throw classifyAiFailure(429, { error: { message: 'perDay quota' } }); } }), /今日額度/);
  assert.equal(calls, 1);
  assert.equal(new Date(nextPacificMidnight(Date.parse('2026-07-08T18:00:00Z'))).toISOString(), '2026-07-09T07:00:00.000Z');
  assert.equal(new Date(nextPacificMidnight(Date.parse('2026-11-01T07:30:00Z'))).toISOString(), '2026-11-02T08:00:00.000Z');
});

test('stalled models have one overall budget and no more than three attempts', async () => {
  let time = 0;
  const deadlines = [];
  await assert.rejects(requestAiWithRecovery({ targets, now: () => time, execute: async (_target, _attempt, timeout) => { deadlines.push(timeout); time += timeout; throw new AiRequestFailure('timeout', 'timeout'); } }), /已停止等待/);
  assert.deepEqual(deadlines, [25_000, 25_000, 25_000]);
  assert.equal(time, 75_000);
  time = 0; deadlines.length = 0;
  await assert.rejects(requestAiWithRecovery({ targets, hasAttachments: true, now: () => time, execute: async (_target, _attempt, timeout) => { deadlines.push(timeout); time += timeout; throw new AiRequestFailure('timeout', 'timeout'); } }), /已停止等待/);
  assert.deepEqual(deadlines, [45_000, 45_000]);
  assert.equal(time, 90_000);
});

test('selected GPT-6.1 Sol has time to reason with or without attachments', async () => {
  const sol = { id: 'openai::gpt-6.1-sol', model: 'gpt-6.1-sol', cooldownUntil: 0 };
  for (const hasAttachments of [false, true]) {
    let time = 0;
    const reply = await requestAiWithRecovery({
      targets: [sol], hasAttachments, now: () => time,
      execute: async (target, attempt, timeout) => {
        assert.equal(target, sol);
        assert.equal(attempt, 1);
        assert.equal(timeout, 110_000);
        time += 60_000;
        return 'reasoned answer';
      },
    });
    assert.equal(reply.target, sol);
    assert.equal(reply.result, 'reasoned answer');
    assert.equal(reply.durationMs, 60_000);
  }
});

test('GPT-6.1 Sol retries stay within 120 seconds and keep the selected model', async () => {
  const sol = { id: 'openai::gpt-6.1-sol', model: 'gpt-6.1-sol', cooldownUntil: 0 };
  let time = 0;
  const deadlines = [];
  await assert.rejects(requestAiWithRecovery({
    targets: [sol], now: () => time, random: () => 0,
    pause: async ms => { time += ms; },
    execute: async (target, attempt, timeout) => {
      assert.equal(target, sol);
      deadlines.push(timeout);
      time += timeout;
      throw new AiRequestFailure('network interrupted', 'network');
    },
  }), /已停止重送/);
  assert.deepEqual(deadlines, [110_000, 9_000]);
  assert.equal(time, 120_000);
});

test('non-Sol OpenAI models retain ordinary text and attachment deadlines', async () => {
  for (const model of ['gpt-5.4', 'gpt-6.1-astra', 'gpt-6.1-sol-custom']) {
    for (const hasAttachments of [false, true]) {
      await requestAiWithRecovery({
        targets: [{ id: `openai::${model}`, model, cooldownUntil: 0 }], hasAttachments,
        execute: async (_target, _attempt, timeout) => {
          assert.equal(timeout, hasAttachments ? 45_000 : 25_000);
          return 'answer';
        },
      });
    }
  }
});
