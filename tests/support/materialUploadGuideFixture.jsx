import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { UploadGuideDialog } from '../../src/components/material-requests/MaterialUploadGuideDialog';
import '../../src/index.css';

window.__guideFixture = { opens: 0, closes: 0 };
function App() {
  const [open, setOpen] = useState(false);
  return <div className="min-h-screen bg-background text-foreground"><p>上傳說明隔離介面驗證</p><button onClick={() => { window.__guideFixture.opens++; setOpen(true); }}>開啟上傳說明</button><UploadGuideDialog open={open} onOpenChange={value => { if (!value) window.__guideFixture.closes++; setOpen(value); }} /></div>;
}
createRoot(document.getElementById('root')).render(<App />);
