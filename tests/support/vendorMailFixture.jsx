import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MaterialRecordDialog, PendingMailDialog, PendingMaterialsDialog, VirtualAlternativeValue } from '../../src/components/material-requests/MaterialRequestPage';
import { buildMaterialDataset } from '../../src/components/material-requests/materialRequestUtils';
import seed from '../../src/data/materialRequestSeed.json';
import { Button } from '../../src/components/ui/button';
import { Toaster } from '../../src/components/ui/toaster';
import { SupplierDirectoryDialog } from '../../src/components/material-requests/SupplierDirectoryDialog';
import { fixtureState, setFixtureAccount } from './vendorMailMock';
import { RlcPriorityDialog } from '../../src/components/material-requests/RlcPriorityDialog';
import { MaterialNonPvlDialog } from '../../src/components/material-requests/MaterialNonPvlDialog';
import { exportNonPvlApplyList } from '../../src/components/material-requests/materialRequestExport';
import ComparisonWorkspace from '../../src/components/comparison/ComparisonWorkspace';

window.fetch = async () => { throw new Error('Network requests are disabled in the vendor-mail fixture'); };
const groups = ['A', 'B'].map((suffix, index) => ({
  key: `fixture-${suffix}`, displayRef: `U${index + 1}`, name: `Fixture IC ${suffix}`, qty: 1,
  records: [{ id: `fixture-row-${suffix}`, refDes: `U${index + 1}`, name: `Fixture IC ${suffix}`,
    manufacturer: `Vendor ${suffix}`, manufacturerPartNumber: `FIXTURE-${suffix}`, partSpec: '隔離假資料', partUsageStatus: '' }],
}));
const rlcGroups = [{ key: 'resistor', displayRef: 'R1, R2', name: 'RES 10K 1% 0603 0.1W', qty: 2, records: ['A', 'B'].map(suffix => ({ id: `R-${suffix}`, refDes: 'R1, R2', name: 'RES 10K 1% 0603 0.1W', manufacturer: `Example ${suffix}`, manufacturerPartNumber: `R-10K-${suffix}`, partNumber: `REAL-${suffix}`, virtualAlternative: 'VIRTUAL-R', sourcingStatus: 'Approved', partUsageStatus: '' })) }];
const pendingRecords = ['J1', 'U1', 'U2', 'R1', 'R2', 'ME'].map((refDes, index) => ({ ...seed.records[0], id: 'pending-' + index, sourceGroupKey: 'pending-' + index, isGroupStart: true, refDes, refGroup: refDes, name: '高度驗證料件 ' + refDes, qty: 1, manufacturer: 'Example ' + index, manufacturerPartNumber: 'SAMPLE-' + index, partNumber: '', virtualAlternative: '', trackingStatus: ['已完成', '處理中', '新增追蹤'][index % 3], trackingHistory: [] }));
const pendingDataset = buildMaterialDataset({ ...seed, records: pendingRecords, recordCount: pendingRecords.length });

function Fixture() {
  const [open, setOpen] = useState(false);
  const [nonPvlOpen, setNonPvlOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [rlcOpen, setRlcOpen] = useState(false);
  const [rlcProject, setRlcProject] = useState('project-A');
  const [rules, setRules] = useState([]);
  const [recordOpen, setRecordOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [markedGroups, setMarkedGroups] = useState(() => { try { return JSON.parse(localStorage.getItem('qa-pending-marked-groups') || '[]'); } catch { return []; } });
  const [recordMode, setRecordMode] = useState('edit');
  const [copiedVirtual, setCopiedVirtual] = useState('');
  const [record, setRecord] = useState({ ...seed.records[0], id: 'qa-record', refDes: 'R1', refGroup: 'R1', name: 'RES 10K 1% 0603', manufacturer: 'Example A', manufacturerPartNumber: 'R-10K', trackingStatus: '處理中', trackingNote: '原有追蹤', trackingHistory: [{ id: 'qa-start', status: '新增追蹤', createdAt: '2026-10-26T02:00:00Z', createdBy: 'CE', note: '建立申請紀錄' }, { id: 'qa-progress', status: '處理中', createdAt: '2026-10-27T02:13:40Z', createdBy: 'QA', requestInfo: '已發信', note: '等候廠商回覆規格書與建料資料' }] });
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
      <Button variant="outline" onClick={() => setPendingOpen(true)}>待處理列高驗證</Button>
      <Button variant="outline" onClick={() => setNonPvlOpen(true)}>官方格式與退件驗證</Button>
      <Button variant="outline" onClick={() => setComparisonOpen(value => !value)}>AutoCheck 高度驗證</Button>
      <span aria-live="polite">隔離假資料 · 帳號 {fixtureState.account} · 儲存 {fixtureState.saves} 次 · 匯入 {fixtureState.imports} 次<span className="sr-only">{revision}</span></span>
    </nav>
    <p className="p-3 text-sm text-muted-foreground">只有兩筆假料件與本機記憶體聯絡簿；重新整理會還原初始資料，不會連線正式環境或寄信。</p>
    <div className="mx-3 max-w-sm space-y-3 border-y border-border py-3" aria-label="虛擬料號複製驗證"><p className="text-xs text-muted-foreground">虛擬料號</p><VirtualAlternativeValue value="000-VIRTUAL-A" onCopy={value => { void navigator.clipboard.writeText(value).then(() => setCopiedVirtual(value)); }} /><VirtualAlternativeValue value="" onCopy={() => { throw new Error('Empty values must not copy'); }} /><p role="status">{copiedVirtual ? `已複製：${copiedVirtual}` : ''}</p></div>
    <PendingMailDialog groups={groups} open={open} onOpenChange={setOpen} workspaceName="隔離測試 BOM" exportedBy="隔離測試使用者" />
    {comparisonOpen && <div className="min-h-0 flex-1 overflow-auto"><ComparisonWorkspace /></div>}
    <MaterialNonPvlDialog open={nonPvlOpen} onOpenChange={setNonPvlOpen} isExporting={false} rows={['1A20-0000100', '1022-00001ZZ', ''].map((partNumber, index) => ({ refDes: 'R' + index, name: '隔離測試電阻', manufacturer: 'Example', manufacturerPartNumber: 'QA-' + index, partNumber, virtualAlternative: '', partUsageStatus: 'ODM 不建議用料' }))} workspaceName="隔離驗證 BOM" onExportApplyList={parts => { void exportNonPvlApplyList({ partNumbers: parts }); }} onExportDetail={() => {}} />
    <SupplierDirectoryDialog open={directoryOpen} onOpenChange={setDirectoryOpen} />
    <RlcPriorityDialog key={rlcProject} open={rlcOpen} onOpenChange={setRlcOpen} projectId={rlcProject} projectName={rlcProject === 'project-A' ? 'VERA_GPU' : rlcProject === 'project-B' ? 'VERA_CPU' : ''} workspaceName="示範 BOM（不連線正式資料）" projects={[{id:'project-A',name:'VERA_GPU'},{id:'project-B',name:'VERA_CPU'}]} onAssignProject={async id => setRlcProject(id)} groups={rlcGroups} rules={rules} canEdit={fixtureState.account === 'A'} onSaveRule={async rule => setRules(current => [...current.filter(item => item.projectId !== rule.projectId || item.specKey !== rule.specKey || item.candidateKey !== rule.candidateKey), { ...rule, updatedAt: new Date().toISOString() }])} />
    <MaterialRecordDialog canEdit open={recordOpen} mode={recordMode} initialTab="tracking" record={record} workspaceId="fixture" uploaderName="QA" onOpenChange={setRecordOpen} onModeChange={setRecordMode} onOpenSpec={() => {}} onSave={async next => { setRecord(next); setRecordOpen(false); }} />
    <PendingMaterialsDialog canEdit groups={pendingDataset.groups} open={pendingOpen} workspaceName="隔離測試 BOM" exportedBy="QA" onOpenChange={setPendingOpen} onOpenTracking={() => {}} onSetCategory={() => {}} markedGroupKeys={new Set(markedGroups)} onToggleMarked={key => setMarkedGroups(current => { const next = current.includes(key) ? current.filter(item => item !== key) : [...current, key]; localStorage.setItem('qa-pending-marked-groups', JSON.stringify(next)); return next; })} />
    <Toaster />
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
