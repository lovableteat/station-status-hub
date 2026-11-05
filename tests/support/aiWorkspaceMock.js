import { useSyncExternalStore } from 'react';

let account = '00000000-0000-4000-8000-000000000001';
const secondAccount = '00000000-0000-4000-8000-000000000002';
const listeners = new Set();
export const fixtureState = { writes: [], attempts: 0, failNextSave: false };
const contextQa = new URLSearchParams(location.search).has('qaContext');
export const mobileReply = [
  '## 規格比對結果',
  '先核對本體標示與原廠規格，再決定是否可替換。',
  ...Array.from({length: 14}, (_, index) => `- **檢查項目 ${index + 1}**：確認尺寸、阻值、公差與測試條件。`),
  '| 欄位 | 規格 | 查核說明 |\n| --- | --- | --- |\n| 封裝尺寸 | 0402 | 以零件圖面為準 |',
  '### 規格查核結尾',
  '核對完成後可接續提問。',
].join('\n\n');
const historyPdf = '%PDF-1.7\nQA connector 731 rated current 7.3 A\n%%EOF';
const historyPath = `${account}/11111111-1111-4111-8111-111111111111/content`;
const attachmentFiles = new Map([[historyPath,new Blob([historyPdf],{type:'application/pdf'})]]);
export function setFixtureAccount(next) { account = next === 'B' ? secondAccount : '00000000-0000-4000-8000-000000000001'; listeners.forEach(fn => fn()); }
export function useUser() { return { user: { userId: useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => account) } }; }
const row = (id, title, content) => ({ conversation_key: id, title, saved_at: 1234, draft_message: '', messages: [{ id: `${id}-message`, role: 'user', content, createdAt: 1234 }], provider: 'gemini', model: 'gemini-2.5-flash', key_label: '隔離測試 Gemini' });
const cloud = new Map([
  [account, [row('conversation-active-workspace', '帳號 A 目前對話', '帳號 A 的既有問題'), row('history-a', '帳號 A 歷史對話', '歷史 A 問題')]],
  [secondAccount, [row('conversation-active-workspace', '帳號 B 目前對話', '帳號 B 的既有問題'), row('history-b', '帳號 B 歷史對話', '歷史 B 問題')]],
]);
if(contextQa) {
  const saved=row('conversation-active-workspace','PDF 與上文接續驗證','最初指定的料件是 QA-731，額定電流請見 PDF');
  saved.messages[0].attachments=[{id:'qa-pdf',name:'QA-731.pdf',kind:'file',mimeType:'application/pdf',size:historyPdf.length,storagePath:historyPath}];
  for(let i=1;i<40;i++)saved.messages.push({id:`qa-turn-${i}`,role:i%2?'assistant':'user',content:`隔離對話第 ${i} 則`,createdAt:1234+i});
  cloud.set(account,[saved]);
}
if (new URLSearchParams(location.search).has('qaMobile')) {
  const saved = cloud.get(account)[0];
  saved.messages.push({id:'mobile-long-reply',role:'assistant',content:mobileReply,createdAt:1300});
}
const prompts = [{ id: 'qa-prompt', name: '附件重點整理', command: '請列出附件的主要重點', description: '文件', created_by: null, created_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z' }];
const notify = () => window.dispatchEvent(new Event('ai-qa-state'));
function query(run) {
  const promise = Promise.resolve().then(run);
  return { abortSignal: () => promise, then: promise.then.bind(promise) };
}
export const supabase = {
  storage:{from:()=>({
    async upload(path,blob){if(!path.startsWith(`${account}/`))return {error:new Error('wrong owner')};attachmentFiles.set(path,blob);return {error:null};},
    async download(path){return path.startsWith(`${account}/`)&&attachmentFiles.has(path)?{data:attachmentFiles.get(path),error:null}:{data:null,error:new Error('missing private attachment')};},
    async remove(paths){paths.filter(path=>path.startsWith(`${account}/`)).forEach(path=>attachmentFiles.delete(path));return {error:null};},
  })},
  from(table) {
    const filters = {};
    const builder = { select() { return this; }, eq(name, value) { filters[name] = value; return this; }, order() { return this; }, limit() { return this; }, range() { return this; }, abortSignal() { return this; }, then(resolve, reject) { return Promise.resolve({ data: table === 'ai_workspace_conversations' ? structuredClone(cloud.get(filters.owner_id) ?? []) : table === 'command_library' ? prompts : table === 'material_bom_workspaces' ? [{ id: 'qa-bom', name: '隔離測試 BOM' }] : [], error: null }).then(resolve, reject); } };
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
