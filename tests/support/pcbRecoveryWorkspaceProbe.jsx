// Transparent hook observer: no replacement state, access or persistence logic.
import { useEffect } from 'react';
import { usePcbWorkspace as useRealWorkspace } from '../../src/components/pcb-designer/hooks/usePcbWorkspace.ts';
import { fixture, RECOVERY_CLIENT_ID } from './pcbRecoveryServices.js';

export function usePcbWorkspace(options) {
  const workspace = useRealWorkspace({ ...options, storage: fixture.storage, recoveryClientId: RECOVERY_CLIENT_ID });
  fixture.api = workspace;
  fixture.clientId = options.clientId;
  fixture.remoteClient = options.remoteClient;
  fixture.state = {
    data: workspace.data, canEdit: workspace.canEdit, canMutate: workspace.canMutate,
    remoteReady: workspace.remoteReady, remoteAccessStatus: workspace.remoteAccessStatus,
    remoteError: workspace.remoteError, hasUnsavedChanges: workspace.hasUnsavedChanges,
    persistenceStatus: workspace.persistenceStatus, projectLockStatus: workspace.projectLock.status,
    projectLockCanEdit: workspace.projectLock.canEdit,
    ownerChanged: workspace.ownerChanged,
  };
  fixture.renders.push({ canEdit: workspace.canEdit, remoteReady: workspace.remoteReady,
    remoteAccessStatus: workspace.remoteAccessStatus, ownerChanged: workspace.ownerChanged });
  useEffect(() => { fixture.mounted++; return () => { fixture.unmounted++; }; }, []);
  return workspace;
}
