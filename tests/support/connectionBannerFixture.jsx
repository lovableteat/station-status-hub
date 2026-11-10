import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectionBanner } from 'virtual:qa-connection-banner';
import '../../src/index.css';

const long = new URLSearchParams(location.search).has('long');
function Fixture() {
  const [open, setOpen] = useState(true);
  const compact = innerWidth < 1024;
  const result = {
    status: 'error', title: '資料查詢失敗',
    message: '目前 API Key 所屬專案尚未開通「gpt-6.1-sol」。請在 OpenAI 平台確認模型權限，或到「API 管理」改用已開通的 Key。',
    endpoint: 'https://api.openai.com/v1/chat/completions' + (long ? '/' + 'endpoint'.repeat(45) : ''),
    provider: 'openai', model: long ? 'gpt-6.1-sol-' + 'model'.repeat(45) : 'gpt-6.1-sol', durationMs: 962,
  };
  return <main className="app-shell bg-background text-foreground" style={{ minHeight: '100vh', padding: compact ? '12px 0' : 16 }}>
    <section data-ai-chat-shell="viewport-fit" className="ai-conversation-panel" style={{ width: '100%', minWidth: 0 }}>
      {open && <ConnectionBanner result={result} compact={compact} onDismiss={() => setOpen(false)} />}
      <p style={{ margin: 16 }}>對話內容保留在狀態框下方</p>
    </section>
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
