import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MaterialRecordDialog, PendingMailDialog } from '../../src/components/material-requests/MaterialRequestPage';
import seed from '../../src/data/materialRequestSeed.json';
import { Button } from '../../src/components/ui/button';
import { Toaster } from '../../src/components/ui/toaster';
import { SupplierDirectoryDialog } from '../../src/components/material-requests/SupplierDirectoryDialog';
import { fixtureState, setFixtureAccount } from './vendorMailMock';
import { RlcPriorityDialog } from '../../src/components/material-requests/RlcPriorityDialog';

window.fetch = async () => { throw new Error('Network requests are disabled in the vendor-mail fixture'); };
const groups = ['A', 'B'].map((suffix, index) => ({
  key: `fixture-${suffix}`, displayRef: `U${index + 1}`, name: `Fixture IC ${suffix}`, qty: 1,
  records: [{ id: `fixture-row-${suffix}`, refDes: `U${index + 1}`, name: `Fixture IC ${suffix}`,
    manufacturer: `Vendor ${suffix}`, manufacturerPartNumber: `FIXTURE-${suffix}`, partSpec: '隔離假資料', partUsageStatus: '' }],
}));
const rlcGroups = [{ key: 'resistor', displayRef: 'R1, R2', name: 'RES 10K 1% 0603 0.1W', qty: 2, records: ['A', 'B'].map(suffix => ({ id: `R-${suffix}`, refDes: 'R1, R2', name: 'RES 10K 1% 0603 0.1W', manufacturer: `Example ${suffix}`, manufacturerPartNumber: `R-10K-${suffix}`, partNumber: `REAL-${suffix}`, virtualAlternative: 'VIRTUAL-R', sourcingStatus: 'Approved', partUsageStatus: '' })) }];

function Fixture() {
  const [open, setOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [rlcOpen, setRlcOpen] = useState(false);
  const [rlcProject, setRlcProject] = useState('project-A');
  const [rules, setRules] = useState([]);
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordMode, setRecordMode] = useState('edit');
  const [record, setRecord] = useState({ ...seed.records[0], id: 'qa-record', refDes: 'R1', refGroup: 'R1', name: 'RES 10K 1% 0603', manufacturer: 'Example A', manufacturerPartNumber: 'R-10K', trackingStatus: '處理中', trackingNote: '原有追蹤', trackingHistory: [] });
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
      <Button variant="outline" onClick={() => setDirectoryOpen(true)}>公司供應商聯絡資料</Button>
      <Button variant="outline" onClick={() => setRlcOpen(true)}>RLC 優先順序驗證</Button>
      <Button variant="outline" onClick={() => setRlcProject(value => value === 'project-A' ? 'project-B' : 'project-A')}>切換專案 {rlcProject}</Button>
      <Button variant="outline" onClick={() => { setRlcProject(null); setRlcOpen(true); }}>未指定專案驗證</Button>
      <Button variant="outline" onClick={() => { setRecordMode('edit'); setRecordOpen(true); }}>料件與追蹤驗證</Button>
      <span aria-live="polite">隔離假資料 · 帳號 {fixtureState.account} · 儲存 {fixtureState.saves} 次 · 匯入 {fixtureState.imports} 次<span className="sr-only">{revision}</span></span>
    </nav>
    <p className="p-3 text-sm text-muted-foreground">只有兩筆假料件與本機記憶體聯絡簿；重新整理會還原初始資料，不會連線正式環境或寄信。</p>
    <PendingMailDialog groups={groups} open={open} onOpenChange={setOpen} workspaceName="隔離測試 BOM" exportedBy="隔離測試使用者" />
    <SupplierDirectoryDialog open={directoryOpen} onOpenChange={setDirectoryOpen} />
    <RlcPriorityDialog key={rlcProject} open={rlcOpen} onOpenChange={setRlcOpen} projectId={rlcProject} projectName={rlcProject === 'project-A' ? 'VERA_GPU' : rlcProject === 'project-B' ? 'VERA_CPU' : ''} workspaceName="示範 BOM（不連線正式資料）" projects={[{id:'project-A',name:'VERA_GPU'},{id:'project-B',name:'VERA_CPU'}]} onAssignProject={async id => setRlcProject(id)} groups={rlcGroups} rules={rules} canEdit={fixtureState.account === 'A'} onSaveRule={async rule => setRules(current => [...current.filter(item => item.projectId !== rule.projectId || item.specKey !== rule.specKey || item.candidateKey !== rule.candidateKey), { ...rule, updatedAt: new Date().toISOString() }])} />
    <MaterialRecordDialog canEdit open={recordOpen} mode={recordMode} initialTab="tracking" record={record} workspaceId="fixture" uploaderName="QA" onOpenChange={setRecordOpen} onModeChange={setRecordMode} onOpenSpec={() => {}} onSave={async next => { setRecord(next); setRecordOpen(false); }} />
    <Toaster />
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
