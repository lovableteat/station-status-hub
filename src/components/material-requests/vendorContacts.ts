export type VendorContact = {
  id: string;
  vendor: string;
  name: string;
  email: string;
  cc: string;
  phone: string;
  note: string;
};

export type VendorContactImportIssue = { rowNumber: number; message: string };

type ContactField = Exclude<keyof VendorContact, "id">;
export const VENDOR_CONTACT_FIELD_LIMITS = { vendor: 200, name: 200, email: 2000, cc: 2000, phone: 160, note: 4000 } as const;
const fieldLabels: Record<ContactField, string> = { vendor: "廠商", name: "聯絡人", email: "收件人 Email", cc: "副本 Email", phone: "電話", note: "備註" };

const headerAliases = new Map<string, ContactField>([
  ...["廠商", "廠商名稱", "供應商", "供應商名稱", "manufacturer", "vendor", "supplier"].map((name) => [name, "vendor"] as [string, ContactField]),
  ...["聯絡人", "聯絡人姓名", "contact", "contactname", "name"].map((name) => [name, "name"] as [string, ContactField]),
  ...["email", "電子郵件", "電子信箱", "信箱", "收件人", "to"].map((name) => [name, "email"] as [string, ContactField]),
  ...["副本", "cc"].map((name) => [name, "cc"] as [string, ContactField]),
  ...["電話", "聯絡電話", "phone", "telephone", "tel"].map((name) => [name, "phone"] as [string, ContactField]),
  ...["備註", "note", "notes", "remark", "remarks"].map((name) => [name, "note"] as [string, ContactField]),
]);

function cellText(value: unknown): string {
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))
    ? String(value).trim()
    : "";
}

function emailList(value: unknown): string[] {
  return [...new Set(cellText(value).split(/[;,\r\n]+/).map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

function isValidEmail(email: string): boolean {
  const local = email.slice(0, email.indexOf("@"));
  return email.length <= 254 && local.length <= 64 && !local.startsWith(".") && !local.endsWith(".") && !local.includes("..")
    && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(email);
}

export function normalizeContactEmails(value: unknown): string {
  return emailList(value).join("; ");
}

export function validateVendorContact(contact: Pick<VendorContact, "vendor" | "email" | "cc"> & Partial<VendorContact>): string[] {
  const errors: string[] = [];
  for (const field of Object.keys(VENDOR_CONTACT_FIELD_LIMITS) as ContactField[]) {
    const value = contact[field];
    if (value === undefined) continue;
    if (typeof value !== "string") errors.push(`${fieldLabels[field]}必須為文字`);
    else if (value.length > VENDOR_CONTACT_FIELD_LIMITS[field]) errors.push(`${fieldLabels[field]}長度不可超過 ${VENDOR_CONTACT_FIELD_LIMITS[field]} 字元`);
    else if (value.includes("\0")) errors.push(`${fieldLabels[field]}不允許包含 NUL 控制字元`);
  }
  if (!cellText(contact.vendor)) errors.push("廠商不可空白");
  const to = emailList(contact.email);
  if (to.length === 0) errors.push("收件人 Email 不可空白");
  else if (to.some((email) => !isValidEmail(email))) errors.push("收件人 Email 格式不正確");
  if (emailList(contact.cc).some((email) => !isValidEmail(email))) errors.push("副本 Email 格式不正確");
  return errors;
}

export function parseVendorContactRows(rows: unknown[][]): { contacts: VendorContact[]; issues: VendorContactImportIssue[] } {
  let headerIndex = -1;
  let columns: Partial<Record<ContactField, number>> = {};
  for (let index = 0; index < rows.length; index += 1) {
    if (!Array.isArray(rows[index])) continue;
    const candidate: Partial<Record<ContactField, number>> = {};
    rows[index].forEach((value, column) => {
      const field = headerAliases.get(cellText(value).toLowerCase().replace(/[\s_\-（）()]/g, ""));
      if (field && candidate[field] === undefined) candidate[field] = column;
    });
    if (candidate.vendor !== undefined && candidate.email !== undefined) {
      headerIndex = index;
      columns = candidate;
      break;
    }
  }
  if (headerIndex === -1) {
    return { contacts: [], issues: [{ rowNumber: 1, message: "找不到廠商及收件人 Email 欄位，請確認聯絡清單表頭" }] };
  }

  const contacts: VendorContact[] = [];
  const issues: VendorContactImportIssue[] = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!Array.isArray(row)) {
      issues.push({ rowNumber: index + 1, message: "資料列格式不正確" });
      continue;
    }
    if (row.every((value) => value == null || (typeof value === "string" && !value.trim()))) continue;
    const value = (field: ContactField) => columns[field] === undefined ? "" : cellText(row[columns[field]]);
    const contact: VendorContact = {
      id: crypto.randomUUID(),
      vendor: value("vendor"),
      name: value("name"),
      email: normalizeContactEmails(value("email")),
      cc: normalizeContactEmails(value("cc")),
      phone: value("phone"),
      note: value("note"),
    };
    const errors = validateVendorContact(contact);
    if (errors.length) issues.push({ rowNumber: index + 1, message: errors.join("；") });
    else contacts.push(contact);
  }
  return { contacts, issues };
}

function contactKey(contact: VendorContact): string {
  return JSON.stringify([contact.vendor.trim().toLowerCase(), emailList(contact.email).sort()]);
}

export function mergeVendorContacts(existing: readonly VendorContact[], incoming: readonly VendorContact[]): { contacts: VendorContact[]; added: number; skipped: number } {
  const contacts = [...existing];
  const keys = new Set(existing.map(contactKey));
  let skipped = 0;
  for (const contact of incoming) {
    const key = contactKey(contact);
    if (keys.has(key)) skipped += 1;
    else {
      contacts.push(contact);
      keys.add(key);
    }
  }
  return { contacts, added: contacts.length - existing.length, skipped };
}

export function getVendorRecipients(contacts: readonly VendorContact[], vendor: string): { to: string; cc: string } {
  const matched = contacts.filter((contact) => contact.vendor.trim().toLowerCase() === vendor.trim().toLowerCase());
  const to = [...new Set(matched.flatMap((contact) => emailList(contact.email)).filter(isValidEmail))];
  const cc = [...new Set(matched.flatMap((contact) => emailList(contact.cc)).filter((email) => isValidEmail(email) && !to.includes(email)))];
  return { to: to.join("; "), cc: cc.join("; ") };
}
