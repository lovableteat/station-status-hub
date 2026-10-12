import { useSyncExternalStore } from 'react';

let account = '00000000-0000-4000-8000-000000000001';
const secondAccount = '00000000-0000-4000-8000-000000000002';
const listeners = new Set();
export const fixtureState = { writes: [], attempts: 0, failNextSave: false };
export function setFixtureAccount(next) { account = next === 'B' ? secondAccount : '00000000-0000-4000-8000-000000000001'; listeners.forEach(fn => fn()); }
export function useUser() { return { user: { userId: useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => account) } }; }
const row = (id, title, content) => ({ conversation_key: id, title, saved_at: 1234, draft_message: '', messages: [{ id: `${id}-message`, role: 'user', content, createdAt: 1234 }], provider: 'gemini', model: 'gemini-2.5-flash', key_label: '隔離測試 Gemini' });
const cloud = new Map([
  [account, [row('conversation-active-workspace', '帳號 A 目前對話', '帳號 A 的既有問題'), row('history-a', '帳號 A 歷史對話', '歷史 A 問題')]],
  [secondAccount, [row('conversation-active-workspace', '帳號 B 目前對話', '帳號 B 的既有問題'), row('history-b', '帳號 B 歷史對話', '歷史 B 問題')]],
]);
const prompts = [{ id: 'qa-prompt', name: '附件重點整理', command: '請列出附件的主要重點', description: '文件', created_by: null, created_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z' }];
const notify = () => window.dispatchEvent(new Event('ai-qa-state'));
function query(run) {
  const promise = Promise.resolve().then(run);
  return { abortSignal: () => promise, then: promise.then.bind(promise) };
}
export const supabase = {
  from(table) {
    const filters = {};
    const builder = { select() { return this; }, eq(name, value) { filters[name] = value; return this; }, order() { return this; }, limit() { return this; }, abortSignal() { return this; }, then(resolve, reject) { return Promise.resolve({ data: table === 'ai_workspace_conversations' ? structuredClone(cloud.get(filters.owner_id) ?? []) : table === 'command_library' ? prompts : [], error: null }).then(resolve, reject); } };
    return builder;
  },
  rpc(name, args) {
    return query(() => {
      if (name === 'sync_ai_workspace_conversations') {
        if (args.p_owner_id !== account) return { error: new Error('Fixture account mismatch') };
        if (fixtureState.failNextSave) { fixtureState.failNextSave = false; return { error: new Error('Fixture offline') }; }
        fixtureState.writes.push(structuredClone(args));
        cloud.set(account, args.p_items.map(item => ({ conversation_key: item.id, title: item.title, saved_at: item.savedAt, draft_message: item.draftMessage, messages: item.messages, provider: item.provider, model: item.model, key_label: item.keyLabel })));
        notify();
        return { data: args.p_items.length, error: null };
      }
      if (name === 'start_ai_model_usage_attempt') { fixtureState.attempts++; notify(); }
      if (name === 'get_ai_model_usage_summary') return { data: { generated_at: new Date().toISOString(), tracking_started_at: '2026-10-13T00:00:00Z', targets: ['gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'].map(model => ({ api_key_id: 'qa-key', provider: 'gemini', model, minute_attempts: fixtureState.attempts, pacific_day_attempts: fixtureState.attempts })) }, error: null };
      return { data: null, error: null };
    });
  },
  channel() { return { on() { return this; }, subscribe() { return this; } }; },
  removeChannel() { return Promise.resolve(); },
};
