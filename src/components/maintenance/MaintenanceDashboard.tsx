import { useMemo, useState } from 'react';
import { useUser } from '@/components/auth/UserContext';
import { useTestProject } from '@/components/test-projects/TestProjectProvider';
import { Input } from '@/components/ui/input';
import { buildFaultStatistics, writeFaultFilters } from './maintenanceModel';
import { useMaintenanceData } from './useMaintenanceData';
import './maintenance.css';

export function MaintenanceDashboard({ onNavigate }: { onNavigate: (module: string, params?: Record<string, string>) => void }) {
  const { user } = useUser(), { activeProjectId, activeProject } = useTestProject();
  const { data, loading, error } = useMaintenanceData(activeProjectId, user?.userId);
  const [query, setQuery] = useState('');
  const stats = useMemo(() => buildFaultStatistics(data.issues), [data.issues]);
  const navigate = (field: 'machine' | 'category', value: string) => {
    const url = new URL(window.location.href);
    writeFaultFilters(url, { query: '', status: 'all', owner: 'all', category: '', machine: '', [field]: value });
    onNavigate('issues', Object.fromEntries([...url.searchParams].filter(([key]) => key.startsWith('fault') || key === 'issueStatus')));
  };
  return <div className="maintenance-center"><header className="mf-page-head"><div><p className="mf-eyebrow">{activeProject?.name}</p><h1>問題儀表板</h1></div><span className="mf-hint">包含已解決的故障歷史</span></header>
    <div className="mf-filter-bar"><Input aria-label="搜尋統計機台或分類" value={query} placeholder="搜尋機台或分類" onChange={event => setQuery(event.target.value)}/>{query && <div className="mf-chips"><button onClick={() => setQuery('')}>搜尋：{query} ×</button><button onClick={() => setQuery('')}>全部清除</button></div>}</div>
    {error && <p className="mf-error" role="alert">{error}</p>}
    {stats.unidentified > 0 && <p className="mf-hint"><button onClick={() => navigate('machine', '未記錄機台')}>{stats.unidentified} 筆舊故障未記錄機台，點此補充；暫不併算成同一台機台。</button></p>}
    <div className="mf-dashboard-grid">{(['machines', 'categories'] as const).map(type => <section className="mf-dashboard-card" key={type}><h2>{type === 'machines' ? '哪些機台反覆出問題' : '常見故障分類'}</h2><table><thead><tr><th>{type === 'machines' ? '機台序號／資產編號' : '目前專案分類'}</th><th>累計故障</th><th>未解決</th></tr></thead><tbody>{loading ? <tr><td colSpan={3}>讀取中…</td></tr> : stats[type].filter(item => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(item => <tr key={item.name}><td><button onClick={() => navigate(type === 'machines' ? 'machine' : 'category', 'key' in item ? String(item.key) : item.name)}>{item.name}</button></td><td>{item.total}</td><td>{item.open}</td></tr>)}{!loading && !stats[type].some(item => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && <tr><td colSpan={3} className="mf-empty">目前篩選條件沒有符合的{type === 'machines' ? '機台' : '分類'}</td></tr>}</tbody></table></section>)}</div>
  </div>;
}
