const assert = require('node:assert/strict');
function profile(id, overrides = {}) {
  return { id, username: 'Synthetic', display_name: null, role: 'engineer', status: 'active', permissions: {},
    created_by: null, created_at: '2026-11-12T00:00:00Z', updated_at: '2026-11-12T00:00:00Z',
    registration_requested_at: null, approved_at: null, approved_by: null, auth_user_id: null,
    auth_migrated_at: null, last_seen_at: null, avatar_path: null, ...overrides };
}
function attachProfileRpc(db, run) {
  db.profileReads = [];
  db.schema = schema => {
    assert.equal(schema, 'workspace');
    return { rpc(name, ...args) {
      assert.equal(name, 'list_system_user_profiles'); assert.deepEqual(args, []);
      const q = { table: name, method: 'rpc', filters: {}, single: false };
      const builder = {
        eq(key, value) { q.filters[key] = value; return builder; },
        order(key, options) { q.order = { key, ...options }; return builder; },
        maybeSingle() { q.single = true; return builder; },
        then(yes, no) { db.profileReads.push(structuredClone(q)); return Promise.resolve().then(() => run(q)).then(yes, no); },
      };
      return builder;
    } };
  };
  return db;
}
module.exports = { profile, attachProfileRpc };
