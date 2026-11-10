import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { useTestProject } from '@/components/test-projects/TestProjectProvider';
import { Input } from '@/components/ui/input';
import { maintenanceError } from './useMaintenanceData';
import './maintenance.css';

type HistoryProgress = Tables<'test_progress'> & { station?: { station_name: string } | null; item?: { item_name: string } | null };
const MACHINE_FIELDS = { model:'型號', cabinet:'機櫃', team:'團隊', current_station:'原站點', overall_progress:'原進度（%）', bmc_address:'BMC 位址', old_bmc_address:'原 BMC 位址', os_mac_address:'OS MAC', ubuntu_version:'Ubuntu 版本', cuda_version:'CUDA 版本', bom_90:'BOM 90', actual_started_at:'原開始時間', actual_completed_at:'原完成時間' } as const;
const historyDate = (value: string | null) => value ? new Date(value).toLocaleString('zh-TW') : '未記錄';
export function MaintenanceHistory() {
  const { activeProjectId } = useTestProject();
  const [systems, setSystems] = useState<Tables<'test_systems'>[]>([]), [progress, setProgress] = useState<HistoryProgress[]>([]);
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
  const visible = systems.filter(system => `${system.system_name} ${system.serial_number || ''} ${system.assigned_engineer || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="maintenance-center"><header className="mf-page-head"><div><h1>舊測試紀錄</h1><p className="mf-hint">原機台、測試進度與時間紀錄保留查閱；新版報修不需操作計時。</p></div></header><div className="mf-filter-bar"><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋原機台、序號或工程師" aria-label="搜尋舊機台紀錄"/>{query && <div className="mf-chips"><button onClick={() => setQuery('')}>搜尋：{query} ×</button><button onClick={() => setQuery('')}>全部清除</button></div>}</div>{error && <p className="mf-error" role="alert">{error}</p>}<div className="mf-archive"><table><thead><tr><th>機台／序號</th><th>原狀態</th><th>原工程師</th><th>歷史資料（唯讀）</th></tr></thead><tbody>{visible.map(system => <tr key={system.id}><td><strong>{system.system_name}</strong><p className="mf-hint">{system.serial_number}</p></td><td>{system.status || '未記錄'}</td><td>{system.assigned_engineer || '未指定'}</td><td><details><summary>查看機台與 {progress.filter(item => item.system_id === system.id).length} 筆測試紀錄</summary><dl className="mf-archive-fields">{Object.entries(MACHINE_FIELDS).map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{String(system[key as keyof typeof MACHINE_FIELDS] ?? "未記錄")}</dd></div>)}</dl>{progress.filter(item => item.system_id === system.id).map(item => <section key={item.id}><p className="mf-hint">{item.station?.station_name || "原站點"} ／ {item.item?.item_name || "原測試項目"} · {item.status} · {item.progress_percent ?? 0}%</p><dl className="mf-archive-fields"><div><dt>原開始時間</dt><dd>{historyDate(item.started_at)}</dd></div><div><dt>原完成時間</dt><dd>{historyDate(item.completed_at)}</dd></div><div><dt>原工時</dt><dd>{item.actual_hours ?? "未記錄"}</dd></div><div><dt>負責人</dt><dd>{item.assigned_to || "未指定"}</dd></div></dl>{item.notes && <div className="mf-rich-text" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.notes) }}/>}</section>)}</details></td></tr>)}{!visible.length && <tr><td colSpan={4}>{loading ? '讀取舊紀錄…' : '目前篩選條件沒有符合的機台'}</td></tr>}</tbody></table></div></div>;
}
