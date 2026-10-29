import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { ApiChatConsole } from '../../src/components/api-management/ApiChatConsole';
import { Button } from '../../src/components/ui/button';
import { MobileWorkspaceDock } from '../../src/components/layout/MobileWorkspaceDock';
import { DirectMessageLauncher } from '../../src/components/collaboration/CollaborationCenter';
import { fixtureState, setFixtureAccount } from './aiWorkspaceMock';

// The provider is isolated below the real chat/recovery/telemetry code.
window.fetch = async (url) => {
  if (!String(url).startsWith('https://fixture.invalid/')) throw new Error('Only fixture provider requests are allowed');
  await new Promise(resolve => setTimeout(resolve, 1600));
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '隔離測試回覆：這段內容只屬於送出時的對話。' }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const record = { id: 'qa-key', key_name: '隔離測試 Gemini', api_key: 'fixture-only-key', permissions: { metadata: { provider: 'gemini', model: 'gemini-2.5-flash', baseUrl: 'https://fixture.invalid/v1beta' } }, is_active: true };
const targets = ['gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'].map(model => ({ id: `qa-key::${model}`, model, record }));
function Fixture() {
  const mobilePreview = new URLSearchParams(location.search).has('mobile');
  const [targetId, setTargetId] = useState(targets[0].id);
  const [revision, setRevision] = useState(0);
  const [workspaceVisible, setWorkspaceVisible] = useState(true);
  const [messengerOpens, setMessengerOpens] = useState(0);
  const selected = targets.find(target => target.id === targetId);
  useEffect(() => { const update = () => setRevision(value => value + 1); window.addEventListener('ai-qa-state', update); return () => window.removeEventListener('ai-qa-state', update); }, []);
  useEffect(() => { const open = () => setMessengerOpens(value => value + 1); const unread = () => window.dispatchEvent(new CustomEvent('collaboration-unread-change', { detail: { count: 3, directMessageCount: 3 } })); window.addEventListener('open-global-direct-messages', open); window.addEventListener('collaboration-unread-request', unread); unread(); return () => { window.removeEventListener('open-global-direct-messages', open); window.removeEventListener('collaboration-unread-request', unread); }; }, []);
  return <div style={{ height: '100dvh', paddingBottom: mobilePreview ? 'var(--mobile-shell-bottom)' : 0 }} className="flex min-h-0 flex-col bg-background text-foreground">
    {mobilePreview && <header className="flex h-14 shrink-0 items-center border-b border-border px-4 font-bold">工作平台 <span className="ml-auto text-xs font-normal text-muted-foreground">隔離驗證</span></header>}
    <nav aria-label="隔離測試控制" className={mobilePreview ? 'hidden' : 'flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-2 text-xs'}>
      <Button variant="outline" onClick={() => setFixtureAccount('A')}>測試帳號 A</Button>
      <Button variant="outline" onClick={() => setFixtureAccount('B')}>測試帳號 B</Button>
      <Button variant="outline" onClick={() => { fixtureState.failNextSave = true; }}>模擬儲存失敗</Button>
      <Button variant="outline" onClick={() => setWorkspaceVisible(value => !value)}>{workspaceVisible ? '離開 AI 工作區' : '返回 AI 工作區'}</Button>
      <span aria-live="polite">隔離資料 · 儲存 {fixtureState.writes.length} 次 · 假 AI {fixtureState.attempts} 次 <span className="sr-only">{revision}</span></span>
    </nav>
    <div className="min-h-0 flex-1 p-2">{workspaceVisible ? <ApiChatConsole mode="chat-only" selectedApiKey={record} selectedModel={selected.model} selectedApiKeyTargetId={targetId} onSelectApiKeyTarget={setTargetId} availableApiKeys={[record]} availableApiKeyTargets={targets} /> : <p>已離開隔離 AI 工作區；返回可確認待儲存草稿。</p>}</div>
    {mobilePreview && <><div className="fixed bottom-[calc(var(--mobile-shell-bottom)+0.5rem)] right-2 z-40"><DirectMessageLauncher unreadCount={3} onOpen={() => setMessengerOpens(value => value + 1)} /></div><MobileWorkspaceDock activeItem="ai-chat" availableItems={[{id:'workspace-home',label:'首頁'},{id:'station-status',label:'維修'},{id:'material-requests',label:'料號'},{id:'ai-chat',label:'AI 問答'}]} onSelect={() => {}} /><output className="sr-only" aria-label="聊天室開啟次數">{messengerOpens}</output></>}
    <Toaster />
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
