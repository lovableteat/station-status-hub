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
if (new URLSearchParams(location.search).has('qaModelError')) {
  cloud.set(account, [{ ...row('conversation-active-workspace', '模型錯誤回復驗證', ''), messages: [], provider: 'openai', model: 'gpt-5.4', key_label: '隔離測試 OpenAI' }]);
}
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
if (new URLSearchParams(location.search).has('qaReference')) {
  const saved = { ...row('conversation-active-workspace', '手機問答版面', 'QA-731 的欄位要怎麼填？'), provider: 'openai', model: 'gpt-5.4', key_label: '隔離測試 OpenAI' };
  const content = [
    '依照測試附件，**QA-731** 的欄位可以先整理成下面的格式。這些數值需要再與正式規格書核對。',
    '---',
    '## 先說結論',
    '**送審前請確認封裝、阻值與額定功率。**',
    '先把附件內的欄位和待確認的數值分開：',
    '| 欄位 | 待確認值 |\n| --- | ---: |\n| Type | RES FILM |\n| 阻值 | 36 |\n| 阻值單位 | Kohm |\n| 瓦特數與尺寸 | 1/8 W · 0402 |',
  ].join('\n\n');
  saved.messages.push({ id: 'mobile-reference-reply', role: 'assistant', content, createdAt: Date.UTC(2026, 10, 6, 10, 12) });
  cloud.set(account, [saved]);
}
const prompts = new URLSearchParams(location.search).has('qaEmptyPrompts') ? [] : [{ id: 'qa-prompt', name: '附件重點整理', command: '請列出附件的主要重點', description: '文件', created_by: null, created_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z' }];
const notify = () => window.dispatchEvent(new Event('ai-qa-state'));
function query(run) {
  const promise = Promise.resolve().then(run);
  return { abortSignal: () => promise, then: promise.then.bind(promise) };
}
export const supabase = {
  functions: { async invoke(name, {body}) {
    if (!new URLSearchParams(location.search).has('qaModelError') || name !== 'openai-proxy') throw new Error('Only isolated OpenAI proxy requests are allowed');
    if (body.operation === 'models') return {data:{data:[{id:'gpt-5.4'},{id:'gpt-6.1-sol'}]},error:null,response:new Response(null,{status:200})};
    const request = body.request;
    window.__aiModelErrorQA.requests.push(structuredClone(request));
    await new Promise(resolve => setTimeout(resolve,100));
    const denied = request.model === 'gpt-6.1-sol';
    const data = denied
      ? { error: { code: 'model_not_found', message: 'The model `gpt-6.1-sol` does not exist or you do not have access to it.' } }
      : { choices: [{ message: { role: 'assistant', content: '1 × 1 = 1（隔離測試成功）' } }] };
    return {data,error:denied?new Error('Fixture model access denied'):null,response:new Response(JSON.stringify(data),{status:denied?403:200,headers:{'Content-Type':'application/json'}})};
  } },
  storage:{from:()=>({
    async upload(path,blob){
      if (new URLSearchParams(location.search).has('qaModelError') && window.__aiModelErrorQA.failAttachmentUpload) return {error:new Error('Fixture attachment upload failed')};
      if(!path.startsWith(`${account}/`))return {error:new Error('wrong owner')};attachmentFiles.set(path,blob);return {error:null};
    },
    async download(path){return path.startsWith(`${account}/`)&&attachmentFiles.has(path)?{data:attachmentFiles.get(path),error:null}:{data:null,error:new Error('missing private attachment')};},
    async remove(paths){paths.filter(path=>path.startsWith(`${account}/`)).forEach(path=>attachmentFiles.delete(path));return {error:null};},
  })},
  from(table) {
    const filters = {};
    const builder = { select() { return this; }, eq(name, value) { filters[name] = value; return this; }, order() { return this; }, limit() { return this; }, range() { return this; }, abortSignal() { return this; }, then(resolve, reject) { return Promise.resolve({ data: table === 'ai_workspace_conversations' ? structuredClone(cloud.get(filters.owner_id) ?? []) : table === 'command_library' ? prompts : table === 'material_bom_workspaces' ? [{ id: 'qa-bom', name: '隔離測試 BOM' }] : [], error: null }).then(resolve, reject); } };
    if (table === 'command_library') {
      builder.insert = payload => ({ select: () => ({ async single() {
        const timestamp = new Date().toISOString();
        const data = { ...payload, id: 'qa-created-prompt', created_at: timestamp, updated_at: timestamp };
        prompts.push(data);
        return { data, error: null };
      } }) });
    }
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
