import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const storageFile = new URL("../src/components/material-requests/vendorContactsStorage.ts", import.meta.url);
const coreFile = new URL("../src/components/material-requests/vendorContacts.ts", import.meta.url);
const schemaFile = new URL("../supabase/migrations/20261026095758_supplier_contacts.sql", import.meta.url);
const ownerId = "00000000-0000-4000-8000-000000000001";
const contactId = "00000000-0000-4000-8000-000000000002";
const timestamp = "2026-10-26T00:00:00.123456+00:00";
const contact = (overrides = {}) => ({ id: contactId, vendor: "ACES", name: "Buyer", email: "buyer@example.com", cc: "", phone: "", note: "manual note", ...overrides });
const row = (overrides = {}) => ({ ...contact(), owner_id: ownerId, updated_at: timestamp, ...overrides });

function compile(file, require) {
  const source = existsSync(file) ? readFileSync(file, "utf8") : "";
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", output)(require, exports);
  return exports;
}

function setup(respond = () => ({ data: [], error: null }), readTimeoutMs = 20_000) {
  const calls = [];
  const supabase = { from(table) {
    const call = { table, method: "select", filters: {}, orders: [] };
    const query = {
      select(columns) { call.columns = columns; return query; },
      eq(column, value) { call.filters[column] = value; return query; },
      order(column, options) { call.orders.push({ column, options }); return query; },
      range(start, end) { call.range = [start, end]; return query; },
      abortSignal(signal) { call.signal = signal; return query; },
      insert(payload) { call.method = "insert"; call.payload = payload; return query; },
      update(payload) { call.method = "update"; call.payload = payload; return query; },
      upsert(payload, options) { call.method = "upsert"; call.payload = payload; call.options = options; return query; },
      single() { call.single = true; return query; },
      maybeSingle() { call.single = true; return query; },
      then(resolve, reject) { calls.push(call); return Promise.resolve().then(() => respond(call)).then(resolve, reject); },
    };
    return query;
  } };
  const core = compile(coreFile, () => { throw new Error("Unexpected core dependency"); });
  const deadline = compile(new URL("../src/lib/readDeadline.ts", import.meta.url), () => { throw new Error("Unexpected deadline dependency"); });
  const storage = compile(storageFile, (specifier) => {
    if (specifier === "@/integrations/supabase/client") return { supabase };
    if (specifier === "./vendorContacts") return core;
    if (specifier === "@/lib/readDeadline") return { withReadDeadline: (read) => deadline.withReadDeadline(read, readTimeoutMs) };
    throw new Error(`Unexpected storage dependency: ${specifier}`);
  });
  return { storage, calls };
}

test("storage exposes only the three requested owner-scoped operations", () => {
  const { storage } = setup();
  assert.equal(typeof storage.loadVendorContacts, "function");
  assert.equal(typeof storage.saveVendorContact, "function");
  assert.equal(typeof storage.importVendorContacts, "function");
});

test("load pages beyond 500 contacts and maps server timestamps without exposing owner metadata", async () => {
  const { storage, calls } = setup(({ range: [start] }) => ({ data: start === 0 ? Array.from({ length: 500 }, () => row()) : [row({ name: "Last" })], error: null }));
  const loaded = await storage.loadVendorContacts(ownerId);
  assert.equal(loaded.length, 501);
  assert.deepEqual(loaded[500], { ...contact({ name: "Last" }), updatedAt: timestamp });
  assert.deepEqual(calls.map(({ range }) => range), [[0, 499], [500, 999]]);
  assert.ok(calls.every(({ table, filters, orders }) => table === "supplier_contacts" && filters.owner_id === ownerId && orders.some(({ column }) => column === "id")));
});

test("load errors reject rather than returning an empty success", async () => {
  const { storage } = setup(() => ({ data: null, error: { message: "Permission denied", code: "42501" } }));
  await assert.rejects(storage.loadVendorContacts(ownerId), /Permission denied/);
});

test("a stalled read rejects within its deadline and aborts the request", async () => {
  const { storage, calls } = setup(() => new Promise(() => {}), 10);
  let fallback;
  try {
    await assert.rejects(Promise.race([
      storage.loadVendorContacts(ownerId),
      new Promise((_, reject) => { fallback = setTimeout(() => reject(new Error("read never reached its deadline")), 250); }),
    ]), /讀取逾時/);
    assert.equal(calls[0].signal.aborted, true);
  } finally { clearTimeout(fallback); }
});

test("creating a contact inserts a canonical owner-scoped row and returns the server version", async () => {
  const { storage, calls } = setup(({ payload }) => ({ data: row(payload), error: null }));
  const result = await storage.saveVendorContact(ownerId, contact({ vendor: " ACES ", email: "B@example.com; A@example.com", cc: "CC@example.com" }));
  assert.equal(calls[0].method, "insert");
  assert.equal(calls[0].payload.owner_id, ownerId);
  assert.equal(calls[0].payload.vendor, "ACES");
  assert.equal(calls[0].payload.email, "a@example.com; b@example.com");
  assert.equal(calls[0].payload.cc, "cc@example.com");
  assert.equal("updated_at" in calls[0].payload, false);
  assert.equal(result.updatedAt, timestamp);
});

test("editing uses a row-level compare-and-swap without changing owner, id or other contacts", async () => {
  const { storage, calls } = setup(({ payload }) => ({ data: row(payload), error: null }));
  await storage.saveVendorContact(ownerId, contact({ note: "edited" }), timestamp);
  assert.equal(calls[0].method, "update");
  assert.deepEqual(calls[0].filters, { owner_id: ownerId, id: contactId, updated_at: timestamp });
  assert.equal("owner_id" in calls[0].payload, false);
  assert.equal("id" in calls[0].payload, false);
  assert.equal(calls[0].payload.note, "edited");
});

test("a zero-row update is a conflict, never an apparent successful save", async () => {
  const { storage } = setup(() => ({ data: null, error: null }));
  await assert.rejects(storage.saveVendorContact(ownerId, contact(), timestamp), /更新|衝突|重新載入/);
});

test("a server save failure preserves the error", async () => {
  const { storage } = setup(() => ({ data: null, error: { message: "duplicate contact", code: "23505" } }));
  await assert.rejects(storage.saveVendorContact(ownerId, contact()), /duplicate contact/);
});

test("import is one ignore-duplicates transaction and uses exact affected count, not truncated returned rows", async () => {
  const { storage, calls } = setup(() => ({ data: null, count: 1200, error: null }));
  const incoming = Array.from({ length: 1500 }, (_, index) => contact({ id: crypto.randomUUID(), email: `buyer${index}@example.com` }));
  assert.deepEqual(await storage.importVendorContacts(ownerId, incoming), { added: 1200, skipped: 300 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "upsert");
  assert.deepEqual(calls[0].options, { onConflict: "owner_id,vendor_key,email", ignoreDuplicates: true, count: "exact" });
  assert.equal(calls[0].payload.length, 1500);
  assert.ok(calls[0].payload.every((item) => item.owner_id === ownerId && !Object.hasOwn(item, "vendor_key")));
});

test("empty import avoids a database write", async () => {
  const { storage, calls } = setup();
  assert.deepEqual(await storage.importVendorContacts(ownerId, []), { added: 0, skipped: 0 });
  assert.equal(calls.length, 0);
});

test("invalid owner, id, email, fields or timestamp are rejected before writing", async () => {
  const { storage, calls } = setup();
  await assert.rejects(storage.loadVendorContacts("another-account"), /帳號|格式/);
  await assert.rejects(storage.saveVendorContact(ownerId, contact({ id: "invalid" })), /識別|格式/);
  for (const invalid of [{ vendor: "" }, { email: "bad" }, { cc: "bad" }, { vendor: "v".repeat(201) }, { name: "n".repeat(201) }, { phone: "p".repeat(161) }, { note: "n".repeat(4001) }, { note: {} }]) {
    await assert.rejects(storage.saveVendorContact(ownerId, contact(invalid)), /格式|超過|廠商|Email|字串/);
  }
  await assert.rejects(storage.saveVendorContact(ownerId, contact(), "invalid timestamp"), /版本|時間|格式/);
  assert.equal(calls.length, 0);
});

test("import validates the whole batch before any write and enforces 5000-row and 5 MiB bounds", async () => {
  const { storage, calls } = setup();
  await assert.rejects(storage.importVendorContacts(ownerId, [contact(), contact({ email: "bad" })]), /Email|格式/);
  await assert.rejects(storage.importVendorContacts(ownerId, Array.from({ length: 5001 }, () => contact())), /5000/);
  await assert.rejects(storage.importVendorContacts(ownerId, Array.from({ length: 1500 }, () => contact({ note: "n".repeat(4000) }))), /5 MiB|5 MB|大小/);
  assert.equal(calls.length, 0);
});

test("import failures never report a successful partial count", async () => {
  const failed = setup(() => ({ data: null, count: null, error: { message: "entire transaction failed" } }));
  await assert.rejects(failed.storage.importVendorContacts(ownerId, [contact()]), /entire transaction failed/);
  const missingCount = setup(() => ({ data: null, count: null, error: null }));
  await assert.rejects(missingCount.storage.importVendorContacts(ownerId, [contact()]), /確認|數量|筆數/);
});

test("schema grants no anonymous access and all policies require the active account owner", () => {
  const sql = existsSync(schemaFile) ? readFileSync(schemaFile, "utf8") : "";
  assert.match(sql, /create table if not exists workspace\.supplier_contacts/i);
  assert.match(sql, /owner_id uuid not null default workspace\.current_system_user_id\(\)/i);
  assert.match(sql, /references workspace\.system_users\(id\)/i);
  assert.match(sql, /generated always as \(lower\(btrim\(vendor\)\)\) stored/i);
  assert.match(sql, /unique\s*\(owner_id, vendor_key, email\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on (?:table )?workspace\.supplier_contacts from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /grant .* on (?:table )?workspace\.supplier_contacts to anon/i);
  assert.equal((sql.match(/owner_id = \(select workspace\.current_system_user_id\(\)\)/gi) ?? []).length, 4);
  assert.match(sql, /for update to authenticated\s+using[\s\S]+with check/i);
  assert.match(sql, /new\.updated_at := clock_timestamp\(\)/i);
  assert.doesNotMatch(sql, /security definer|using\s*\(true\)|with check\s*\(true\)/i);
});
