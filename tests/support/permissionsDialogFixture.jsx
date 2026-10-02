import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {UserPermissionsDialog} from '../../src/components/admin/UserPermissionsDialog';
import {ALL_PAGE_PERMISSIONS, WORKSPACE_IDS} from '../../src/lib/workspacePermissions';

window.auditPermissions = {
  settings: {workspaceAccess: Object.fromEntries(WORKSPACE_IDS.map(id => [id, 'edit'])),
    pagePermissions: ALL_PAGE_PERMISSIONS, performanceManager: false, unrelatedSetting: 'preserved'},
  writes: [], toasts: [], failSave: false, failRead: false,
};
function Fixture() {
  const [open, setOpen] = useState(false);
  return <><button id="unrelated-user-trigger">Other user</button>
    <button id="fixture-user-trigger" onClick={() => setOpen(true)}>Open fixture</button>
    <UserPermissionsDialog isOpen={open} onClose={() => setOpen(false)}
      userId="isolated-fixture-user" username="AUDIT_LOCAL_權限測試" /></>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
