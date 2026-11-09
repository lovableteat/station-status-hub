import React from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { Toaster } from '../../src/components/ui/toaster';
import { MaterialRequestPage } from '../../src/components/material-requests/MaterialRequestPage';
import { setQaMaterialAccount } from './materialWorkspaceMock';
import '../../src/index.css';

const account = new URLSearchParams(location.search).get('qaUser') || 'A';
setQaMaterialAccount(account === 'view' ? 'view' : 'edit', account !== 'A');
const localFetch = window.fetch.bind(window);
window.fetch = (input,init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (new URL(url,location.href).origin !== location.origin) throw new Error('External production requests are disabled in the circuit fixture');
  return localFetch(input,init);
};
createRoot(document.getElementById('root')).render(<TooltipProvider><div className="min-h-screen bg-background text-foreground"><div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">QA circuit changes · isolated data · {account}</div><MaterialRequestPage /></div><Toaster /></TooltipProvider>);
