import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { React, create, act, flush, loader, database, deferred } = require('./support/renderHarness.cjs');
const a = '00000000-0000-4000-8000-000000000001', b = '00000000-0000-4000-8000-000000000002';
function setup() {
  let user = { userId: a, role: 'admin' }, rows = [], read;
  const pending = deferred();
  const db = database(q => {
    if (q.method === 'select') return read ? pending.promise : { data: rows, error: null };
    return { data: q.args.p_contacts.length, error: null };
  });
  const rpc = db.rpc;
  db.rpc = (name, args) => { db.reads.push({ table: name, args, method: 'rpc' }); return rpc(name, args); };
  const load = loader({ mocks: { '@/integrations/supabase/client': { supabase: db }, '@/components/auth/UserContext': { useUser: () => ({ user, sessionMode: user ? 'authenticated' : 'signed-out' }) } }, globals: { TextEncoder } });
  const core = load('src/components/material-requests/supplierDirectory.ts');
  const storage = load('src/components/material-requests/supplierDirectoryStorage.ts');
  const { useCompanySuppliers } = load('src/components/material-requests/useCompanySuppliers.ts');
  let book, root;
  function Probe() { book = useCompanySuppliers(true); return null; }
  return { db, core, storage, get book() { return book; }, async mount() { await act(async () => { root = create(React.createElement(Probe)); }); await flush(); },
    async user(next) { user = next; await act(async () => root.update(React.createElement(Probe))); await flush(); },
    setRows(value) { rows = value; }, stall() { read = true; }, pending, async stop() { await act(async () => root.unmount()); },
    contact() { return { id: b, version: 0, data: { ...core.emptySupplierData(), company: 'Example', email: 'person@example.invalid' }, imported: { ...core.emptySupplierData(), company: 'Example', email: 'person@example.invalid' }, source: { group: 'QA', file: 'q.xlsx', sheet: 'Q', row: 2, slot: 1, raw: [] } }; } };
}
test('company book is shared for active accounts but mutation UI is admin-only', async () => {
  const s = setup(); s.setRows([s.contact()]); await s.mount();
  assert.equal(s.book.canEdit, true); assert.equal(s.book.contacts.length, 1);
  await s.user({ userId: b, role: 'engineer' });
  assert.equal(s.book.canEdit, false); assert.equal(s.book.contacts.length, 1);
  await assert.rejects(s.book.save([s.contact()]), /權限|帳號/);
  assert.equal(s.db.reads.filter(x => x.method === 'rpc').length, 0);
  await s.user(null); assert.equal(s.book.contacts.length, 0); await s.stop();
});
test('a delayed read from a previous account never repopulates the signed-out view', async () => {
  const s = setup(); s.stall(); await s.mount();
  await s.user(null); s.pending.resolve({ data: [s.contact()], error: null }); await flush();
  assert.equal(s.book.contacts.length, 0); await s.stop();
});
test('storage validates the entire batch and sends one versioned RPC with the expected actor', async () => {
  const s = setup(), row = s.contact();
  await assert.rejects(s.storage.applyCompanySuppliers(a, [row, { ...row, id: a, data: { ...row.data, email: 'not email' } }]), /Email/);
  assert.equal(s.db.reads.length, 0);
  assert.equal(await s.storage.applyCompanySuppliers(a, [row]), 1);
  const call = s.db.reads[0]; assert.equal(call.table, 'apply_company_supplier_contacts'); assert.equal(call.args.p_actor, a); assert.equal(call.args.p_contacts[0].version, 0);
});

test('optional Gemini review uses unexpired official Google targets and tracked requests only', async () => {
  const key = (id, baseUrl, expires_at = null) => ({ id, key_name: id, api_key: 'synthetic-key', is_active: true, expires_at,
    permissions: { metadata: { provider: 'gemini', model: 'fixture-model', baseUrl } } });
  const records = [key('official', 'https://generativelanguage.googleapis.com/v1beta'), key('proxy', 'https://example.invalid'), key('expired', 'https://generativelanguage.googleapis.com/v1beta', '2020-01-01'), key('invalid-expiry', 'https://generativelanguage.googleapis.com/v1beta', 'not-a-date')];
  const requests = [];
  const db = database(() => ({ data: records, error: null }));
  const load = loader({ mocks: { '@/integrations/supabase/client': { supabase: db }, '@/components/api-management/aiUsageTelemetry': { trackedProviderFetch: async request => {
    requests.push(request); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '人工確認公司與窗口' }] } }] }) };
  } } }, globals: { TextEncoder } });
  const gemini = load('src/components/material-requests/supplierGeminiReview.ts');
  const targets = await gemini.loadSupplierGeminiTargets();
  assert.equal(targets.length, 1); assert.equal(targets[0].id, 'official');
  await assert.rejects(gemini.reviewSupplierImport(targets[0], 'x'.repeat(100001)), /限制/);
  assert.equal(requests.length, 0);
  assert.equal(await gemini.reviewSupplierImport(targets[0], '{"synthetic":true}'), '人工確認公司與窗口');
  assert.equal(requests.length, 1); assert.equal(requests[0].apiKeyId, 'official');
  assert.match(requests[0].url, /^https:\/\/generativelanguage\.googleapis\.com\//);
});
