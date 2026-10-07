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
  for (const kind of ['auth', 'invalid', 'billing', 'tracking']) {
    let calls = 0;
    await assert.rejects(requestAiWithRecovery({ targets, execute: async () => { calls++; throw new AiRequestFailure(kind, kind); } }), error => error.kind === kind);
    assert.equal(calls, 1);
  }
  assert.equal(classifyAiFailure(403, {}).kind, 'auth');
  assert.equal(classifyAiFailure(402, {}).kind, 'billing');
  assert.equal(classifyAiFailure(429, { error: { message: 'billing credits exhausted' } }).kind, 'billing');
  assert.equal(classifyAiFailure(429, { error: { details: [{ quotaId: 'GenerateRequestsPerDay' }] } }).kind, 'daily-quota');
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
