import React from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { ApiChatConsole } from '../../src/components/api-management/ApiChatConsole';
import '../../src/index.css';
const record = { id: 'qa-key', key_name: '隔離驗證 AI', api_key: 'synthetic-key', is_active: true, permissions: { read: true, metadata: { provider: 'openai', model: 'gpt-5.4', baseUrl: 'https://provider.invalid/v1' } } };
createRoot(document.getElementById('root')).render(<TooltipProvider><div style={{ height: '100dvh' }} className="bg-background text-foreground"><ApiChatConsole mode="chat-only" materialSpecsAllowed siteKnowledgeModules={['material-requests', 'test-plan', 'data-center', 'performance']} selectedApiKey={record} selectedModel="gpt-5.4" selectedApiKeyTargetId="qa-key::gpt-5.4" availableApiKeys={[record]} availableApiKeyTargets={[{ id: 'qa-key::gpt-5.4', record, model: 'gpt-5.4' }]} /></div></TooltipProvider>);
