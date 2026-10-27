export const SUPPLIER_FIELDS = {
  company: '公司', aliases: '公司別名／英文名', brands: '代理品牌', name: '聯絡人', title: '職稱',
  department: '部門', email: 'Email', cc: '副本 Email', phone: '公司電話', mobile: '手機', extension: '分機',
  category: '分類', address: '地址', code: '廠商代碼', pvl: 'PVL', note: '備註',
} as const;
export type SupplierField = keyof typeof SUPPLIER_FIELDS;
export type SupplierData = Record<SupplierField, string>;
export type SupplierSource = { group: string; file: string; sheet: string; row: number; slot: number; fields?: SupplierField[]; raw: { label: string; value: string }[] };
export type SupplierContact = { id: string; data: SupplierData; source: SupplierSource; imported: SupplierData; version: number };
export type SupplierSheet = { file: string; sheet: string; group: string; rows: unknown[][]; merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] };
export type SupplierColumn = SupplierField | 'nameAlt' | 'manager' | 'managerEmail' | 'managerPhone' | '';
export type SupplierMapping = { header: number; columns: SupplierColumn[] };
export const SUPPLIER_COLUMNS = { '': '保留原欄位（不對應）', ...SUPPLIER_FIELDS, nameAlt: '聯絡人另一語言姓名', manager: '主管姓名（另一窗口）', managerEmail: '主管 Email', managerPhone: '主管電話' };
export const emptySupplierData = (): SupplierData => Object.fromEntries(Object.keys(SUPPLIER_FIELDS).map(key => [key, ''])) as SupplierData;
const text = (v: unknown) => typeof v === 'string' || typeof v === 'number' && Number.isFinite(v) || typeof v === 'boolean' ? String(v).trim() : '';
const key = (v: string) => v.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const headerKey = (v: unknown) => text(v).toLowerCase().replace(/[\s_\-()（）/]/g, '');
const aliasGroups: [SupplierColumn, string[]][] = [
  ['company', ['company','company name','vendor','vendor name','vendor 中文','廠商(中)','公司','廠商','廠商名稱','供應商','供應商名稱','原廠/代理商','Disty']],
  ['aliases', ['vendor 英文','廠商(英)','公司別名','公司英文名稱']],
  ['brands', ['Brand','Brand Name','代理原廠英文+中文','代理品牌']],
  ['name', ['Name','CN NAME','NAME(C)','Contact Window中文','業務中文名','Sales','聯絡人','聯絡人姓名']],
  ['nameAlt', ['EN NAME','NAME(E)','name2','Contact Window英文','業務英文名']],
  ['title', ['Title','Job title','JOB POSITION','職稱','Role']],
  ['department', ['Division','部門']],
  ['email', ['email','電子郵件地址','電子郵件','電子信箱','信箱','E-Mail Address','mail','收件人']],
  ['cc', ['cc','副本']], ['phone', ['Phone','TEL','Telephone','商務電話','公司電話','電話']],
  ['mobile', ['Mobile','Cellphone','Cell','行動電話','手機']], ['extension', ['分機','extension']],
  ['category', ['Category','PN前四碼/Category','大分類','分類']],
  ['address', ['Address','地址']], ['code', ['Vendor Code','V/C','廠商代碼']], ['pvl', ['PVL','PVL(Y/N)','是否為PVL']],
  ['note', ['Remark','Remarks','Note','備註','Maker or Disty','代理商/原廠','Factory','Sourcer','Check Sourcer','Payment term']],
  ['manager', ['manager','主管姓名']], ['managerEmail', ['主管Email']], ['managerPhone', ['主管電話']],
];
const aliases = new Map(aliasGroups.flatMap(([field, values]) => values.map(v => [headerKey(v), field] as const)));

export function detectSupplierMapping(rows: unknown[][]): SupplierMapping {
  let best: SupplierMapping = { header: 0, columns: [] }, score = 0;
  rows.slice(0, 30).forEach((row, header) => {
    let manager = false;
    const columns = row.map(value => {
      let field = aliases.get(headerKey(value)) ?? '';
      if (field === 'manager') manager = true;
      if (manager && field === 'email') field = 'managerEmail';
      if (manager && field === 'phone') field = 'managerPhone';
      return field;
    });
    const fields = new Set(columns.filter(Boolean));
    const candidateScore = (fields.has('company') || fields.has('brands') || fields.has('aliases')) && (fields.has('email') || fields.has('name')) ? fields.size : 0;
    if (candidateScore > score) { best = { header, columns }; score = candidateScore; }
  });
  return best;
}

export function supplierEmails(value: string): string[] {
  return [...new Set((value.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}/gi) ?? []).map(v => v.toLowerCase())
    .filter(v => v.length <= 254 && v.split('@')[0].length <= 64 && !v.startsWith('.') && !v.includes('..') && !v.includes('.@')))];
}
export function validateSupplierData(data: SupplierData): string[] {
  const errors: string[] = [];
  if (!data.company?.trim()) errors.push('公司不可空白');
  for (const field of Object.keys(SUPPLIER_FIELDS) as SupplierField[]) {
    if (typeof data[field] !== 'string' || data[field].length > 6000 || data[field].includes('\0')) errors.push(`${SUPPLIER_FIELDS[field]}格式或長度不正確`);
  }
  for (const field of ['email', 'cc'] as const) {
    if (data[field] && data[field].split(/[;,\n]+/).some(v => !supplierEmails(v.trim()).includes(v.trim().toLowerCase()))) errors.push(`${SUPPLIER_FIELDS[field]}格式不正確`);
  }
  return errors;
}

export function parseSupplierSheet(sheet: SupplierSheet, mapping = detectSupplierMapping(sheet.rows)) {
  const contacts: SupplierContact[] = [], issues: { row: number; message: string }[] = [];
  if (!mapping.columns.some(field => ['company', 'aliases', 'brands'].includes(field))) return { contacts, issues: [{ row: mapping.header + 1, message: '未辨識公司欄位，請設定表頭與欄位對應或略過此工作表' }], mapping };
  const cell = (r: number, c: number) => {
    const merge = sheet.merges.find(m => r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c);
    return text(sheet.rows[merge?.s.r ?? r]?.[merge?.s.c ?? c]);
  };
  for (let r = mapping.header + 1; r < sheet.rows.length; r++) {
    if (!sheet.rows[r]?.some(value => text(value))) continue;
    const data = emptySupplierData();
    const raw = sheet.rows[r].map((_, c) => ({ label: `${text(sheet.rows[mapping.header]?.[c]) || `欄 ${c + 1}`}`, value: cell(r, c) })).filter(x => x.label && x.value);
    let managerName = '', managerEmail = '', managerPhone = '', nameAlt = '';
    mapping.columns.forEach((field, c) => {
      const value = cell(r, c);
      if (!field || !value) return;
      if (field === 'manager') managerName = value;
      else if (field === 'managerEmail') managerEmail = value;
      else if (field === 'managerPhone') managerPhone = value;
      else if (field === 'nameAlt') nameAlt = [nameAlt, value].filter(Boolean).join(' / ');
      else {
        const target = field;
        data[target] = [data[target], value].filter(Boolean).join(target === 'name' ? ' / ' : '\n');
      }
    });
    data.name = [data.name, nameAlt].filter(Boolean).join(' / ');
    if (!data.company || /^(?:n\/?a|不適用|無|[-—–]+)$/i.test(data.company) && (data.aliases || data.brands)) {
      data.company = data.aliases || data.brands;
      if (data.company === data.aliases) data.aliases = '';
    }
    if (!data.company || aliases.has(headerKey(data.email)) && aliases.has(headerKey(data.company))) {
      issues.push({ row: r + 1, message: '公司空白或重複表頭，此列未加入' }); continue;
    }
    const add = (entry: SupplierData, slot: number) => {
      for (const field of ['email', 'cc'] as const) {
        const emails = supplierEmails(entry[field]).join('; ');
        if (entry[field] && key(entry[field]) !== key(emails)) issues.push({ row: r + 1, message: `${SUPPLIER_FIELDS[field]}已擷取有效地址，請核對；原值保留於來源欄位` });
        entry[field] = emails;
      }
      const errors = validateSupplierData(entry);
      if (errors.length) { issues.push({ row: r + 1, message: errors.join('；') }); return; }
      const fields = new Set<SupplierField>(['company']);
      mapping.columns.forEach(field => {
        if (field === 'nameAlt' || field === 'manager') fields.add('name');
        else if (field === 'managerEmail') fields.add('email');
        else if (field === 'managerPhone') fields.add('phone');
        else if (field) fields.add(field);
      });
      if (slot === 2) fields.add('title');
      contacts.push({ id: crypto.randomUUID(), data: entry, imported: { ...entry }, version: 0, source: { group: sheet.group, file: sheet.file, sheet: sheet.sheet, row: r + 1, slot, fields: [...fields], raw } });
    };
    if (data.name || data.email || data.phone || data.mobile || !managerName && !managerEmail) add(data, 1);
    if (managerName || managerEmail || managerPhone) add({ ...data, name: managerName, email: managerEmail, phone: managerPhone, mobile: '', extension: '', cc: '', title: '主管' }, 2);
  }
  return { contacts, issues, mapping };
}

const companyNames = (d: SupplierData) => [d.company, ...d.aliases.split(/[;；\n]+/)].map(key).filter(Boolean);
function sameSupplierIdentity(prior: SupplierContact, incoming: SupplierContact, email: boolean) {
  const a = prior.imported, b = incoming.data;
  if (!companyNames(a).some(name => companyNames(b).includes(name))) return false;
  if (email) return supplierEmails(a.email).sort().join(';') === supplierEmails(b.email).sort().join(';');
  return a.name.split(' / ').map(key).some(name => b.name.split(' / ').map(key).includes(name));
}
export function changedSupplierFields(prior: SupplierContact, incoming: SupplierContact): SupplierField[] {
  return (Object.keys(SUPPLIER_FIELDS) as SupplierField[]).filter(f => (!incoming.source.fields || incoming.source.fields.includes(f)) && incoming.data[f] !== prior.imported[f]);
}
export type SupplierDiff = { key: string; kind: 'added' | 'changed' | 'unchanged' | 'conflict' | 'ambiguous' | 'missing'; incoming?: SupplierContact; existing?: SupplierContact; candidates?: SupplierContact[]; fields: SupplierField[]; rawChanged?: boolean };
export function diffSupplierImport(existing: readonly SupplierContact[], incoming: readonly SupplierContact[], groups: string[]): SupplierDiff[] {
  const used = new Set<string>();
  const result: SupplierDiff[] = incoming.map(contact => {
    const candidates = existing.filter(x => x.source.group === contact.source.group);
    const exact = candidates.filter(x => contact.data.email && sameSupplierIdentity(x, contact, true));
    let matches = exact.length ? exact : candidates.filter(x => contact.data.name && sameSupplierIdentity(x, contact, false));
    if (!contact.data.email && !contact.data.name) matches = candidates.filter(x => !x.imported.email && !x.imported.name
      && companyNames(x.imported).some(name => companyNames(contact.data).includes(name))
      && (contact.data.phone || contact.data.mobile ? ['phone','mobile'].some(field => contact.data[field as SupplierField] && key(x.imported[field as SupplierField]) === key(contact.data[field as SupplierField])) : !x.imported.phone && !x.imported.mobile));
    for (const field of ['brands', 'category'] as const) {
      if (matches.length > 1 && contact.data[field]) {
        const matchingField = matches.filter(x => key(x.imported[field]) === key(contact.data[field]));
        if (matchingField.length) matches = matchingField;
      }
    }
    if (matches.length > 1) {
      const sameSheet = matches.filter(x => x.source.sheet === contact.source.sheet && x.source.slot === contact.source.slot);
      if (sameSheet.length) matches = sameSheet;
    }
    if (matches.length > 1) {
      const unchanged = matches.filter(x => !used.has(x.id) && changedSupplierFields(x, contact).length === 0 && JSON.stringify(x.source.raw) === JSON.stringify(contact.source.raw));
      // Equivalent unchanged rows never write; pairing them only prevents duplicate additions.
      if (unchanged.length) matches = [unchanged.find(x => x.source.row === contact.source.row) ?? unchanged[0]];
    }
    if (matches.length > 1 || matches.length === 1 && used.has(matches[0].id)) return { key: contact.id, kind: 'ambiguous', incoming: contact, candidates: matches, fields: [] };
    const prior = matches[0];
    if (!prior) return { key: contact.id, kind: 'added', incoming: contact, fields: [] };
    used.add(prior.id);
    const fields = changedSupplierFields(prior, contact);
    const rawChanged = JSON.stringify(prior.source.raw) !== JSON.stringify(contact.source.raw);
    const conflict = fields.some(f => prior.data[f] !== prior.imported[f] && prior.data[f] !== contact.data[f]);
    return { key: contact.id, kind: conflict ? 'conflict' : fields.length || rawChanged ? 'changed' : 'unchanged', incoming: contact, existing: prior, fields, rawChanged };
  });
  return [...result, ...existing.filter(x => groups.includes(x.source.group) && !used.has(x.id)).map(x => ({ key: x.id, kind: 'missing' as const, existing: x, fields: [] }))];
}

export function supplierImportChange(diff: SupplierDiff): SupplierContact {
  if (!diff.incoming || diff.kind === 'missing' || diff.kind === 'ambiguous') throw new Error('請先解決不明確的聯絡人對應');
  if (!diff.existing) return diff.incoming;
  const data = { ...diff.existing.data };
  for (const field of diff.fields) data[field] = diff.incoming.data[field];
  const imported = { ...diff.existing.imported };
  for (const field of diff.incoming.source.fields ?? Object.keys(SUPPLIER_FIELDS) as SupplierField[]) imported[field] = diff.incoming.data[field];
  return { ...diff.incoming, id: diff.existing.id, version: diff.existing.version, data, imported };
}

const recipientCompanyKey = (value: string) => key(value).replace(/[.,]/g, '')
  .replace(/(?:\s+(?:co|company|corp|corporation|inc|incorporated|ltd|limited))+$/, '').trim();

export function getCompanyRecipients(contacts: readonly SupplierContact[], vendor: string) {
  const wanted = recipientCompanyKey(vendor);
  const matched = wanted ? contacts.filter(x => [x.data.company, ...x.data.aliases.split(/[;；\n]+/), ...x.data.brands.split(/[,，;；\n/、]+/)].some(name => recipientCompanyKey(name) === wanted)) : [];
  const to = [...new Set(matched.flatMap(x => supplierEmails(x.data.email)))];
  const cc = [...new Set(matched.flatMap(x => supplierEmails(x.data.cc)))].filter(x => !to.includes(x));
  return { to: to.join('; '), cc: cc.join('; '), matched };
}
