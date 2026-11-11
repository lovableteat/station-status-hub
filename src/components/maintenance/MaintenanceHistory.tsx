import { useEffect, useId, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { ChevronDown, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { useTestProject } from '@/components/test-projects/TestProjectProvider';
import { MaintenanceLoading } from './MaintenanceFeedback';
import { maintenanceError } from './useMaintenanceData';
import './maintenance.css';
import './maintenanceOverviewLayout.css';

type HistorySystem = Tables<'test_systems'>;
type HistoryProgress = Tables<'test_progress'> & { station?: { station_name: string } | null; item?: { item_name: string } | null };
const MACHINE_FIELDS = { model:'型號', cabinet:'機櫃', team:'團隊', current_station:'原站點', overall_progress:'原進度（%）', bmc_address:'BMC 位址', old_bmc_address:'原 BMC 位址', os_mac_address:'OS MAC', ubuntu_version:'Ubuntu 版本', cuda_version:'CUDA 版本', bom_90:'BOM 90', actual_started_at:'原開始時間', actual_completed_at:'原完成時間' } as const;
const historyDate = (value: string | null) => value ? new Date(value).toLocaleString('zh-TW') : '未記錄';

function HistorySystemRow({ system, entries }: { system: HistorySystem; entries: HistoryProgress[] }) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const actionLabel = expanded ? '收合紀錄' : '查看紀錄';
  return (
    <>
      <tr className="mf-history-row" data-expanded={expanded}>
        <th scope="row">
          <strong>{system.system_name}</strong>
          {system.serial_number && <small>{system.serial_number}</small>}
          <small className="mf-history-mobile-engineer">{system.assigned_engineer || '未指定工程師'}</small>
        </th>
        <td><span className="mf-history-status" title={system.status || undefined}>{system.status || '未記錄'}</span></td>
        <td className="mf-history-engineer">{system.assigned_engineer || '未指定'}</td>
        <td>
          <button type="button" className="mf-history-toggle" aria-label={`${actionLabel}（機台與 ${entries.length} 筆測試紀錄）`} aria-expanded={expanded} aria-controls={expanded ? detailId : undefined} onClick={() => setExpanded(!expanded)}>
            <span className="mf-history-toggle-copy">
              <span>{actionLabel}</span><small>{entries.length} 筆</small>
            </span><ChevronDown size={16} aria-hidden="true"/>
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="mf-history-expanded">
          <td colSpan={4}>
            <div id={detailId} className="mf-history-detail">
              <h2>原機台資料</h2>
              <dl className="mf-archive-fields">{Object.entries(MACHINE_FIELDS).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{String(system[key as keyof typeof MACHINE_FIELDS] ?? '未記錄')}</dd></div>)}</dl>
              {entries.length > 0 && (
                <div className="mf-history-tests">
                  <h2>原測試紀錄</h2>
                  {entries.map(item => (
                    <section key={item.id}>
                      <div className="mf-history-test-head">
                        <h3>{item.station?.station_name || '原站點'} ／ {item.item?.item_name || '原測試項目'}</h3>
                        <span>{item.status} · {item.progress_percent ?? 0}%</span>
                      </div>
                      <dl className="mf-archive-fields">
                        <div><dt>原開始時間</dt><dd>{historyDate(item.started_at)}</dd></div>
                        <div><dt>原完成時間</dt><dd>{historyDate(item.completed_at)}</dd></div>
                        <div><dt>原工時</dt><dd>{item.actual_hours ?? '未記錄'}</dd></div>
                        <div><dt>負責人</dt><dd>{item.assigned_to || '未指定'}</dd></div>
                      </dl>
                      {item.notes && <div className="mf-rich-text" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.notes) }}/>}
                    </section>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function MaintenanceHistory() {
  const { activeProjectId } = useTestProject();
  const [systems, setSystems] = useState<HistorySystem[]>([]), [progress, setProgress] = useState<HistoryProgress[]>([]);
  const [query, setQuery] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    setSystems([]); setProgress([]); setError(''); setLoading(true);
    const load = async () => {
      try {
        if (!activeProjectId) return;
        const systems: Tables<'test_systems'>[] = [], progress: HistoryProgress[] = [];
        for (let offset = 0; ; offset += 1000) {
          const result = await supabase.from('test_systems').select('*').eq('project_id', activeProjectId).order('id').range(offset, offset + 999);
          if (result.error) throw result.error; systems.push(...result.data); if (result.data.length < 1000) break;
        }
        for (let offset = 0; ; offset += 1000) {
          const result = await supabase.from('test_progress').select('*,station:test_flow_stations(station_name),item:test_flow_items(item_name)').eq('project_id', activeProjectId).order('id').range(offset, offset + 999);
          if (result.error) throw result.error; progress.push(...result.data); if (result.data.length < 1000) break;
        }
        if (current) { setSystems(systems); setProgress(progress); }
      } catch (cause) { if (current) setError(maintenanceError(cause)); }
      finally { if (current) setLoading(false); }
    };
    void load(); return () => { current = false; };
  }, [activeProjectId]);
  const progressBySystem = useMemo(() => {
    const groups = new Map<HistoryProgress['system_id'], HistoryProgress[]>();
    for (const item of progress) {
      const entries = groups.get(item.system_id);
      if (entries) entries.push(item);
      else groups.set(item.system_id, [item]);
    }
    return groups;
  }, [progress]);
  const searchQuery = query.trim().toLocaleLowerCase();
  const visible = systems.filter(system => `${system.system_name} ${system.serial_number || ''} ${system.assigned_engineer || ''}`.toLocaleLowerCase().includes(searchQuery));

  return (
    <div className="maintenance-center mf-overview-page">
      <header className="mf-page-head">
        <div><h1>舊測試紀錄</h1><p className="mf-hint">查閱原機台資料、測試進度與時間紀錄</p></div>
        <span className="mf-history-readonly">唯讀</span>
      </header>
      {error && <p className="mf-error" role="alert">{error}</p>}
      <div className="mf-filter-bar mf-overview-filter">
        <div className="mf-history-search">
          <div className="mf-search">
            <Search size={17} aria-hidden="true"/>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋原機台、序號或工程師" aria-label="搜尋舊機台紀錄"/>
          </div>
          {!loading && !error && <span className="mf-history-count" aria-live="polite">{visible.length} 台機台</span>}
        </div>
        {query && <div className="mf-chips"><button type="button" onClick={() => setQuery('')}>搜尋：{query} ×</button><button type="button" className="mf-clear" onClick={() => setQuery('')}>全部清除</button></div>}
      </div>
      <div className="mf-archive mf-history-table">
        <table>
          <thead><tr><th scope="col">機台／序號</th><th scope="col">原狀態</th><th scope="col" className="mf-history-engineer">原工程師</th><th scope="col">歷史資料</th></tr></thead>
          <tbody className={loading ? undefined : 'mf-results-ready'}>
            {visible.map(system => <HistorySystemRow key={system.id} system={system} entries={progressBySystem.get(system.id) ?? []}/>)}
            {!visible.length && (
              <tr><td colSpan={4} className="mf-history-empty">
                {loading ? <MaintenanceLoading label="載入舊測試紀錄中…"/> : error ? '暫時無法顯示紀錄' : '目前篩選條件沒有符合的機台'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
