import { useMemo, useState } from 'react';
import { ChevronRight, Layers3, Search, Server } from 'lucide-react';
import { useUser } from '@/components/auth/UserContext';
import { useTestProject } from '@/components/test-projects/TestProjectProvider';
import { buildFaultStatistics, writeFaultFilters } from './maintenanceModel';
import { useMaintenanceData } from './useMaintenanceData';
import './maintenance.css';
import './maintenanceOverviewLayout.css';

const statisticsPanels = [
  { type: 'machines', field: 'machine', title: '機台故障排行', column: '機台序號／資產編號', entity: '機台', Icon: Server },
  { type: 'categories', field: 'category', title: '常見故障分類', column: '故障分類', entity: '分類', Icon: Layers3 },
] as const;

export function MaintenanceDashboard({ onNavigate }: { onNavigate: (module: string, params?: Record<string, string>) => void }) {
  const { user } = useUser();
  const { activeProjectId } = useTestProject();
  const { data, loading, error } = useMaintenanceData(activeProjectId, user?.userId);
  const [query, setQuery] = useState('');
  const stats = useMemo(() => buildFaultStatistics(data.issues), [data.issues]);
  const openCount = stats.categories.reduce((count, item) => count + item.open, 0);
  const searchQuery = query.trim().toLocaleLowerCase();
  const navigate = (field: 'machine' | 'category', value: string) => {
    const url = new URL(window.location.href);
    writeFaultFilters(url, { query: '', status: 'all', owner: 'all', category: '', machine: '', [field]: value });
    onNavigate('issues', Object.fromEntries([...url.searchParams].filter(([key]) => key.startsWith('fault') || key === 'issueStatus')));
  };

  return (
    <div className="maintenance-center mf-overview-page">
      <header className="mf-page-head">
        <div>
          <h1>問題儀表板</h1>
          <p className="mf-hint">目前專案的故障統計，包含已解決紀錄</p>
        </div>
      </header>
      <div className="mf-dashboard-summary" aria-label="專案故障統計">
        <div><span>累計故障</span><strong>{loading || error ? '—' : data.issues.length}</strong></div>
        <div data-tone="open"><span>未解決</span><strong>{loading || error ? '—' : openCount}</strong></div>
        <div data-tone="closed"><span>已解決</span><strong>{loading || error ? '—' : data.issues.length - openCount}</strong></div>
        {stats.unidentified > 0 && !error ? (
          <button type="button" onClick={() => navigate('machine', '未記錄機台')} title="查看未記錄機台的故障">
            <span>未記錄機台</span><strong>{stats.unidentified}</strong><ChevronRight size={16} aria-hidden="true"/>
          </button>
        ) : (
          <div><span>未記錄機台</span><strong>{loading || error ? '—' : stats.unidentified}</strong></div>
        )}
      </div>
      {error && <p className="mf-error" role="alert">{error}</p>}
      <div className="mf-filter-bar mf-overview-filter">
        <div className="mf-search">
          <Search size={17} aria-hidden="true"/>
          <input aria-label="搜尋統計機台或分類" value={query} placeholder="搜尋機台或分類" onChange={event => setQuery(event.target.value)}/>
        </div>
        {query && <div className="mf-chips"><button type="button" onClick={() => setQuery('')}>搜尋：{query} ×</button><button type="button" className="mf-clear" onClick={() => setQuery('')}>全部清除</button></div>}
      </div>
      <div className="mf-dashboard-grid">
        {statisticsPanels.map(({ type, field, title, column, entity, Icon }) => {
          const rows = stats[type].filter(item => item.name.toLocaleLowerCase().includes(searchQuery));
          return (
            <section className="mf-dashboard-card" key={type}>
              <h2><Icon size={18} aria-hidden="true"/>{title}</h2>
              <table>
                <thead><tr><th scope="col">{column}</th><th scope="col">累計故障</th><th scope="col">未解決</th></tr></thead>
                <tbody>
                  {rows.map(item => (
                    <tr key={item.name}>
                      <td>
                        <button type="button" className="mf-stat-drilldown" onClick={() => navigate(field, 'key' in item ? String(item.key) : item.name)}>
                          <span>{item.name}</span><ChevronRight size={15} aria-hidden="true"/>
                        </button>
                      </td>
                      <td>{item.total}</td>
                      <td><span className="mf-open-count" data-open={item.open > 0}>{item.open}</span></td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={3} className="mf-empty">{loading ? '讀取中…' : `目前篩選條件沒有符合的${entity}`}</td></tr>}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
    </div>
  );
}
