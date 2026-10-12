import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { ApiChatConsole } from '../../src/components/api-management/ApiChatConsole';
import { Button } from '../../src/components/ui/button';
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
  const [targetId, setTargetId] = useState(targets[0].id);
  const [revision, setRevision] = useState(0);
  const [workspaceVisible, setWorkspaceVisible] = useState(true);
  const selected = targets.find(target => target.id === targetId);
  useEffect(() => { const update = () => setRevision(value => value + 1); window.addEventListener('ai-qa-state', update); return () => window.removeEventListener('ai-qa-state', update); }, []);
  return <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
    <nav aria-label="隔離測試控制" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-2 text-xs">
      <Button variant="outline" onClick={() => setFixtureAccount('A')}>測試帳號 A</Button>
      <Button variant="outline" onClick={() => setFixtureAccount('B')}>測試帳號 B</Button>
      <Button variant="outline" onClick={() => { fixtureState.failNextSave = true; }}>模擬儲存失敗</Button>
      <Button variant="outline" onClick={() => setWorkspaceVisible(value => !value)}>{workspaceVisible ? '離開 AI 工作區' : '返回 AI 工作區'}</Button>
      <span aria-live="polite">隔離資料 · 儲存 {fixtureState.writes.length} 次 · 假 AI {fixtureState.attempts} 次 <span className="sr-only">{revision}</span></span>
    </nav>
    <div className="min-h-0 flex-1 p-2">{workspaceVisible ? <ApiChatConsole mode="chat-only" selectedApiKey={record} selectedModel={selected.model} selectedApiKeyTargetId={targetId} onSelectApiKeyTarget={setTargetId} availableApiKeys={[record]} availableApiKeyTargets={targets} /> : <p>已離開隔離 AI 工作區；返回可確認待儲存草稿。</p>}</div>
    <Toaster />
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
