// Run with AUDIT_QA_DIR pointing to the external React 18 renderer fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { React, act, create, child, deferred, browser, database, loader, flush } = require('./support/renderHarness.cjs');
const key = id => ({ id, key_name: id, api_key: `fixture-${id}`, permissions: { metadata: { provider: 'gemini', model: 'gemini-2.5-flash', baseUrl: 'https://fixture.invalid' } }, is_active: true });

async function fixture(read) {
  let owner = 'account-a';
  const projects = { activeProjectId: null, allProjects: [] };
  const db = database(query => query.table === 'api_keys' ? read(owner) : { data: [], error: null });
  const load = loader({ window: browser(), mocks: {
    '@/integrations/supabase/client': { supabase: db },
    '@/components/auth/UserContext': { useUser: () => ({ user: { userId: owner } }) },
    '@/components/test-projects/TestProjectProvider': { useTestProject: () => projects },
    './ApiChatConsole': { ApiChatConsole: child },
  } });
  const { ApiChatWorkspacePage } = load('src/components/api-management/ApiChatWorkspacePage.tsx');
  let root;
  await act(async () => { root = create(React.createElement(ApiChatWorkspacePage)); }); await flush();
  return { db, root, keys: () => Array.from(root.root.find(node => node.type === 'stub' && node.props.availableApiKeys).props.availableApiKeys, item => item.id), account: async id => { owner = id; await act(async () => root.update(React.createElement(ApiChatWorkspacePage))); await flush(); }, unmount: () => act(async () => root.unmount()) };
}

test('account API key loads cannot apply a late previous-account list', async () => {
  const old = deferred();
  const f = await fixture(owner => owner === 'account-a' ? old.promise : { data: [key('b-key')], error: null });
  try {
    await f.account('account-b');
    await act(async () => old.resolve({ data: [key('a-key')], error: null })); await flush();
    assert.deepEqual(f.keys(), ['b-key']);
  } finally { await f.unmount(); }
});

test('a late initial key read cannot override the newest realtime refresh', async () => {
  const old = deferred(); let calls = 0;
  const f = await fixture(() => ++calls === 1 ? old.promise : { data: [key('latest-key')], error: null });
  try {
    await act(async () => f.db.channels[0].emit('api_keys', {})); await flush();
    await act(async () => old.resolve({ data: [key('outdated-key')], error: null })); await flush();
    assert.deepEqual(f.keys(), ['latest-key']);
  } finally { await f.unmount(); }
});
