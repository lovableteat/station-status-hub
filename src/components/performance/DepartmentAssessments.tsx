import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { privacyDb } from './usePerformancePrivacy';
import { withAssessmentReadDeadline } from './assessmentRefresh.mjs';
import { normalizePerformanceReview, PERFORMANCE_STATUS } from './performanceData.mjs';
import type { PerformanceReview } from './assessmentTypes';
import { ReviewDetail } from './ReviewDetail';

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
export function DepartmentAssessments({ rows, cycle, ready, loading, revealVersion = 0 }: {
  rows: DepartmentAssessmentRow[]; cycle: string; ready: boolean; loading: boolean; revealVersion?: number;
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
  const visible = ready ? rows.filter(row => (!status || (row.locked ? 'locked' : row.status || 'not_started') === status)
    && [row.employee_name,row.username,row.department,row.section,row.reviewer_name].join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) : [];
  const selectedRow = selected ? visible.find(row => row.review_id === selected && !row.locked) : undefined;
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
    <header><h3>部門所有人填寫資料</h3><p className="rd2-hint">包含所屬各課同仁、課長及直屬同仁已儲存的自評、主管評分與回覆。點「查看內容」在本頁展開；尚未儲存的輸入不會顯示。</p></header>
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
      <table><thead><tr><th scope="col">同仁 / 帳號</th><th scope="col">部門 / 課別</th><th scope="col">主管</th><th scope="col">考核狀態</th><th scope="col">主管總分</th><th scope="col">內容</th></tr></thead>
        <tbody>{visible.map(row => <tr key={row.employee_id}>
          <th scope="row">{row.employee_name}<small>{row.username}</small></th><td>{row.department}<small>{row.section || '直屬同仁'}</small></td><td>{row.reviewer_name || '—'}</td>
          <td>{STATUSES[row.locked ? 'locked' : row.status || 'not_started'] || row.status}</td><td>{row.score == null ? '—' : row.score}</td>
          <td>{row.locked ? <span className="rd2-hint">請先解鎖所屬群組</span> : row.review_id ? <Button variant="outline" size="sm" aria-expanded={selected === row.review_id} aria-controls="department-assessment-detail" onClick={() => update({departmentAssessmentReview:selected === row.review_id ? null : row.review_id})}>{selected === row.review_id ? '收合內容' : '查看內容'}</Button> : '尚無已儲存內容'}</td>
        </tr>)}{!visible.length && <tr><td colSpan={6} className="rd2-result-empty">{loading ? '正在讀取部門資料…' : !ready ? '解鎖後即可查看部門資料' : '目前篩選條件沒有符合的同仁'}</td></tr>}</tbody>
      </table>
    </div>
    {selectedRow && <div ref={detailRegion} id="department-assessment-detail" className="rd2-department-assessment-detail" aria-live="polite">
      <header><h3>{selectedRow.employee_name} · 審核實績與回覆</h3><Button variant="outline" onClick={closeDetail}>收合內容</Button></header>
      {busy && <p role="status">正在讀取考核內容…</p>}{error && <p className="rd2-error" role="alert">{error}</p>}
      {!busy && !error && detail && <ReviewDetail review={detail} showManagerAssessment />}
    </div>}
  </section>;
}
