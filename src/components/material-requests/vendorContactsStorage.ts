import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { withReadDeadline } from "@/lib/readDeadline";
import { normalizeContactEmails, validateVendorContact, VENDOR_CONTACT_FIELD_LIMITS, type VendorContact } from "./vendorContacts";

export type StoredVendorContact = VendorContact & { updatedAt: string };
type ContactRow = VendorContact & { owner_id: string; vendor_key: string; updated_at: string };
type ContactFields = Omit<VendorContact, "id">;
type ContactInsert = VendorContact & { owner_id: string };
type ContactSchema = {
  Tables: { supplier_contacts: { Row: ContactRow; Insert: ContactInsert; Update: Partial<ContactFields>; Relationships: [] } };
  Views: Record<string, never>;
  Functions: Record<string, never>;
};
// The new table has its own narrow type until the generated project schema is refreshed.
const contactsClient = supabase as unknown as SupabaseClient<{ workspace: ContactSchema }, "workspace">;
const CONTACT_COLUMNS = "id,vendor,name,email,cc,phone,note,updated_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertOwner(ownerId: string) {
  if (typeof ownerId !== "string" || !UUID.test(ownerId)) throw new Error("帳號格式不正確，請重新登入。");
}

function contactFields(contact: VendorContact): ContactFields {
  if (typeof contact?.id !== "string" || !UUID.test(contact.id)) throw new Error("聯絡人識別碼格式不正確。");
  for (const [field, limit] of Object.entries(VENDOR_CONTACT_FIELD_LIMITS)) {
    const value = contact[field as keyof ContactFields];
    if (typeof value !== "string") throw new Error("聯絡資料欄位必須是字串。");
    if (value.length > limit || value.includes("\0")) throw new Error(`聯絡資料 ${field} 超過長度限制或格式不正確。`);
  }
  const fields: ContactFields = {
    vendor: contact.vendor.trim(), name: contact.name.trim(),
    email: normalizeContactEmails(contact.email).split("; ").sort().join("; "),
    cc: normalizeContactEmails(contact.cc), phone: contact.phone.trim(), note: contact.note,
  };
  const errors = validateVendorContact(fields);
  if (errors.length) throw new Error(errors.join("；"));
  return fields;
}

function storedContact(row: Omit<ContactRow, "owner_id" | "vendor_key">): StoredVendorContact {
  return { id: row.id, vendor: row.vendor, name: row.name, email: row.email, cc: row.cc, phone: row.phone, note: row.note, updatedAt: row.updated_at };
}

export async function loadVendorContacts(ownerId: string): Promise<StoredVendorContact[]> {
  assertOwner(ownerId);
  const contacts: StoredVendorContact[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await withReadDeadline((signal) => contactsClient.from("supplier_contacts").select(CONTACT_COLUMNS)
      .eq("owner_id", ownerId).order("vendor_key").order("id").range(start, start + 499).abortSignal(signal));
    if (error) throw new Error(error.message);
    if (!data) throw new Error("無法讀取聯絡資料，請重試。");
    contacts.push(...data.map(storedContact));
    if (data.length < 500) return contacts;
  }
}

export async function saveVendorContact(ownerId: string, contact: VendorContact, expectedUpdatedAt?: string): Promise<StoredVendorContact> {
  assertOwner(ownerId);
  const fields = contactFields(contact);
  if (expectedUpdatedAt !== undefined && (!expectedUpdatedAt.trim() || !Number.isFinite(Date.parse(expectedUpdatedAt)))) {
    throw new Error("聯絡資料版本時間格式不正確，請重新載入。");
  }
  const query = expectedUpdatedAt === undefined
    ? contactsClient.from("supplier_contacts").insert({ id: contact.id, owner_id: ownerId, ...fields })
    : contactsClient.from("supplier_contacts").update(fields)
      .eq("owner_id", ownerId).eq("id", contact.id).eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select(CONTACT_COLUMNS).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("聯絡資料已更新或無法存取，請重新載入後確認再儲存。");
  return storedContact(data);
}

export async function importVendorContacts(ownerId: string, contacts: readonly VendorContact[]): Promise<{ added: number; skipped: number }> {
  assertOwner(ownerId);
  if (contacts.length > 5000) throw new Error("每次最多匯入 5000 筆聯絡資料。");
  if (!contacts.length) return { added: 0, skipped: 0 };
  const rows = contacts.map((contact) => ({ id: contact.id, owner_id: ownerId, ...contactFields(contact) }));
  if (new TextEncoder().encode(JSON.stringify(rows)).byteLength > 5 * 1024 * 1024) throw new Error("聯絡資料大小不可超過 5 MiB，請分開匯入。");
  const { error, count } = await contactsClient.from("supplier_contacts").upsert(rows, {
    onConflict: "owner_id,vendor_key,email", ignoreDuplicates: true, count: "exact",
  });
  if (error) throw new Error(error.message);
  if (!Number.isInteger(count) || count === null || count < 0 || count > contacts.length) {
    throw new Error("無法確認匯入筆數，請重新載入聯絡簿確認；重試不會覆蓋既有聯絡人。");
  }
  return { added: count, skipped: contacts.length - count };
}
