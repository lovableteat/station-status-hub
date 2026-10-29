import React from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { Toaster } from '../../src/components/ui/toaster';
import { MaterialRequestPage } from '../../src/components/material-requests/MaterialRequestPage';
import { setQaMaterialAccount } from './materialWorkspaceMock';

window.fetch = async () => { throw new Error('Production/network requests are disabled in this fixture'); };
createRoot(document.getElementById('root')).render(<TooltipProvider><div className="min-h-screen bg-background text-foreground"><div className="flex gap-4 border-b border-border px-4 py-2 text-xs text-muted-foreground"><span>料號工作區隔離驗證 · 全部為 QA 假資料</span><button onClick={() => setQaMaterialAccount('edit')}>QA 帳號 A</button><button onClick={() => setQaMaterialAccount('view', true)}>QA 帳號 B（檢視）</button><button onClick={() => setQaMaterialAccount('none', true)}>QA 停用權限</button></div><MaterialRequestPage /></div><Toaster /></TooltipProvider>);
