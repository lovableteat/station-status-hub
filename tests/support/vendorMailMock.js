import { useSyncExternalStore } from 'react';

const accounts = { A: '00000000-0000-4000-8000-000000000001', B: '00000000-0000-4000-8000-000000000002' };
let account = accounts.A;
let timestamp = Date.parse('2026-10-26T01:00:00Z');
const listeners = new Set();
export const fixtureState = { saves: 0, imports: 0, account: 'A' };
const notify = () => window.dispatchEvent(new Event('vendor-mail-qa-state'));
export function setFixtureAccount(next) {
  if (!accounts[next]) throw new Error('Unknown fixture account');
  account = accounts[next];
  fixtureState.account = next;
  listeners.forEach(fn => fn());
  notify();
}
export function useUser() {
  return { sessionMode: 'authenticated', user: { role: account === accounts.A ? 'admin' : 'engineer', userId: useSyncExternalStore(
    fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => account,
  ) } };
}

const rowsByOwner = new Map([
  [accounts.A, [{ id: '00000000-0000-4000-8000-000000000101', owner_id: accounts.A,
    vendor: 'Vendor A', vendor_key: 'vendor a', name: '初始聯絡人', email: 'initial@example.invalid',
    cc: '', phone: '', note: '僅供隔離測試', updated_at: new Date(timestamp).toISOString() }]],
  [accounts.B, []],
]);
const makeRow = value => ({ ...structuredClone(value), vendor_key: value.vendor.trim().toLowerCase(), updated_at: new Date(++timestamp).toISOString() });

export const supabase = {
  from(table) {
    if (table === 'company_supplier_contacts') {
      let range = [0, 499];
      const query = { select() { return this; }, order() { return this; }, range(a,b) { range = [a,b]; return this; }, abortSignal() { return this; },
        then(resolve, reject) { return Promise.resolve({ data: structuredClone(companyRows.slice(range[0], range[1] + 1)), error: null }).then(resolve, reject); } };
      return query;
    }
    if (table !== 'supplier_contacts') throw new Error(`Fixture disallows table ${table}`);
    const filters = {};
    const ordering = [];
    let operation = 'select';
    let payload;
    let options = {};
    let range;
    let promise;
    const matches = row => Object.entries(filters).every(([key, value]) => row[key] === value);
    const run = () => {
      const owner = filters.owner_id ?? (Array.isArray(payload) ? payload[0]?.owner_id : payload?.owner_id);
      if (owner !== account) return { data: null, count: 0, error: { message: 'Fixture account mismatch' } };
      const current = rowsByOwner.get(owner) ?? [];
      if (operation === 'select') {
        const data = current.filter(matches).map(row => structuredClone(row));
        data.sort((left, right) => {
          for (const key of ordering) {
            const result = String(left[key]).localeCompare(String(right[key]));
            if (result) return result;
          }
          return 0;
        });
        return { data: range ? data.slice(range[0], range[1] + 1) : data, error: null };
      }
      if (operation === 'update') {
        const index = current.findIndex(matches);
        if (index < 0) return { data: [], error: null };
        const updated = makeRow({ ...current[index], ...payload });
        if (current.some((row, at) => at !== index && row.vendor_key === updated.vendor_key && row.email === updated.email)) {
          return { data: null, error: { message: '聯絡人已存在' } };
        }
        current[index] = updated;
        fixtureState.saves++;
        notify();
        return { data: [structuredClone(updated)], error: null };
      }
      const incoming = Array.isArray(payload) ? payload : [payload];
      if (incoming.some(row => row.owner_id !== account)) return { data: null, error: { message: 'Fixture account mismatch' } };
      const next = [...current];
      const added = [];
      for (const value of incoming) {
        const row = makeRow(value);
        const duplicate = next.some(existing => existing.id === row.id || (existing.vendor_key === row.vendor_key && existing.email === row.email));
        if (duplicate) {
          if (operation === 'upsert' && options.ignoreDuplicates) continue;
          return { data: null, error: { message: '聯絡人已存在' } };
        }
        next.push(row);
        added.push(row);
      }
      rowsByOwner.set(owner, next);
      if (operation === 'upsert') fixtureState.imports++;
      else fixtureState.saves++;
      notify();
      return { data: structuredClone(added), count: options.count === 'exact' ? added.length : null, error: null };
    };
    const result = () => promise ??= Promise.resolve().then(run);
    const builder = {
      select() { return this; },
      eq(key, value) { filters[key] = value; return this; },
      order(key) { ordering.push(key); return this; },
      range(from, to) { range = [from, to]; return this; },
      abortSignal() { return this; },
      insert(value) { operation = 'insert'; payload = value; return this; },
      update(value) { operation = 'update'; payload = value; return this; },
      upsert(value, config) { operation = 'upsert'; payload = value; options = config ?? {}; return this; },
      maybeSingle() { return result().then(value => ({ ...value, data: value.data?.[0] ?? null })); },
      then(resolve, reject) { return result().then(resolve, reject); },
    };
    return builder;
  },
  async rpc(name, args) {
    if (name !== 'apply_company_supplier_contacts') throw new Error('Unexpected fixture RPC');
    if (account !== accounts.A || args.p_actor !== account) return { data: null, error: { message: '只有管理員可修改' } };
    const next = structuredClone(companyRows);
    for (const incoming of args.p_contacts) {
      const at = next.findIndex(x => x.id === incoming.id);
      if ((at < 0 && incoming.version !== 0) || at >= 0 && next[at].version !== incoming.version) return { data: null, error: { message: '資料版本已變更' } };
      const row = { ...structuredClone(incoming), version: incoming.version + 1 };
      if (at < 0) next.push(row); else next[at] = row;
    }
    companyRows = next; fixtureState.saves++; notify();
    return { data: args.p_contacts.length, error: null };
  },
};

const makeCompanyData = index => ({ company: index ? `示範供應商 ${String(index).padStart(2,'0')}` : 'Vendor A', aliases: index ? '' : 'Example Company', brands: index ? 'Fixture Brand' : 'Brand A', name: index ? `測試窗口 ${index}` : 'Alex 範例', title: '業務', department: '零件事業部', email: index ? `contact${index}@example.invalid` : 'company@example.invalid', cc: '', phone: '02-1234-5678', mobile: '0900-000-000', extension: '123', category: 'IC', address: '', code: '', pvl: 'Y', note: '僅供隔離測試，非公司實際資料' });
let companyRows = Array.from({ length: 65 }, (_, i) => {
  const data = makeCompanyData(i);
  return { id: `10000000-0000-4000-8000-${String(i).padStart(12,'0')}`, version: 1, data, imported: { ...data }, source: { group: i % 2 ? '測試清單 B' : '測試清單 A', file: 'synthetic.xlsx', sheet: '窗口', row: i+2, slot: 1, raw: [{ label: 'Company', value: data.company }, { label: 'Unknown', value: '原始欄位保留' }] } };
});
