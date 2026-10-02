import React, {useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, useLocation} from 'react-router-dom';
import {TestProjectProvider, useTestProject} from '../../src/components/test-projects/TestProjectProvider';
import * as historyApi from '../../src/lib/workspaceHistory';
function Probe() {
  const project = useTestProject(), location = useLocation();
  window.auditProject = project;
  window.auditRouterLocation = location.search;
  useEffect(() => {
    window.auditHistory = historyApi;
    window.allowLeave = true;
    window.guardCount = 0;
    const guard = event => { window.guardCount++; if (!window.allowLeave) event.preventDefault(); };
    window.addEventListener('workspace-before-navigate', guard);
    const stop = historyApi.watchWorkspaceHistory(() => {});
    return () => {stop();window.removeEventListener('workspace-before-navigate', guard);};
  }, []);
  return React.createElement('main', null, `${location.search} / ${project.activeProjectId ?? 'loading'}`);
}
window.history.replaceState({...window.history.state, routerMarker:'preserved'}, '');
createRoot(document.getElementById('root')).render(React.createElement(BrowserRouter,null,
  React.createElement(TestProjectProvider,null,React.createElement(Probe))));
