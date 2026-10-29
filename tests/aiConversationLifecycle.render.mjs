// Run with AUDIT_QA_DIR pointing to the external React 18 renderer fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { React, act, create, child, deferred, browser, database, loader, flush } = require('./support/renderHarness.cjs');
const record = { id: 'key', key_name: 'Fixture Gemini', api_key: 'fake-key', permissions: { metadata: { provider: 'gemini', model: 'gemini-2.5-flash', baseUrl: 'https://fixture.invalid/v1beta' } }, is_active: true };
const target = { id: 'key::gemini-2.5-flash', model: 'gemini-2.5-flash', record };
const row = (id, title, draft = '') => ({ conversation_key: id, title, saved_at: 1234, draft_message: draft, messages: [{ id: `${id}-u`, role: 'user', content: `${title} question`, createdAt: 1234 }], provider: 'gemini', model: target.model, key_label: record.key_name });
const answer = text => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

async function fixture({ rows = [row('conversation-active-workspace', 'Current'), row('historic-id', 'History')], read, save, fetch = async () => answer('Fixture answer'), globals = {} } = {}) {
  let ownerId = 'account-a';
  const writes = [];
  const win = browser();
  const db = database(query => query.table === 'ai_workspace_conversations'
    ? (read?.(query.filters.owner_id) ?? { data: rows, error: null }) : { data: [], error: null });
  db.rpc = (name, args) => {
    if (name !== 'sync_ai_workspace_conversations') return Promise.resolve({ data: null, error: null });
    writes.push(structuredClone(args));
    return save?.(args) ?? Promise.resolve({ data: rows.length, error: null });
  };
  const load = loader({ window: win, mocks: {
    '@/components/auth/UserContext': { useUser: () => ({ user: { userId: ownerId } }) },
    '@/integrations/supabase/client': { supabase: db },
    'sonner': { toast: { success() {}, error() {}, info() {} } },
    './aiUsageTelemetry': { trackedProviderFetch: ({ url, init }) => fetch(url, init) },
    './AiQuotaStatus': { AiQuotaStatus: child }, './MarkdownMessage': { MarkdownMessage: ({ content }) => React.createElement('p', null, content) },
    '@/components/ui/textarea': { Textarea: React.forwardRef((props, ref) => React.createElement('stub', { ...props, ref })) },
    './MaintenanceCitationList': { MaintenanceCitationList: child }, './MaintenanceSourceSelector': { MaintenanceSourceSelector: child }, './pptxAttachment': { isPptxFile: () => false },
  }, globals: { Response, TextEncoder, TextDecoder, requestAnimationFrame: callback => setTimeout(callback, 0), ...globals } });
  const { ApiChatConsole } = load('src/components/api-management/ApiChatConsole.tsx');
  const props = { mode: 'chat-only', selectedApiKey: record, selectedModel: target.model, selectedApiKeyTargetId: target.id, availableApiKeyTargets: [target] };
  let root;
  await act(async () => { root = create(React.createElement(ApiChatConsole, props)); });
  await flush();
  const input = () => root.root.find(node => node.type === 'stub' && node.props['aria-label'] === '輸入查詢內容');
  const click = async label => { await act(async () => root.root.findAll(node => node.type === 'stub' && node.props['aria-label'] === label)[0].props.onClick()); };
  const select = async title => { await act(async () => root.root.find(node => node.type === 'button' && node.findAll(n => n.type === 'p' && n.children.includes(title)).length).props.onClick()); };
  const draft = async value => { await act(async () => input().props.onChange({ target: { value } })); };
  const newConversation = async () => {
    await click('建立新對話');
    await act(async () => root.root.find(node => node.type === 'stub' && node.children.includes('確認建立')).props.onClick());
  };
  const account = async id => { ownerId = id; await act(async () => root.update(React.createElement(ApiChatConsole, { ...props }))); await flush(); };
  const remount = async () => { await act(async () => root.unmount()); await act(async () => { root = create(React.createElement(ApiChatConsole, props)); }); await flush(); };
  const rendered = () => root.root.findAll(node => node.children.some(item => typeof item === 'string')).map(node => node.children.filter(item => typeof item === 'string').join('')).join('\n');
  return { get root() { return root; }, win, writes, input, click, select, draft, newConversation, account, remount, rendered, unmount: () => act(async () => root.unmount()) };
}

test('selecting history does not create a duplicate or rewrite its ID; edits update that history entry', async () => {
  const f = await fixture();
  try {
    await f.select('History');
    await flush(950);
    assert.equal(f.writes.length, 0, 'selection is a read, not a cloud save');
    await f.draft('Edited history draft'); await flush(950);
    assert.equal(f.writes.length, 1);
    assert.deepEqual(f.writes[0].p_items.map(item => item.id).sort(), ['conversation-active-workspace', 'historic-id']);
    assert.equal(f.writes[0].p_items.find(item => item.id === 'historic-id').draftMessage, 'Edited history draft');
    assert.equal(f.writes[0].p_items.find(item => item.id === 'conversation-active-workspace').messages[0].content, 'Current question');
  } finally { await f.unmount(); }
});

test('new conversation preserves existing IDs and an old response cannot append into the new conversation', async () => {
  const pending = deferred();
  const f = await fixture({ fetch: () => pending.promise });
  try {
    await f.draft('Question before new conversation'); await f.click('送出查詢');
    await f.newConversation();
    await f.draft('Brand new draft');
    await act(async () => pending.resolve(answer('Late old answer'))); await flush(950);
    assert.doesNotMatch(f.rendered(), /Late old answer/);
    const latest = f.writes.at(-1).p_items;
    assert.equal(latest.length, 3);
    assert.equal(latest.find(item => item.id === 'conversation-active-workspace').messages.at(-1).content, 'Question before new conversation');
    assert.equal(latest.find(item => item.id === 'historic-id').messages[0].content, 'History question');
    assert.equal(latest.filter(item => item.draftMessage === 'Brand new draft').length, 1);
  } finally { await f.unmount(); }
});

test('deleting the selected conversation clears its editor and late responses cannot recreate it', async () => {
  const pending = deferred();
  const f = await fixture({ fetch: () => pending.promise });
  try {
    await f.draft('Pending question'); await f.click('送出查詢');
    await act(async () => f.root.root.find(node => node.type === 'button' && node.props['aria-label'] === '刪除對話：Current').props.onClick());
    assert.equal(f.input().props.value, '');
    await act(async () => pending.resolve(answer('Deleted late answer'))); await flush(950);
    assert.doesNotMatch(f.rendered(), /Deleted late answer/);
    assert.deepEqual(f.writes.at(-1).p_items.map(item => item.id), ['historic-id']);
  } finally { await f.unmount(); }
});

test('account switching rejects late AI results and late private loads from the previous account', async () => {
  const oldLoad = deferred(), pending = deferred();
  let initialLoaded = false;
  const f = await fixture({ read: owner => owner === 'account-b' ? { data: [row('b-id', 'Account B')], error: null } : initialLoaded ? oldLoad.promise : { data: [row('conversation-active-workspace', 'Account A')], error: null }, fetch: () => pending.promise });
  try {
    initialLoaded = true;
    await f.draft('Account A request'); await f.click('送出查詢');
    await f.account('account-b');
    await act(async () => pending.resolve(answer('Account A late answer'))); await flush();
    assert.doesNotMatch(f.rendered(), /Account A late answer/);
    await f.account('account-a'); await f.account('account-b');
    await act(async () => oldLoad.resolve({ data: [row('old-a', 'Late A load')], error: null })); await flush();
    assert.match(f.rendered(), /Account B/);
    assert.doesNotMatch(f.rendered(), /Late A load/);
    await f.select('Account B'); await f.draft('B draft'); await flush(950);
    assert.equal(f.writes.at(-1).p_owner_id, 'account-b');
    assert.ok(f.writes.at(-1).p_items.every(item => !item.id.startsWith('old-a')));
  } finally { await f.unmount(); }
});

test('an earlier save completing cannot claim the newest draft is already synchronized', async () => {
  const first = deferred(), second = deferred();
  let calls = 0;
  const f = await fixture({ save: () => ++calls === 1 ? first.promise : second.promise });
  try {
    await f.draft('First draft'); await flush(950);
    await f.draft('Latest draft'); await flush(950);
    await act(async () => first.resolve({ data: 2, error: null })); await flush();
    assert.match(f.rendered(), /儲存中/);
    assert.equal(f.writes.at(-1).p_items.find(item => item.id === 'conversation-active-workspace').draftMessage, 'Latest draft');
    await act(async () => second.resolve({ data: 2, error: null })); await flush();
    assert.doesNotMatch(f.rendered(), /儲存中/);
  } finally { first.resolve({ data: 2, error: null }); second.resolve({ data: 2, error: null }); await f.unmount(); }
});

test('a draft switched away before debounce is recovered when returning to its account', async () => {
  const accountRows = owner => ({ data: [row('conversation-active-workspace', owner)], error: null });
  const f = await fixture({ read: accountRows });
  try {
    await f.draft('Unsynced account A draft');
    await f.account('account-b');
    await f.account('account-a');
    assert.equal(f.input().props.value, 'Unsynced account A draft');
    await flush(950);
    assert.equal(f.writes.at(-1).p_owner_id, 'account-a');
    assert.equal(f.writes.at(-1).p_items[0].draftMessage, 'Unsynced account A draft');
  } finally { await f.unmount(); }
});

test('cloud load failure has a retry that restores the same conversation without any hydration writes', async () => {
  let failed = true;
  const f = await fixture({ read: () => failed ? { data: null, error: new Error('Fixture offline') } : { data: [row('kept-id', 'Recovered')], error: null } });
  try {
    const retry = f.root.root.findAll(node => node.type === 'stub' && node.props['aria-label'] === '重試對話同步');
    assert.equal(retry.length, 1);
    failed = false;
    await f.click('重試對話同步'); await flush(950);
    assert.match(f.rendered(), /Recovered/);
    assert.equal(f.writes.length, 0);
  } finally { await f.unmount(); }
});

test('the 24 conversation limit cannot evict any existing cloud ID', async () => {
  const rows = Array.from({ length: 24 }, (_, index) => row(index ? `history-${index}` : 'conversation-active-workspace', `History ${index}`));
  const f = await fixture({ rows });
  try {
    await f.newConversation(); await f.draft('Retained current draft'); await flush(950);
    assert.deepEqual(f.writes.at(-1).p_items.map(item => item.id).sort(), rows.map(item => item.conversation_key).sort());
  } finally { await f.unmount(); }
});

test('clearing a saved draft removes only its empty active entry so discarded text cannot restore', async () => {
  const f = await fixture({ rows: [] });
  try {
    await f.draft('Draft to clear'); await flush(950);
    assert.equal(f.writes.at(-1).p_items[0].draftMessage, 'Draft to clear');
    await f.draft(''); await flush(950);
    assert.equal(f.writes.length, 2);
    assert.deepEqual(f.writes.at(-1).p_items, []);
  } finally { await f.unmount(); }
});

test('retrying a failed save keeps the selected history and its unsubmitted draft', async () => {
  let calls = 0;
  const f = await fixture({ save: () => Promise.resolve(++calls === 1 ? { error: new Error('Fixture save offline') } : { data: 2, error: null }) });
  try {
    await f.select('History'); await f.draft('History draft after failure'); await flush(950);
    await f.click('重試對話同步'); await flush();
    assert.equal(f.input().props.value, 'History draft after failure');
    await flush(950);
    assert.equal(f.writes.at(-1).p_items.find(item => item.id === 'historic-id').draftMessage, 'History draft after failure');
    assert.equal(f.root.root.find(node => node.type === 'button' && node.props['aria-current'] === 'true').findAll(node => node.type === 'p')[0].children[0], 'History');
  } finally { await f.unmount(); }
});

test('clearing a draft before debounce cannot resurrect the discarded text after an account switch', async () => {
  const f = await fixture({ rows: [] });
  try {
    await f.draft('Unsaved draft to discard'); await f.draft('');
    await f.account('account-b'); await f.account('account-a');
    assert.equal(f.input().props.value, '');
    assert.doesNotMatch(f.rendered(), /Unsaved draft to discard/);
  } finally { await f.unmount(); }
});

test('clearing a draft during an older save queues the empty snapshot after that save', async () => {
  const first = deferred(); let calls = 0;
  const f = await fixture({ rows: [], save: () => ++calls === 1 ? first.promise : Promise.resolve({ data: 0, error: null }) });
  try {
    await f.draft('Draft canceled during sync'); await flush(950);
    await f.draft('');
    await act(async () => first.resolve({ data: 1, error: null })); await flush(950);
    assert.equal(f.writes.length, 2);
    assert.deepEqual(f.writes.at(-1).p_items, []);
    assert.doesNotMatch(f.rendered(), /儲存中/);
  } finally { first.resolve({ data: 0, error: null }); await f.unmount(); }
});

test('an established conversation title cannot change when typing an unsubmitted draft', async () => {
  const f = await fixture();
  try {
    await f.select('History'); await f.draft('Unsubmitted draft must not rename history'); await flush(950);
    assert.equal(f.writes.at(-1).p_items.find(item => item.id === 'historic-id').title, 'History');
  } finally { await f.unmount(); }
});

test('starting a new conversation releases an old attachment read and ignores its late completion', async () => {
  const pending = deferred();
  class Reader { readAsDataURL() { pending.promise.then(() => { this.result = 'data:application/pdf;base64,JVBERi0xLjc='; this.onload(); }); } abort() { this.onabort?.(); } }
  const f = await fixture({ globals: { FileReader: Reader } });
  try {
    await act(async () => f.root.root.find(node => node.type === 'input' && node.props.type === 'file').props.onChange({ currentTarget: { files: [new File(['%PDF-1.7\n%%EOF'], 'old.pdf')], value: 'file' } })); await flush();
    await f.newConversation(); await f.draft('Fresh draft');
    assert.equal(f.root.root.find(node => node.type === 'stub' && node.props['aria-label'] === '送出查詢').props.disabled, false);
    await act(async () => pending.resolve()); await flush();
    assert.doesNotMatch(f.rendered(), /old.pdf/);
    assert.equal(f.input().props.value, 'Fresh draft');
  } finally { pending.resolve(); await f.unmount(); }
});

test('leaving and remounting the same workspace module restores and saves a draft before debounce', async () => {
  const f = await fixture({ rows: [] });
  try {
    await f.draft('Draft before workspace exit'); await f.remount();
    assert.equal(f.input().props.value, 'Draft before workspace exit');
    await flush(950);
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].p_owner_id, 'account-a');
    assert.equal(f.writes[0].p_items[0].draftMessage, 'Draft before workspace exit');
    await f.account('account-b');
    assert.equal(f.input().props.value, '');
    assert.doesNotMatch(f.rendered(), /Draft before workspace exit/);
  } finally { await f.unmount(); }
});

test('a pending new thread with a random ID remains selected after workspace remount', async () => {
  const f = await fixture();
  try {
    await f.newConversation(); await f.draft('New thread draft'); await f.remount();
    assert.equal(f.input().props.value, 'New thread draft');
    await flush(950);
    const saved = f.writes.at(-1).p_items;
    assert.equal(saved.length, 3);
    assert.ok(saved.find(item => item.draftMessage === 'New thread draft').id !== 'conversation-active-workspace');
  } finally { await f.unmount(); }
});

test('remounted saves remain ordered behind an older save and retain a deletion tombstone', async () => {
  const first = deferred(); let calls = 0, cloud = [];
  const f = await fixture({ rows: [], read: () => ({ data: cloud, error: null }), save: args => {
    const commit = () => { cloud = args.p_items.map(item => ({ conversation_key: item.id, title: item.title, saved_at: item.savedAt, draft_message: item.draftMessage, messages: item.messages, provider: item.provider, model: item.model, key_label: item.keyLabel })); return { data: cloud.length, error: null }; };
    return ++calls === 1 ? first.promise.then(commit) : Promise.resolve(commit());
  } });
  try {
    await f.draft('Deleted during old save'); await flush(950);
    await f.draft(''); await f.remount();
    assert.equal(f.input().props.value, '');
    await flush(950);
    assert.equal(f.writes.length, 1, 'new workspace saves must wait for the old RPC');
    await act(async () => first.resolve()); await flush();
    assert.equal(f.writes.length, 2);
    assert.deepEqual(f.writes.at(-1).p_items, []);
    assert.equal(cloud.length, 0);
    await f.remount();
    assert.equal(f.input().props.value, '');
  } finally { first.resolve(); await f.unmount(); }
});

test('full-page unload warns only while account-owned changes remain pending, including outside the workspace', async () => {
  const f = await fixture({ rows: [] });
  const warning = () => { const event = new Event('beforeunload', { cancelable: true }); f.win.dispatchEvent(event); return event.defaultPrevented; };
  try {
    assert.equal(warning(), false);
    await f.draft('Pending on full-page exit');
    assert.equal(warning(), true);
    await f.unmount();
    assert.equal(warning(), true);
    await f.remount(); await flush(950);
    assert.equal(warning(), false);
  } finally { await f.unmount(); }
});

test('compact chat keeps one send action inside the composer and opens the shared messenger with its unread count', async () => {
  const f = await fixture({ rows: [] });
  try {
    const send = f.root.root.findAll(node => node.type === 'stub' && node.props['aria-label'] === '送出查詢');
    assert.equal(send.length, 1);
    const composer = f.root.root.find(node => node.props['data-mobile-ai-composer'] === 'true');
    assert.equal(composer.findAll(node => node.type === 'stub' && node.props['aria-label'] === '送出查詢').length, 1);
    let opened = 0;
    f.win.addEventListener('open-global-direct-messages', () => opened++);
    await act(async () => f.win.dispatchEvent(new CustomEvent('collaboration-unread-change', { detail: { count: 9, directMessageCount: 3 } })));
    await f.click('開啟聊天室，3 則未讀');
    assert.equal(opened, 1);
  } finally { await f.unmount(); }
});
