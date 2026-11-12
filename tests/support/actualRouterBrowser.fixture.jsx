// Only synthetic page bodies and inert service providers are substituted. The
// AuthenticatedApplication source (including PreparedRoutes) is bundled as-is.
import '../../src/lib/workspaceHistory'; // Same early listener order as main.tsx.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import AuthenticatedApplication from '../../src/components/auth/AuthenticatedApplication';
import { AppRuntimeBoundary } from '../../src/components/common/AppRuntimeBoundary';
import { ModuleLoadRecovery } from '../../src/components/common/ModuleLoadRecovery';
import { pushWorkspaceHistory, watchWorkspaceHistory } from '../../src/lib/workspaceHistory';

const api = window.actualRouterFixture = {
  mounts: {}, unmounts: {}, guards: [], allowLeave: true,
  observedPopstate: [], acceptedWorkspace: [], historyMode: 'resolve', historyWaits: [],
  loadedModules: [], permissions: [],
};
window.addEventListener('popstate', () => api.observedPopstate.push(location.href));
api.makePage = name => {
  api.loadedModules.push(name);
  return function SyntheticPage() {
    const route = useLocation();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [draft, setDraft] = useState('');
    const [outerSearch, setOuterSearch] = useState(location.search);
    const [workspaceRetry, setWorkspaceRetry] = useState(null);
    useEffect(() => {
      api.mounts[name] = (api.mounts[name] || 0) + 1;
      return () => { api.unmounts[name] = (api.unmounts[name] || 0) + 1; };
    }, []);
    useEffect(() => {
      api.current = { name, pathname: route.pathname, search: route.search, hash: route.hash, draft, outerSearch };
    }, [draft, route, outerSearch]);
    useEffect(() => {
      const guard = event => {
        api.guards.push({ name, draft });
        if (draft && !api.allowLeave) event.preventDefault();
      };
      window.addEventListener('workspace-before-navigate', guard);
      return () => window.removeEventListener('workspace-before-navigate', guard);
    }, [draft]);
    useEffect(() => {
      if (name !== 'Index' || !window.fixtureWatchWorkspace) return;
      api.workspacePush = url => { pushWorkspaceHistory(url); setOuterSearch(location.search); };
      return watchWorkspaceHistory(() => {
        api.acceptedWorkspace.push(location.href);
        setOuterSearch(location.search);
        setWorkspaceRetry(null);
      }, () => {
        if (api.historyMode === 'defer') return new Promise((resolve, reject) => api.historyWaits.push({ resolve, reject }));
        return Promise.resolve();
      }, retry => { setWorkspaceRetry(() => retry); });
    }, []);
    return <main data-page={name}>
      <h1>{name}</h1>
      <label>Actual route synthetic draft<textarea aria-label="Actual route synthetic draft" value={draft} onChange={event => setDraft(event.target.value)} /></label>
      <output data-testid="actual-route">{route.pathname + route.search + route.hash}</output>
      <output data-testid="outer-query">{outerSearch}</output>
      <output data-testid="query-filter">{params.get('filter') || ''}</output>
      <nav>
        <button onClick={() => navigate('/?filter=initial')}>Home route</button>
        <button onClick={() => navigate('/test-tracker?filter=one')}>Tracker route</button>
        <button onClick={() => navigate('/test-tracker?filter=two', { replace: true })}>Replace tracker filter</button>
        <button onClick={() => navigate('/api-management?filter=newest')}>API route</button>
        <button onClick={() => setParams(previous => {
          const next = new URLSearchParams(previous);
          next.set('filter', '中文 & /\\ value');
          return next;
        })}>Change query filter</button>
      </nav>
      {workspaceRetry && <ModuleLoadRecovery onRetry={workspaceRetry} onCancel={() => setWorkspaceRetry(null)} />}
    </main>;
  };
};
createRoot(document.getElementById('root')).render(<AppRuntimeBoundary><AuthenticatedApplication /></AppRuntimeBoundary>);
