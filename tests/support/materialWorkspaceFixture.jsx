import React from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { Toaster } from '../../src/components/ui/toaster';
import { MaterialRequestPage } from '../../src/components/material-requests/MaterialRequestPage';

window.fetch = async () => { throw new Error('Production/network requests are disabled in this fixture'); };
createRoot(document.getElementById('root')).render(<TooltipProvider><div className="min-h-screen bg-background text-foreground"><div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">料號工作區隔離驗證 · 全部為 QA 假資料</div><MaterialRequestPage /></div><Toaster /></TooltipProvider>);
