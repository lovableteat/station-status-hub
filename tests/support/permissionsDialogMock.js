export const supabase = {
  from(table) {
    let operation = 'read';
    const query = {
      select() {return query;}, eq() {return query;},
      maybeSingle() {return Promise.resolve({data: {permissions: window.auditPermissions.settings},
        error: window.auditPermissions.failRead ? {message: 'Isolated read failure'} : null});},
      delete() {operation = 'delete'; return query;},
      insert() {operation = 'insert'; return query;},
      then(resolve) {return Promise.resolve({data: operation === 'read'
        ? window.auditPermissions.settings.pagePermissions.map(permission => ({permission})) : null,
        error: null}).then(resolve);},
    };
    if (!['system_users', 'user_page_permissions'].includes(table)) throw new Error(`Unexpected fixture table ${table}`);
    return query;
  },
  async rpc(functionName, payload) {
    if (functionName !== 'set_user_access_permissions') throw new Error(`Unexpected fixture RPC ${functionName}`);
    if (window.auditPermissions.failSave) return {data: null, error: {message: 'Isolated save failure'}};
    window.auditPermissions.writes.push({functionName, payload});
    window.auditPermissions.settings = {
      ...window.auditPermissions.settings,
      workspaceAccess: payload.p_workspace_access,
      pagePermissions: payload.p_permissions,
      performanceManager: payload.p_performance_manager,
    };
    return {data: null, error: null};
  },
};
export async function mutateAuthAccount(userId, payload) {
  if (window.auditPermissions.failSave) return {success: false, error: 'Isolated save failure'};
  window.auditPermissions.writes.push({userId, payload});
  if (payload.profile.permissions) window.auditPermissions.settings = payload.profile.permissions;
  return {success: true};
}
