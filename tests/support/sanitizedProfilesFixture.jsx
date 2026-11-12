import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PermissionsProvider, usePermissions } from '../../src/hooks/usePermissions';
import { PermissionGuard } from '../../src/components/layout/PermissionGuard';
import { PcbDesignerWorkspace } from '../../src/components/pcb-designer/PcbDesignerWorkspace';
import { AdminPanel } from '../../src/components/admin/AdminPanel';
import { UserPermissionsDialog } from '../../src/components/admin/UserPermissionsDialog';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { fixture, TARGET, SECOND } from './sanitizedProfilesServices.js';

function PermissionProbe() {
  const permissions = usePermissions();
  const [draft, setDraft] = useState('Synthetic unsaved assessment α 🧪 {"partial":');
  fixture.api = permissions;
  fixture.state = { loading: permissions.loading, permissions: permissions.permissions, workspacePermissions: permissions.workspacePermissions,
    isAdmin: permissions.isAdmin, isPerformanceManager: permissions.isPerformanceManager,
    canView: permissions.canViewModule('pcb-designer'), canEdit: permissions.canEditModule('pcb-designer'), canEditUsers: permissions.canEditModule('users') };
  fixture.renders.push(fixture.state);
  useEffect(() => { fixture.mountCount++; return () => { fixture.unmountCount++; }; }, []);
  return <section aria-label="Actual permission hook observer">
    <output data-testid="profile-access" data-loading={String(permissions.loading)} data-view={String(fixture.state.canView)} data-edit={String(fixture.state.canEdit)}>
      {permissions.loading ? 'Reading profile' : fixture.state.canEdit ? 'PCB editing authorized' : fixture.state.canView ? 'PCB view only' : 'PCB access denied'}
    </output>
    <label>Synthetic unsaved editor<textarea data-testid="profile-draft" value={draft} onChange={event => setDraft(event.target.value)} /></label>
  </section>;
}
function DialogHost() {
  const [target, setTarget] = useState(TARGET), [open, setOpen] = useState(true);
  fixture.setTarget = setTarget; fixture.setOpen = setOpen;
  return <><button onClick={() => { setTarget(TARGET); setOpen(true); }}>Open target</button>
    <button onClick={() => setTarget(SECOND)}>Select second target</button>
    <UserPermissionsDialog isOpen={open} onClose={() => setOpen(false)} userId={target} username={target === TARGET ? 'Synthetic Target' : 'Synthetic Second'} /></>;
}
function Fixture() {
  // Index.tsx user-management shell: finite viewport, flex main, admin's own scroll container.
  // Keep the observer outside main so it cannot consume an admin grid/flex slot.
  if (fixture.surface === 'admin') return <TooltipProvider><PermissionsProvider>
    <div className="app-shell flex min-h-[100dvh] min-w-0 flex-col bg-background h-[100dvh] overflow-hidden">
      <header style={{ flexShrink: 0 }}><p className="pcb-synthetic-notice">Synthetic sanitized-profile fixture. No real account data or hosted service.</p><PermissionProbe /></header>
      <main data-mobile-workspace-main="true" className="mobile-workspace-main flex w-full min-w-0 flex-1 flex-col min-h-0 overflow-hidden"><AdminPanel /></main>
    </div>
  </PermissionsProvider></TooltipProvider>;
  return <TooltipProvider><PermissionsProvider><main className={fixture.surface === 'guard' ? 'pcb-synthetic-host' : ''} style={{ minWidth: 0, maxWidth: '100%' }}>
    <p className="pcb-synthetic-notice">Synthetic sanitized-profile fixture. No real account data or hosted service.</p>
    <PermissionProbe />
    {fixture.surface === 'guard' ? <PermissionGuard module="pcb-designer"><PcbDesignerWorkspace /></PermissionGuard> : fixture.surface === 'admin' ? <AdminPanel /> : fixture.surface === 'dialog' ? <DialogHost /> : null}
  </main></PermissionsProvider></TooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
