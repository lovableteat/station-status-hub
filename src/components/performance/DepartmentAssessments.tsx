import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { privacyDb } from './usePerformancePrivacy';
import { withAssessmentReadDeadline } from './assessmentRefresh.mjs';
import { normalizePerformanceReview, PERFORMANCE_STATUS } from './performanceData.mjs';
import type { PerformanceReview } from './assessmentTypes';
import { ReviewDetail } from './ReviewDetail';
import { Download } from 'lucide-react';
import { loadDepartmentExportReviews } from './departmentAssessmentExport.mjs';

export interface DepartmentAssessmentRow {
  employee_id: string;
  employee_name: string;
  username: string;
  department: string;
  section: string;
  reviewer_name: string;
  locked: boolean;
  review_id: string | null;
  status: string | null;
  updated_at: string | null;
  score: number | null;
}
const STATUSES: Record<string, string> = { ...Object.fromEntries(Object.entries(PERFORMANCE_STATUS as Record<string,{label:string}>).map(([key,value]) => [key,value.label])), not_started: '尚未填寫', locked: '需解鎖' };
export function DepartmentAssessments({ rows, cycle, ready, loading, revealVersion = 0, exportRevealVersion = 0 }: {
  rows: DepartmentAssessmentRow[]; cycle: string; ready: boolean; loading: boolean; revealVersion?: number; exportRevealVersion?: number;
}) {
  const [params, setParams] = useSearchParams();
  const search = params.get('departmentAssessmentSearch') || '';
  const requestedStatus = params.get('departmentAssessmentStatus') || '';
  const status = STATUSES[requestedStatus] ? requestedStatus : '';
  const selected = params.get('departmentAssessmentReview');
  const [detail, setDetail] = useState<PerformanceReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const detailRegion = useRef<HTMLDivElement | null>(null);
  const exportRegion = useRef<HTMLDivElement | null>(null);
  const exportRequest = useRef(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [exportError, setExportError] = useState('');
  const visible = ready ? rows.filter(row => (!status || (row.locked ? 'locked' : row.status || 'not_started') === status)
    && [row.employee_name,row.username,row.department,row.section,row.reviewer_name].join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) : [];
  const selectedRow = selected ? visible.find(row => row.review_id === selected && !row.locked) : undefined;
  const exportable = visible.filter(row => !row.locked && row.review_id);
  const exportRows = exportable.filter(row => selection.includes(row.review_id!));
  const accessKey = JSON.stringify([cycle, ready, rows.map(row => [row.review_id, row.locked, row.updated_at])]);
  const exportAccess = useRef(accessKey);
  exportAccess.current = accessKey;
  const eligibleKey = JSON.stringify(exportable.map(row => row.review_id));
  useEffect(() => {
    setSelection(previous => previous.filter(id => exportable.some(row => row.review_id === id)));
  }, [eligibleKey]);
  useEffect(() => {
    if (!exportRevealVersion) return;
    setExportOpen(true);
    if (!exporting) setSelection(exportable.map(row => row.review_id!));
  }, [exportRevealVersion]);
  useEffect(() => {
    if (exportOpen && exportRevealVersion) exportRegion.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [exportOpen, exportRevealVersion]);
  useEffect(() => () => { ++exportRequest.current; }, []);
  const openExport = () => {
    setExportOpen(value => !value);
    if (!exportOpen) setSelection(exportable.map(row => row.review_id!));
  };
  const exportFile = async (format: 'xlsx' | 'html') => {
    if (exporting || loading || !ready || !exportRows.length) return;
    const request = ++exportRequest.current;
    const current = () => request === exportRequest.current && accessKey === exportAccess.current;
    setExporting(true); setExportError(''); setExportMessage(`正在讀取 0 / ${exportRows.length} 人…`);
    try {
      const complete = await loadDepartmentExportReviews(privacyDb, exportRows, cycle, current,
        (done: number, total: number) => { if (current()) setExportMessage(`正在讀取 ${done} / ${total} 人…`); });
      const exporter = await import('./performanceExport');
      if (!current()) throw new Error('資料保護狀態已更新，請重新選擇匯出人員。');
      setExportMessage(`正在建立 ${complete.length} 人的匯出檔案…`);
      if (format === 'xlsx') await exporter.downloadPerformanceExcel(complete, cycle, { canDownload: current });
      else exporter.downloadPerformanceHtml(complete, cycle, { canDownload: current });
      if (current()) setExportMessage(`已匯出 ${complete.length} 人的 ${format === 'xlsx' ? 'Excel' : 'HTML'}，包含實績、分數、整體回覆與工作指示。`);
    } catch {
      if (request === exportRequest.current) {
        setExportMessage('');
        setExportError('匯出未完成，未下載部分資料。請確認所屬群組已解鎖後重新整理，再試一次。');
      }
    } finally { if (request === exportRequest.current) setExporting(false); }
  };
  const revision = selectedRow?.updated_at;
  useEffect(() => {
    if (selected && !selectedRow && !loading) update({departmentAssessmentReview:null});
    else if (selectedRow) detailRegion.current?.scrollIntoView({block:'start',behavior:'instant'});
  }, [selected, selectedRow?.review_id, loading, revealVersion]);
  useEffect(() => {
    const version = ++generation.current;
    setDetail(null); setError('');
    if (!selectedRow || !ready) { setBusy(false); return; }
    setBusy(true);
    void withAssessmentReadDeadline(privacyDb.rpc('get_performance_department_assessment', { p_review_id: selectedRow.review_id, p_cycle_id: cycle }))
      .then(result => {
        if (version !== generation.current) return;
        if (result.error || !result.data) throw new Error('load');
        const review = normalizePerformanceReview(result.data);
        if (review.id !== selectedRow.review_id || review.cycleId !== cycle) throw new Error('mismatch');
        setDetail(review);
      }).catch(() => {
        if (version === generation.current) setError('無法讀取內容，請確認群組已解鎖，或重新整理後再試。');
      }).finally(() => { if (version === generation.current) setBusy(false); });
    return () => { ++generation.current; };
  }, [selectedRow?.review_id, revision, cycle, ready]);
  const update = (values: Record<string,string|null>) => setParams(previous => {
    const next = new URLSearchParams(previous);
    Object.entries(values).forEach(([key,value]) => value ? next.set(key,value) : next.delete(key));
    return next;
  }, {replace:true});
  const closeDetail = () => update({departmentAssessmentReview:null});
  return <section className="rd2-department-assessments" aria-label="部門所有人填寫資料">
    <header className="rd2-assessment-header"><div><h3>部門所有人填寫資料</h3><p className="rd2-hint">包含所屬各課同仁、課長及直屬同仁已儲存的自評、主管評分與回覆。點「查看內容」在本頁展開；尚未儲存的輸入不會顯示。</p></div><Button variant="outline" onClick={openExport} disabled={!ready || loading || exporting} aria-expanded={exportOpen} aria-controls="department-export-tools"><Download />匯出資料</Button></header>
    <div ref={exportRegion} id="department-export-tools" className="rd2-department-export" hidden={!exportOpen} aria-label="部門考核匯出">
      <div><h4>匯出部門考核資料</h4><p className="rd2-hint">勾選下方人員，匯出本期完整 STAR 實績、自評與主管分數、逐項與整體回覆、工作指示、證明連結及附件檔名。尚未儲存或未解鎖的資料無法匯出。</p></div>
      <div className="rd2-actions"><Button onClick={() => void exportFile('xlsx')} disabled={exporting || loading || !ready || !exportRows.length}><Download />{exporting ? '匯出中…' : '匯出 Excel'}</Button><Button variant="outline" onClick={() => void exportFile('html')} disabled={exporting || loading || !ready || !exportRows.length}>匯出 HTML</Button><span>已勾選 {exportRows.length} / {exportable.length} 人</span></div>
      <p className="rd2-hint">僅匯出目前篩選範圍內已勾選的人員；每人各一張 Excel 工作表。</p>
      {exportMessage && <p role="status" className="rd2-hint">{exportMessage}</p>}{exportError && <p role="alert" className="rd2-error">{exportError}</p>}
    </div>
    <div className="rd2-assessment-filters">
      <label>搜尋<Input aria-label="搜尋部門人員" placeholder="姓名、帳號、部門、課別或主管" value={search} onChange={e => update({departmentAssessmentSearch:e.target.value})} /></label>
      <label>考核狀態<select aria-label="部門考核狀態" value={status} onChange={e => update({departmentAssessmentStatus:e.target.value})}><option value="">全部狀態</option>{Object.entries(STATUSES).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </div>
    {(search || status) && <div className="rd2-actions">
      {search && <Button variant="outline" size="sm" onClick={() => update({departmentAssessmentSearch:null})}>搜尋：{search} ×</Button>}
      {status && <Button variant="outline" size="sm" onClick={() => update({departmentAssessmentStatus:null})}>考核狀態：{STATUSES[status]} ×</Button>}
      <Button variant="ghost" size="sm" onClick={() => update({departmentAssessmentSearch:null,departmentAssessmentStatus:null})}>全部清除</Button>
    </div>}
    <p className="rd2-hint" role="status">{loading ? '正在更新部門資料…' : `顯示 ${visible.length} / ${ready ? rows.length : 0} 人`}</p>
    <div className="rd2-assessment-table-scroll" tabIndex={0} role="region" aria-label="部門人員考核資料表，可左右捲動">
      <table><thead><tr>{exportOpen && <th scope="col"><label className="rd2-export-selection"><input type="checkbox" aria-label="勾選目前可匯出的所有人員" checked={!!exportable.length && exportRows.length === exportable.length} disabled={exporting || !exportable.length} onChange={e => setSelection(e.target.checked ? exportable.map(row => row.review_id!) : [])} />全選</label></th>}<th scope="col">同仁 / 帳號</th><th scope="col">部門 / 課別</th><th scope="col">主管</th><th scope="col">考核狀態</th><th scope="col">主管總分</th><th scope="col">內容</th></tr></thead>
        <tbody>{visible.map(row => <tr key={row.employee_id}>
          {exportOpen && <td><label className="rd2-export-selection"><input type="checkbox" aria-label={`匯出 ${row.employee_name}`} checked={!!row.review_id && !row.locked && selection.includes(row.review_id)} disabled={exporting || row.locked || !row.review_id} onChange={e => setSelection(previous => e.target.checked ? [...previous, row.review_id!] : previous.filter(id => id !== row.review_id))} />勾選</label></td>}
          <th scope="row">{row.employee_name}<small>{row.username}</small></th><td>{row.department}<small>{row.section || '直屬同仁'}</small></td><td>{row.reviewer_name || '—'}</td>
          <td>{STATUSES[row.locked ? 'locked' : row.status || 'not_started'] || row.status}</td><td>{row.score == null ? '—' : row.score}</td>
          <td>{row.locked ? <span className="rd2-hint">請先解鎖所屬群組</span> : row.review_id ? <Button variant="outline" size="sm" aria-expanded={selected === row.review_id} aria-controls="department-assessment-detail" onClick={() => update({departmentAssessmentReview:selected === row.review_id ? null : row.review_id})}>{selected === row.review_id ? '收合內容' : '查看內容'}</Button> : '尚無已儲存內容'}</td>
        </tr>)}{!visible.length && <tr><td colSpan={exportOpen ? 7 : 6} className="rd2-result-empty">{loading ? '正在讀取部門資料…' : !ready ? '解鎖後即可查看部門資料' : '目前篩選條件沒有符合的同仁'}</td></tr>}</tbody>
      </table>
    </div>
    {selectedRow && <div ref={detailRegion} id="department-assessment-detail" className="rd2-department-assessment-detail" aria-live="polite">
      <header><h3>{selectedRow.employee_name} · 審核實績與回覆</h3><Button variant="outline" onClick={closeDetail}>收合內容</Button></header>
      {busy && <p role="status">正在讀取考核內容…</p>}{error && <p className="rd2-error" role="alert">{error}</p>}
      {!busy && !error && detail && <ReviewDetail review={detail} showManagerAssessment />}
    </div>}
  </section>;
}
