import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PendingMailDialog } from '../../src/components/material-requests/MaterialRequestPage';
import { Button } from '../../src/components/ui/button';
import { Toaster } from '../../src/components/ui/toaster';
import { fixtureState, setFixtureAccount } from './vendorMailMock';

window.fetch = async () => { throw new Error('Network requests are disabled in the vendor-mail fixture'); };
const groups = ['A', 'B'].map((suffix, index) => ({
  key: `fixture-${suffix}`, displayRef: `U${index + 1}`, name: `Fixture IC ${suffix}`, qty: 1,
  records: [{ id: `fixture-row-${suffix}`, refDes: `U${index + 1}`, name: `Fixture IC ${suffix}`,
    manufacturer: `Vendor ${suffix}`, manufacturerPartNumber: `FIXTURE-${suffix}`, partSpec: '隔離假資料', partUsageStatus: '' }],
}));

function Fixture() {
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const update = () => setRevision(value => value + 1);
    window.addEventListener('vendor-mail-qa-state', update);
    return () => window.removeEventListener('vendor-mail-qa-state', update);
  }, []);
  return <div style={{ height: '100dvh' }} className="flex min-h-0 flex-col bg-background text-foreground">
    <nav aria-label="隔離測試控制" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-2 text-xs">
      <Button variant="outline" onClick={() => setFixtureAccount('A')}>測試帳號 A</Button>
      <Button variant="outline" onClick={() => setFixtureAccount('B')}>測試帳號 B</Button>
      <Button variant="outline" onClick={() => setOpen(value => !value)}>{open ? '關閉信件視窗' : '重開信件視窗'}</Button>
      <span aria-live="polite">隔離假資料 · 帳號 {fixtureState.account} · 儲存 {fixtureState.saves} 次 · 匯入 {fixtureState.imports} 次<span className="sr-only">{revision}</span></span>
    </nav>
    <p className="p-3 text-sm text-muted-foreground">只有兩筆假料件與本機記憶體聯絡簿；重新整理會還原初始資料，不會連線正式環境或寄信。</p>
    <PendingMailDialog groups={groups} open={open} onOpenChange={setOpen} workspaceName="隔離測試 BOM" exportedBy="隔離測試使用者" />
    <Toaster />
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
