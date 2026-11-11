import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ClipboardList, Plus, Search, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUser } from '@/components/auth/UserContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useTestProject } from '@/components/test-projects/TestProjectProvider';
import { pushWorkspaceHistory, replaceWorkspaceHistory, WORKSPACE_HISTORY_NAVIGATED } from '@/lib/workspaceHistory';
import { FAULT_STATUSES, assetLabel, faultStatusLabel, filterFaults, getFaultStatus, ownerLabel, ownerNames, plainIssueText, readFaultFilters, writeFaultFilters, type FaultFilters } from './maintenanceModel';
import { useMaintenanceData } from './useMaintenanceData';
import { MaintenanceDetail } from './MaintenanceDetail';
import { MaintenanceReport } from './MaintenanceReport';
import './maintenance.css';
import './maintenanceFaultLayout.css';

export function MaintenanceWorkspace() {
  const { activeProjectId, activeProject } = useTestProject();
  const { user } = useUser();
  const { canEditModule } = usePermissions();
  const { data, loading, error, refresh } = useMaintenanceData(activeProjectId, user?.userId);
  const [filters, setFilters] = useState(() => readFaultFilters(window.location.search));
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get('openIssue'));
  const [reporting, setReporting] = useState(false), [limit, setLimit] = useState(75);
  const [assignmentRequest, setAssignmentRequest] = useState<{ issueId: string }>();
  const canEdit = canEditModule('issues') && !activeProject?.is_archived;
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeProject?.is_archived && !url.searchParams.has('faultStatus') && !url.searchParams.has('issueStatus')) {
      const next = { ...readFaultFilters(url.search), status: 'all' };
      setFilters(next); writeFaultFilters(url, next); replaceWorkspaceHistory(url);
    }
  }, [activeProjectId, activeProject?.is_archived]);
  useEffect(() => {
    const restore = () => { setFilters(readFaultFilters(window.location.search)); setSelectedId(new URLSearchParams(window.location.search).get('openIssue')); };
    window.addEventListener(WORKSPACE_HISTORY_NAVIGATED, restore); return () => window.removeEventListener(WORKSPACE_HISTORY_NAVIGATED, restore);
  }, []);
  const setFilter = (next: FaultFilters) => {
    setFilters(next); setLimit(75);
    const url = new URL(window.location.href); writeFaultFilters(url, next); replaceWorkspaceHistory(url);
  };
  const selectIssue = (id: string | null) => {
    if (id === selectedId) return true;
    if (!window.dispatchEvent(new Event('workspace-before-navigate', { cancelable: true }))) return false;
    setSelectedId(id); const url = new URL(window.location.href);
    if (id) url.searchParams.set('openIssue', id); else url.searchParams.delete('openIssue');
    pushWorkspaceHistory(url);
    return true;
  };
  const filtered = useMemo(() => filterFaults(data.issues, filters, user || undefined), [data.issues, filters, user]);
  const selected = data.issues.find(issue => issue.id === selectedId);
  const ownerOptions = [...data.people.map(person => ({ value: person.id, label: person.name })), ...[...new Set(data.issues.filter(issue => !issue.assignee_user_ids?.length && issue.assigned_to).map(issue => issue.assigned_to!))].map(value => ({ value, label: `${value}（原紀錄）` }))];
  const ownerName = filters.owner === 'me' ? '我負責' : filters.owner === 'unassigned' ? '未分派' : ownerOptions.find(item => item.value === filters.owner)?.label || filters.owner;
  const chips = [
    ...(filters.query ? [{ key: 'query', label: `搜尋：${filters.query}`, clear: '' }] : []),
    ...(filters.status !== 'all' ? [{ key: 'status', label: `狀態：${filters.status === 'unresolved' ? '未解決' : FAULT_STATUSES.find(item => item.value === filters.status)?.label || filters.status}`, clear: 'all' }] : []),
    ...(filters.owner !== 'all' ? [{ key: 'owner', label: `負責人：${ownerName}`, clear: 'all' }] : []),
    ...(filters.category ? [{ key: 'category', label: `分類：${filters.category}`, clear: '' }] : []),
    ...(filters.machine ? [{ key: 'machine', label: `機台：${filters.machine}`, clear: '' }] : []),
  ];
  if (!activeProjectId) return <div className="maintenance-center mf-empty">請先選擇或建立專案，再開始記錄維修問題。</div>;
  return <div className="maintenance-center maintenance-fault-center" data-detail-open={!!selected}>
    <header className="mf-page-head"><div><p className="mf-eyebrow">{activeProject?.name}{activeProject?.is_archived && ' · 已封存，僅供查閱'}</p><h1>故障清單 <span>{data.issues.filter(issue => getFaultStatus(issue) !== 'resolved').length} 件未解決</span></h1></div>{canEdit && <Button onClick={() => setReporting(true)}><Plus size={17}/>快速報修</Button>}</header>
    <div className="mf-layout" data-selected={!!selected}>
      <section className="mf-list-panel" aria-label="故障清單">
        <div className="mf-filter-bar"><label className="mf-search"><Search size={17}/><input aria-label="搜尋機台或故障" value={filters.query} placeholder="搜尋序號、資產編號或故障" onChange={event => setFilter({ ...filters, query: event.target.value })}/>{filters.query && <button aria-label="清除搜尋" onClick={() => setFilter({ ...filters, query: '' })}><X size={15}/></button>}</label>
          <div className="mf-filter-controls"><label className="mf-select"><select aria-label="篩選故障狀態" value={filters.status} onChange={event => setFilter({ ...filters, status: event.target.value })}><option value="unresolved">未解決</option><option value="all">全部狀態</option>{FAULT_STATUSES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><ChevronDown size={14} aria-hidden="true"/></label>
            <label className="mf-select"><select aria-label="篩選負責人" value={filters.owner} onChange={event => setFilter({ ...filters, owner: event.target.value })}><option value="all">全部負責人</option><option value="me">我負責</option><option value="unassigned">未分派</option>{ownerOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><ChevronDown size={14} aria-hidden="true"/></label>
            <label className="mf-select"><select aria-label="篩選故障分類" value={filters.category} onChange={event => setFilter({ ...filters, category: event.target.value })}><option value="">全部分類</option>{[...new Set([...data.categories, '未分類', ...(filters.category ? [filters.category] : [])])].map(value => <option key={value} value={value}>{value}</option>)}</select><ChevronDown size={14} aria-hidden="true"/></label>
            <button className="mf-mine" type="button" aria-pressed={filters.owner === 'me'} onClick={() => setFilter({ ...filters, owner: filters.owner === 'me' ? 'all' : 'me' })}>我負責</button>
          </div>
          {!!chips.length && <div className="mf-chips" aria-label="目前篩選條件">{chips.map(chip => <button key={chip.key} onClick={() => setFilter({ ...filters, [chip.key]: chip.clear })}>{chip.label}<X size={13}/><span className="sr-only">清除條件</span></button>)}<button className="mf-clear" onClick={() => setFilter({ query: '', status: 'all', owner: 'all', category: '', machine: '' })}>全部清除</button></div>}
        </div>
        <div className="mf-list-heading"><span>機台／故障 <small>{filtered.length} 件</small></span><span>狀態</span><span>負責人</span><span/></div>
        <div className="mf-result-list">{loading ? <p className="mf-empty" role="status">讀取原有故障紀錄…</p> : error ? <div className="mf-empty mf-error" role="alert">{error}<Button variant="outline" onClick={() => void refresh()}>重新載入</Button></div> : !filtered.length ? <p className="mf-empty">目前篩選條件沒有符合的故障</p> : <>{filtered.slice(0, limit).map(issue => {
          const status = getFaultStatus(issue), owner = ownerLabel(issue, data.people);
          const unassigned = owner === '未分派';
          return <article className="mf-fault-row" data-active={selectedId === issue.id} key={issue.id}>
            <button type="button" className="mf-row-open" aria-current={selectedId === issue.id || undefined} aria-label={`查看 ${assetLabel(issue)} ${issue.title}`} onClick={() => selectIssue(issue.id)}><strong title={assetLabel(issue)}>{assetLabel(issue)}</strong><span className="mf-row-title" title={issue.title}>{issue.title}</span><span className="mf-row-summary">{plainIssueText(issue.summary) || '尚無處理紀錄'}</span></button>
            <span className={`mf-row-status mf-status ${status}`}>{faultStatusLabel(status)}</span>
            {canEdit ? <button type="button" className={`mf-row-owner ${unassigned ? 'unassigned' : ''}`} title={ownerNames(issue, data.people).join('、') || '指派負責人'} aria-label={`${assetLabel(issue)} ${issue.title}：${unassigned ? '指派負責人' : owner}`} onClick={() => { if (selectIssue(issue.id)) setAssignmentRequest({ issueId: issue.id }); }}><UserRound size={13} aria-hidden="true"/><span>{unassigned ? '指派' : owner}</span></button> : <span className="mf-row-owner"><span>{owner}</span></span>}
            <button className="mf-row-arrow" type="button" aria-label={`開啟 ${issue.title}`} onClick={() => selectIssue(issue.id)}><ChevronRight size={19}/></button>
          </article>;
        })}{filtered.length > limit && <Button className="mf-load-more" variant="outline" onClick={() => setLimit(value => value + 75)}>顯示更多（剩 {filtered.length - limit} 件）</Button>}</>}</div>
      </section>
      {selected ? <MaintenanceDetail key={selected.id} issue={selected} data={data} canEdit={canEdit} onBack={() => selectIssue(null)} refresh={refresh} assignmentRequest={assignmentRequest} onAssignmentHandled={() => setAssignmentRequest(undefined)}/> : <section className="mf-detail-placeholder"><ClipboardList size={24} aria-hidden="true"/><h2>選擇故障查看詳情</h2><p>可在這裡查看處理紀錄、照片與交接重點。</p></section>}
    </div>
    {reporting && <MaintenanceReport projectId={activeProjectId} systems={data.systems} assetSuggestions={[...new Set(data.issues.map(assetLabel).filter(value => value !== '未記錄機台'))]} onClose={() => { setReporting(false); void refresh(); }} onCreated={id => { setReporting(false); selectIssue(id); void refresh(); }}/ >}
  </div>;
}
