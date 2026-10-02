import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {UserPermissionsDialog} from '../../src/components/admin/UserPermissionsDialog';
import {UserEditDialog} from '../../src/components/admin/UserEditDialog';
import {ALL_PAGE_PERMISSIONS, WORKSPACE_IDS} from '../../src/lib/workspacePermissions';

window.auditPermissions = {
  settings: {workspaceAccess: Object.fromEntries(WORKSPACE_IDS.map(id => [id, 'edit'])),
    pagePermissions: ALL_PAGE_PERMISSIONS, performanceManager: false, unrelatedSetting: 'preserved'},
  writes: [], toasts: [], failSave: false, failRead: false,
  editorUpdates: 0, editorDeletes: [],
};
function Fixture() {
  const [open, setOpen] = useState(false);
  if (location.pathname === '/editor') return <><button id="unrelated-user-trigger">Other user</button>
    <div id="fixture-editor"><UserEditDialog userId="isolated-fixture-user" username="AUDIT_LOCAL"
      displayName="Isolated editor" role="engineer" status="active"
      onUpdate={()=>auditPermissions.editorUpdates++} onDelete={id=>auditPermissions.editorDeletes.push(id)} /></div></>;
  return <><button id="unrelated-user-trigger">Other user</button>
    <button id="fixture-user-trigger" onClick={() => setOpen(true)}>Open fixture</button>
    <UserPermissionsDialog isOpen={open} onClose={() => setOpen(false)}
      userId="isolated-fixture-user" username="AUDIT_LOCAL_權限測試" /></>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
