import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Archive, Bell, Camera, KeyRound, LogOut, ShieldCheck, UsersRound } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { ApiChatConsole } from '../../src/components/api-management/ApiChatConsole';
import { buildApiKeyModelTargets } from '../../src/components/api-management/apiKeyHelpers';
import { Button } from '../../src/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../../src/components/ui/dialog';
import { MainWorkspaceHeader } from '../../src/components/layout/MainWorkspaceHeader';
import { MobileWorkspaceDock } from '../../src/components/layout/MobileWorkspaceDock';
import { DirectMessageLauncher } from '../../src/components/collaboration/CollaborationCenter';
import { fixtureState, mobileReply, setFixtureAccount } from './aiWorkspaceMock';
import '../../src/index.css';
import '../../src/platform-interaction.css';

// The provider is isolated below the real chat/recovery/telemetry code.
const modelErrorQa = new URLSearchParams(location.search).has('qaModelError');
if (modelErrorQa) window.__aiModelErrorQA = { requests: [], writes: fixtureState.writes, failAttachmentUpload: false };
const localFetch=window.fetch.bind(window);
window.fetch = async (url,init) => {
  const href=typeof url==='string'?url:url instanceof URL?url.href:url.url;
  if(new URL(href,location.href).origin===location.origin)return localFetch(url,init);
  if (!href.startsWith('https://fixture.invalid/')) throw new Error('Only fixture provider requests are allowed');
  await new Promise(resolve => setTimeout(resolve, 1600));
  let text='隔離測試回覆：這段內容只屬於送出時的對話。';
  if(new URLSearchParams(location.search).has('qaContext')) {
    const request=JSON.parse(init.body);
    const complete=JSON.stringify(request).includes('最初指定的料件是 QA-731')&&request.contents.some(message=>message.parts.some(part=>part.inlineData?.mimeType==='application/pdf'));
    text=complete?'驗證通過：本次請求已包含第 1 則資料、先前 PDF 原檔及後續追問。QA-731 額定電流 7.3 A。':'驗證失敗：API 請求遺失上文或 PDF。';
  }
  if (new URLSearchParams(location.search).has('qaMobile')) text = `## 續問驗證完成\n\n${text}\n\n${mobileReply}`;
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const record = { id: 'qa-key', key_name: '隔離測試 Gemini', api_key: 'fixture-only-key', permissions: { metadata: { provider: 'gemini', model: 'gemini-2.5-flash', baseUrl: 'https://fixture.invalid/v1beta' } }, is_active: true };
const targets = ['gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'].map(model => ({ id: `qa-key::${model}`, model, record }));
const openAiRecord = { ...record, id: 'qa-openai', key_name: '隔離測試 OpenAI', permissions: { metadata: { provider: 'openai', model: 'gpt-5.4', baseUrl: 'https://api.openai.com/v1' } } };
const referenceTargets = buildApiKeyModelTargets([openAiRecord], []);
const workspaces = [{id:'workspace-home',label:'首頁'},{id:'station-status',label:'維修'},{id:'material-requests',label:'料號'},{id:'ai-chat',label:'AI 問答'}];
const moreWorkspaces = [
  { id: 'file-uploads', label: '檔案上傳' }, { id: 'comparison', label: '比對系統' }, { id: 'data-center', label: 'Data Center' },
  { id: 'pcb-designer', label: 'PCB Designer' }, { id: 'performance', label: '績效考核' },
];
const moreAccountActions = [
  ['notifications', '通知', Bell], ['online', '線上人員', UsersRound], ['admin-workspace', '後台管理', ShieldCheck],
  ['assessment-backups', '我的自評備份', Archive], ['personal-profile', '編輯大頭貼', Camera],
  ['own-credentials', '帳號與密碼', KeyRound], ['logout', '登出', LogOut],
];
const maintenanceProjects = [{ id: 'qa-project', name: '隔離測試專案' }];
function Fixture() {
  const params = new URLSearchParams(location.search);
  const mobilePreview = params.has('mobile');
  const moreLayout = params.has('qaMoreLayout');
  const modelTargets = params.has('qaMixedModels') ? [...targets, ...referenceTargets] : params.has('qaReference') || modelErrorQa ? referenceTargets : targets;
  const [targetId, setTargetId] = useState(modelTargets[0].id);
  const [revision, setRevision] = useState(0);
  const [workspaceVisible, setWorkspaceVisible] = useState(true);
  const [messengerOpens, setMessengerOpens] = useState(0);
  const [accountOpen, setAccountOpen] = useState(false);
  const [dockWorkspace, setDockWorkspace] = useState('ai-chat');
  const [moreAction, setMoreAction] = useState('');
  const accountActions = moreLayout
    ? moreAccountActions.map(([id, label, Icon]) => ({ id, label, icon: <Icon className="size-4" />, onSelect: () => {
      setMoreAction(id);
      if (id === 'own-credentials') setAccountOpen(true);
    } }))
    : [{ id: 'own-credentials', label: '帳號與密碼', onSelect: () => setAccountOpen(true) }];
  const selected = modelTargets.find(target => target.id === targetId);
  useEffect(() => { const update = () => setRevision(value => value + 1); window.addEventListener('ai-qa-state', update); return () => window.removeEventListener('ai-qa-state', update); }, []);
  useEffect(() => { const open = () => setMessengerOpens(value => value + 1); const unread = () => window.dispatchEvent(new CustomEvent('collaboration-unread-change', { detail: { count: 3, directMessageCount: 3 } })); window.addEventListener('open-global-direct-messages', open); window.addEventListener('collaboration-unread-request', unread); unread(); return () => { window.removeEventListener('open-global-direct-messages', open); window.removeEventListener('collaboration-unread-request', unread); }; }, []);
  return <div data-ai-chat-viewport={mobilePreview ? 'true' : undefined} className="app-shell flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-background text-foreground">
    {mobilePreview && <MainWorkspaceHeader items={workspaces} activeItem="ai-chat" onSelect={() => {}} onLogout={() => {}} userName="測試帳號" userRoleLabel="管理員" showOnlineUsers={false} showNotifications={false} />}
    <nav aria-label="隔離測試控制" className={mobilePreview ? 'hidden' : 'flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-2 text-xs'}>
      <Button variant="outline" onClick={() => setFixtureAccount('A')}>測試帳號 A</Button>
      <Button variant="outline" onClick={() => setFixtureAccount('B')}>測試帳號 B</Button>
      <Button variant="outline" onClick={() => { fixtureState.failNextSave = true; }}>模擬儲存失敗</Button>
      <Button variant="outline" onClick={() => setWorkspaceVisible(value => !value)}>{workspaceVisible ? '離開 AI 工作區' : '返回 AI 工作區'}</Button>
      <span aria-live="polite">隔離資料 · 儲存 {fixtureState.writes.length} 次 · 假 AI {fixtureState.attempts} 次 <span className="sr-only">{revision}</span></span>
    </nav>
    <main data-mobile-workspace-main={mobilePreview ? 'true' : undefined} className="min-h-0 flex-1"><div data-ai-chat-workspace="viewport-fit" className="h-full min-h-0 w-full min-w-0 px-1 py-1 sm:px-3 sm:py-3 lg:px-5 lg:py-4">{workspaceVisible ? <ApiChatConsole mode="chat-only" selectedApiKey={selected.record} selectedModel={selected.model} selectedApiKeyTargetId={targetId} onSelectApiKeyTarget={setTargetId} availableApiKeys={[selected.record]} availableApiKeyTargets={modelTargets} maintenanceProjects={maintenanceProjects} currentMaintenanceProjectId={maintenanceProjects[0].id} materialSpecsAllowed /> : <p>已離開隔離 AI 工作區；返回可確認待儲存草稿。</p>}</div></main>
    <div data-chat-dock="detached" className="pointer-events-none fixed bottom-[calc(var(--mobile-shell-bottom)+0.5rem)] right-2 z-40 w-auto sm:w-[min(480px,calc(100vw-1rem))] lg:bottom-4 lg:right-4"><DirectMessageLauncher unreadCount={3} onOpen={() => setMessengerOpens(value => value + 1)} /></div>
    {mobilePreview && <MobileWorkspaceDock activeItem={dockWorkspace} availableItems={moreLayout ? [...workspaces, ...moreWorkspaces] : workspaces} onSelect={value => { setDockWorkspace(value); if (modelErrorQa) setWorkspaceVisible(value === 'ai-chat'); }} platformActions={dockWorkspace === 'ai-chat' ? accountActions : undefined} />}
    <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
      <DialogContent>
        <DialogTitle>測試帳號設定</DialogTitle>
        <DialogDescription>用於驗證從更多選單開啟帳號設定。</DialogDescription>
        <DialogClose asChild><Button type="button">完成</Button></DialogClose>
      </DialogContent>
    </Dialog>
    <output className="sr-only" aria-label="聊天室開啟次數">{messengerOpens}</output>
    {moreLayout && <output className="sr-only" data-testid="more-selection">{dockWorkspace}/{moreAction}</output>}
    <Toaster theme="dark" />
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
