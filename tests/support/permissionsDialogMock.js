function sanitizedProfile(id) {
  return { id, username: 'AUDIT_LOCAL', display_name: 'Isolated profile', role: 'engineer', status: 'active',
    permissions: window.auditPermissions.settings, created_by: null, created_at: '2026-11-12T00:00:00.000Z', updated_at: '2026-11-12T00:00:00.000Z',
    registration_requested_at: null, approved_at: null, approved_by: null, auth_user_id: null, auth_migrated_at: null, last_seen_at: null, avatar_path: null };
}
export const supabase = {
  schema(name) {
    if (name !== 'workspace') throw new Error(`Unexpected fixture schema ${name}`);
    return { rpc(name, args) {
      if (name !== 'list_system_user_profiles' || (args !== undefined && Object.keys(args).length)) throw new Error(`Unexpected fixture profile RPC ${name}`);
      let id;
      const query = { eq(column, value) { if (column !== 'id') throw new Error('Unexpected profile filter'); id = value; return query; },
        maybeSingle() { return Promise.resolve({data: sanitizedProfile(id), error: window.auditPermissions.failRead ? {message: 'Isolated read failure'} : null}); } };
      return query;
    } };
  },
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
    if (table !== 'user_page_permissions') throw new Error(`Unexpected fixture table ${table}`);
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
