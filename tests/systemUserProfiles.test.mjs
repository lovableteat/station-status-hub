import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { loader, database } = require('./support/renderHarness.cjs');
const { profile, attachProfileRpc } = require('./support/sanitizedProfiles.cjs');
const setup = run => {
  const db = attachProfileRpc(database(() => { throw new Error('Raw table access forbidden'); }), run);
  return { db, ...loader({ mocks: { '@/integrations/supabase/client': { supabase: db } } })('src/lib/systemUserProfiles.ts') };
};
const ok = data => ({ data, error: null });

test('sanitized profile reader uses explicit workspace zero-argument RPC and preserves filter/order', async () => {
  const own = profile('owner'); const h = setup(q => ok(q.single ? own : [own]));
  assert.equal((await h.readSystemUserProfile('owner')).data, own);
  assert.deepEqual(JSON.parse(JSON.stringify((await h.listSystemUserProfiles()).data)), [own]);
  assert.deepEqual(h.db.profileReads.map(q => [q.filters, q.single, q.order]), [
    [{ id: 'owner' }, true, undefined], [{}, false, { key: 'created_at', ascending: false }],
  ]);
  assert.equal(h.db.reads.length, 0);
});

for (const permissions of [null, false, 0, 'legacy', [], { pagePermissions: [], workspaceAccess: { pcb: 'none' }, future: { retained: '繁體' } }]) {
  test(`profile response retains legitimate JSON shape ${JSON.stringify(permissions)}`, () => {
    const h = setup(() => {}); const row = profile('owner', { permissions });
    assert.equal(h.validateSystemUserProfile(row), row);
    assert.equal(row.permissions, permissions);
  });
}

for (const [name, mutate] of [
  ['legacy PCB key', row => { row.permissions = { pcbDesignerWorkspace: { syntheticPrivate: true } }; }],
  ['unexpected credential field', row => { row.password_hash = 'synthetic-only'; }],
  ['missing nullable field', row => { delete row.display_name; }],
  ['null required role', row => { row.role = null; }],
  ['wrong nullable type', row => { row.approved_at = 4; }],
  ['missing JSON value', row => { row.permissions = undefined; }],
]) test(`profile rejects ${name} without exposing response content`, async () => {
  const row = profile('owner'); mutate(row); const h = setup(() => ok(row));
  await assert.rejects(() => h.readSystemUserProfile('owner'), error => {
    assert.doesNotMatch(error.message, /syntheticPrivate|synthetic-only/); return true;
  });
  assert.equal(h.db.reads.length, 0);
});

for (const error of [{ code: 'PGRST202' }, { code: '42501' }, { status: 401 }, { status: 500 }]) {
  test(`profile propagates ${JSON.stringify(error)} without raw fallback`, async () => {
    const h = setup(() => ({ data: null, error }));
    assert.equal((await h.readSystemUserProfile('owner')).error, error);
    assert.equal((await h.listSystemUserProfiles()).error, error);
    assert.equal(h.db.reads.length, 0);
  });
}
test('profile absence remains absence; wrong identity and malformed/duplicate roster fail', async () => {
  assert.equal((await setup(() => ok(null)).readSystemUserProfile('absent')).data, null);
  await assert.rejects(() => setup(() => ok(profile('other'))).readSystemUserProfile('owner'), /identity mismatch/);
  await assert.rejects(() => setup(() => ok(null)).listSystemUserProfiles(), /Invalid/);
  await assert.rejects(() => setup(() => ok([profile('same'), profile('same')])).listSystemUserProfiles(), /Duplicate/);
});
