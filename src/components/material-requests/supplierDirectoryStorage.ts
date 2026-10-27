import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { withReadDeadline } from '@/lib/readDeadline';
import { validateSupplierData, type SupplierContact } from './supplierDirectory';
type DirectorySchema = {
  Tables: { company_supplier_contacts: { Row: SupplierContact; Insert: SupplierContact; Update: Partial<SupplierContact>; Relationships: [] } };
  Views: Record<string, never>;
  Functions: { apply_company_supplier_contacts: { Args: { p_actor: string; p_contacts: SupplierContact[] }; Returns: number } };
};
const client = supabase as unknown as SupabaseClient<{ workspace: DirectorySchema }, 'workspace'>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function loadCompanySuppliers(): Promise<SupplierContact[]> {
  const rows: SupplierContact[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await withReadDeadline(signal => client.from('company_supplier_contacts')
      .select('id,data,imported,source,version').order('id').range(start, start + 499).abortSignal(signal));
    if (error) throw new Error(error.message);
    if (!data) throw new Error('公司聯絡資料讀取失敗');
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
export async function applyCompanySuppliers(actor: string, contacts: SupplierContact[]) {
  if (!uuid.test(actor)) throw new Error('帳號已變更，請重新登入');
  if (!contacts.length || contacts.length > 5000) throw new Error('每批需為 1–5000 筆聯絡人');
  if (new Set(contacts.map(x => x.id)).size !== contacts.length) throw new Error('不可重複修改同一聯絡人');
  for (const contact of contacts) {
    if (!uuid.test(contact.id) || !Number.isInteger(contact.version) || contact.version < 0) throw new Error('聯絡人版本或識別碼不正確');
    const errors = [...validateSupplierData(contact.data), ...validateSupplierData(contact.imported)];
    if (errors.length) throw new Error(errors.join('；'));
    if (!contact.source.group.trim() || contact.source.group.length > 200 || !Array.isArray(contact.source.raw)) throw new Error('請填寫有效來源群組');
  }
  if (new TextEncoder().encode(JSON.stringify(contacts)).byteLength > 15 * 1024 * 1024) throw new Error('每批資料不可超過 15 MiB');
  const { data, error } = await client.rpc('apply_company_supplier_contacts', { p_actor: actor, p_contacts: contacts });
  if (error) throw new Error(error.message);
  if (data !== contacts.length) throw new Error('無法確認儲存筆數，請重新載入後核對，請勿直接重試新增');
  return data;
}
