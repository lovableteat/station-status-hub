import '../../src/index.css';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { MaintenanceWorkspace } from '../../src/components/maintenance/MaintenanceWorkspace';
import { MaintenanceDashboard } from '../../src/components/maintenance/MaintenanceDashboard';
import { MaintenanceHistory } from '../../src/components/maintenance/MaintenanceHistory';
import { ProjectScopeBar } from '../../src/components/test-projects/ProjectScopeBar';
import { Sidebar } from '../../src/components/layout/Sidebar';
import { watchWorkspaceHistory } from '../../src/lib/workspaceHistory';
function App() {
  const [module, setModule] = useState('issues');
  useEffect(() => watchWorkspaceHistory(() => {}), []);
  if (new URLSearchParams(location.search).has('qaShell')) return <TooltipProvider><ProjectScopeBar faultMode/><Sidebar activeModule={module} isMobile={innerWidth<1024} onModuleChange={setModule}/><MaintenanceWorkspace/></TooltipProvider>;
  return <TooltipProvider><div style={{maxWidth:1440,margin:'auto',background:'hsl(220 12% 6%)',minHeight:'100vh'}}><header style={{display:'flex',alignItems:'center',gap:14,padding:14,borderBottom:'1px solid hsl(220 9% 22%)'}}><strong>工作平台 · 維修中心</strong><select aria-label="目前專案" value={window.fixtureProject || 'p'} onChange={event => { window.fixtureProject = event.target.value; location.href = `/?project=${event.target.value}&qaUser=${new URLSearchParams(location.search).get('qaUser') || 'A'}`; }}><option value="p">GB300</option><option value="p2">其他專案</option></select></header><nav style={{display:'flex',gap:20,padding:12,fontSize:13}}>{[['issues','故障清單'],['dashboard','問題儀表板'],['test-tracker','舊測試紀錄']].map(([id,label]) => <button key={id} onClick={() => setModule(id)}>{label}</button>)}</nav>{module === 'issues' ? <MaintenanceWorkspace/> : module === 'dashboard' ? <MaintenanceDashboard onNavigate={(module,params) => {const url=new URL(location.href);['faultQuery','faultStatus','faultOwner','faultCategory','faultMachine','issueStatus','openIssue'].forEach(key=>url.searchParams.delete(key));Object.entries(params||{}).forEach(([key,value])=>url.searchParams.set(key,value));history.pushState(null,'',url);setModule(module);}}/> : <MaintenanceHistory/>}</div></TooltipProvider>;
}
window.fixtureProject = new URLSearchParams(location.search).get('project') || 'p';
createRoot(document.getElementById('root')).render(<App/>);
