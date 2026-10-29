import type { SupplierContact, SupplierField } from './supplierDirectory';

export const SUPPLIER_SEARCH_SCOPES = {
  company: { label: '公司／代理品牌', placeholder: '搜尋公司、英文別名或代理品牌' },
  person: { label: '聯絡人', placeholder: '搜尋聯絡人姓名' },
  email: { label: 'Email', placeholder: '搜尋 Email 地址或網域' },
  phone: { label: '電話', placeholder: '搜尋電話、手機或分機' },
  all: { label: '全部聯絡欄位', placeholder: '搜尋聯絡資料中的字詞' },
} as const;
export type SupplierSearchScope = keyof typeof SUPPLIER_SEARCH_SCOPES;

const normalize = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '').normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
const digits = (value: string) => normalize(value).replace(/\D/g, '');
const companyFields: SupplierField[] = ['company', 'aliases', 'brands'];

/** Search current contact fields only. Imported raw rows may contain OTHER contacts. */
export function createSupplierContactMatcher(query: string, scope: SupplierSearchScope = 'company') {
  const keyword = normalize(query);
  if (!keyword) return (_contact: SupplierContact) => true;

  const emailMatch = (contact: SupplierContact) => [contact.data.email, contact.data.cc]
    .some(value => normalize(value).includes(keyword));
  const phoneQuery = /\p{L}/u.test(keyword) ? '' : digits(keyword);
  const phoneMatch = (contact: SupplierContact) => Boolean(phoneQuery) && [
    contact.data.phone, contact.data.mobile, contact.data.extension,
    `${contact.data.phone ?? ''} ${contact.data.extension ?? ''}`,
  ].some(value => digits(value).includes(phoneQuery));

  if (scope === 'email' || scope === 'all' && keyword.includes('@')) return emailMatch;
  if (scope === 'phone') return phoneMatch;
  if (scope === 'person') {
    const terms = keyword.split(' ');
    return (contact: SupplierContact) => terms.every(term => normalize(contact.data.name).includes(term));
  }

  const terms = keyword.match(/[\p{L}\p{N}]+/gu) ?? [];
  return (contact: SupplierContact) => {
    if (scope === 'all' && phoneMatch(contact)) return true;
    if (!terms.length) return false;
    const values = (scope === 'company' ? companyFields.map(field => contact.data[field]) : Object.values(contact.data)).map(normalize);
    const words = new Set(values.flatMap(value => value.match(/[a-z0-9]+/g) ?? []));
    // ACES matches "ACES ELECTRONICS" and "宏致(ACES)", never ACESCONN.
    // Chinese company/name fragments remain searchable without requiring the full name.
    return terms.every(term => /^[a-z0-9]+$/.test(term) ? words.has(term) : values.some(value => value.includes(term)));
  };
}
