import { emptySupplierData } from '../../src/components/material-requests/supplierDirectory.ts';

// Synthetic directory reproducing ACES vs ACESCONN and mixed-contact source rows.
export const supplierSearchContacts = [
  { company: '吉諾 QA', aliases: 'GENESIS', brands: 'GENESIS', name: 'QA Tony Cho', email: 'tony.cho@acesconn.example.invalid', phone: '02-1234-5678', extension: '0123' },
  { company: '吉諾 QA', aliases: 'GENESIS', brands: 'GENESIS', name: 'QA Lynn Chang', email: 'lynn.chang@acesconn.example.invalid' },
  { company: '宏致 QA', aliases: 'ACES ELECTRONICS CO., LTD.', brands: 'ACES', name: 'QA 王小姐 / Jane Wang', email: 'jane.wang@aces.example.invalid', mobile: '0988-981-318' },
  { company: '連接器 QA', aliases: 'ACESCONN', brands: 'ACESCONN', name: 'QA Alex Chen', email: 'alex@acesconn.example.invalid' },
  { company: '代理商 QA', aliases: 'Demo Distributor', brands: 'GENESIS / ACES', name: 'QA Michael Lin', email: 'michael@dist.example.invalid' },
  { company: '其他公司 QA', aliases: 'Unrelated Co', brands: 'OtherBrand', name: 'QA Other', email: 'other@example.invalid' },
].map((value, index) => {
  const data = { ...emptySupplierData(), ...value };
  return { id: `search-case-${index}`, version: 1, data, imported: { ...data }, source: {
    group: index === 4 || index % 2 ? 'QA 來源 B' : 'QA 來源 A', file: 'ACES-source.xlsx', sheet: 'ACES', row: index + 2, slot: 1,
    raw: [{ label: '其他聯絡人／未對應欄位', value: 'ACES' }],
  } };
});
