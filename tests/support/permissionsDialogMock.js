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
};
export async function mutateAuthAccount(userId, payload) {
  if (window.auditPermissions.failSave) return {success: false, error: 'Isolated save failure'};
  window.auditPermissions.writes.push({userId, payload});
  window.auditPermissions.settings = payload.profile.permissions;
  return {success: true};
}
